import { describe, expect, it } from "vitest";
import { createCancelHandler } from "../app/api/process/cancel/route";
import { createProcessHandler } from "../app/api/process/route";
import { parseRunnerConfig } from "../lib/colab-job-runner";
import { JobCancelledError, QueueCapacityError } from "../lib/colab-errors";
import type { ProcessInput } from "../lib/colab-input";
import { ProcessJobRegistry, parseProcessJobId } from "../lib/process-job-registry";

const processingCode = "0123456789abcdef0123456789abcdef";
const jobId = "9bc368f7-0f53-4ebd-80c2-1d1bdfe94c98";
const secondJobId = "6c499b5d-ca00-4cd2-a536-1cc4c4087370";
const thirdJobId = "a8f850bd-26f9-46d4-874a-39cc32e056d8";
const fourthJobId = "5ec3a8e9-4226-42b9-830a-35c7c539aec2";
const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");

const config = parseRunnerConfig({
  IMAGEWORK_HF_TOKEN: "test-token-not-a-real-secret",
  IMAGEWORK_PROCESSING_CODE: processingCode,
  IMAGEWORK_COLAB_AUTH_MODE: "adc",
  IMAGEWORK_GOOGLE_APPLICATION_CREDENTIALS: "/tmp/imagework-test-adc.json",
  IMAGEWORK_COLAB_CONFIG: "/tmp/imagework-test-config",
  IMAGEWORK_COLAB_ACCELERATOR: "T4",
  IMAGEWORK_JOB_TIMEOUT_SECONDS: "60",
  IMAGEWORK_JOB_SCRIPT: "/tmp/imagework-test-worker.py",
  IMAGEWORK_JOB_TMP_ROOT: "/tmp/imagework-test-jobs",
  IMAGEWORK_RECOVERY_ROOT: "/tmp/imagework-test-recovery",
  IMAGEWORK_MAX_QUEUE_DEPTH: "4",
});

const cancelRequest = (id: string, code = processingCode): Request => new Request("http://localhost/api/process/cancel", {
  method: "POST",
  body: JSON.stringify({ jobId: id, processingCode: code }),
  headers: { "Content-Type": "application/json" },
});

const processRequest = (id: string, processingHeader = processingCode, contentLength?: string): Request => {
  const formData = new FormData();
  formData.set("jobId", id);
  formData.set("file", new File([png], "source.png", { type: "image/png" }));
  formData.set("mode", "photo");
  formData.set("outputFormat", "zip");
  formData.set("cx", "0.5");
  formData.set("cy", "0.5");
  formData.set("width", "0.8");
  formData.set("height", "0.8");
  formData.set("processingCode", processingCode);
  const headers = new Headers({ "x-imagework-processing-code": processingHeader });
  if (contentLength) headers.set("content-length", contentLength);
  const request = new Request("http://localhost/api/process", { method: "POST", headers });
  Object.defineProperty(request, "formData", { value: async () => formData });
  return request;
};

class ControlledRunner {
  readonly started = Promise.withResolvers<void>();
  readonly release = Promise.withResolvers<void>();
  allocations = 0;
  cleanupComplete = false;
  stopAttempted = false;

  async run(_input: ProcessInput, signal?: AbortSignal): Promise<{ readonly name: "imagework-results.zip"; readonly bytes: Buffer; readonly contentType: "application/zip" }> {
    if (signal?.aborted) throw new JobCancelledError();
    this.allocations += 1;
    this.started.resolve();
    return new Promise((resolve, reject) => {
      signal?.addEventListener("abort", () => {
        this.cleanupComplete = true;
        this.stopAttempted = true;
        reject(new JobCancelledError());
      }, { once: true });
      this.release.promise.then(() => resolve({ name: "imagework-results.zip", bytes: Buffer.from([]), contentType: "application/zip" }));
    });
  }
}

class QueueFullRunner {
  async run(): Promise<{ readonly name: "imagework-results.zip"; readonly bytes: Buffer; readonly contentType: "application/zip" }> {
    throw new QueueCapacityError();
  }
}

describe("explicit process cancellation", () => {
  it("records a cancel-before-registration race and gives the later queue signal no allocation path", async () => {
    const registry = new ProcessJobRegistry();
    const handler = createCancelHandler(() => config, registry);

    expect((await handler(cancelRequest(jobId))).status).toBe(202);
    expect(registry.register(parseProcessJobId(jobId)).aborted).toBe(true);
    registry.complete(parseProcessJobId(jobId));
  });

  it("uses the cancel endpoint to prevent a queued job from allocating a second worker", async () => {
    const registry = new ProcessJobRegistry();
    const runner = new ControlledRunner();
    const process = createProcessHandler(() => runner, registry, () => config);
    const cancel = createCancelHandler(() => config, registry);
    const first = process(processRequest(jobId));
    await runner.started.promise;

    expect((await cancel(cancelRequest(secondJobId))).status).toBe(202);
    expect((await process(processRequest(secondJobId))).status).toBe(499);
    expect(runner.allocations).toBe(1);
    runner.release.resolve();
    expect((await first).status).toBe(200);
  });

  it("rejects an oversized declared request or an invalid early processing-code header before allocation", async () => {
    const registry = new ProcessJobRegistry();
    const runner = new ControlledRunner();
    const process = createProcessHandler(() => runner, registry, () => config);

    expect((await process(processRequest(jobId, processingCode, String(12 * 1024 * 1024)))).status).toBe(400);
    expect((await process(processRequest(secondJobId, "incorrect"))).status).toBe(400);
    expect(runner.allocations).toBe(0);
  });

  it("maps a full server queue to a retryable response", async () => {
    const process = createProcessHandler(() => new QueueFullRunner(), new ProcessJobRegistry(), () => config);

    const response = await process(processRequest(jobId));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: "현재 요청이 많습니다. 잠시 후 다시 시도해 주세요." });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("sets non-cacheable nosniff headers on successful processing and cancellation", async () => {
    const registry = new ProcessJobRegistry();
    const runner = new ControlledRunner();
    const process = createProcessHandler(() => runner, registry, () => config);
    const cancel = createCancelHandler(() => config, registry);
    const active = process(processRequest(jobId));
    await runner.started.promise;
    const accepted = await cancel(cancelRequest(jobId));
    const completed = await active;

    for (const response of [accepted, completed]) {
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });

  it("uses the cancel endpoint to abort an active job through cleanup and stop", async () => {
    const registry = new ProcessJobRegistry();
    const runner = new ControlledRunner();
    const process = createProcessHandler(() => runner, registry, () => config);
    const cancel = createCancelHandler(() => config, registry);
    const active = process(processRequest(jobId));
    await runner.started.promise;

    expect((await cancel(cancelRequest(jobId))).status).toBe(202);
    expect((await active).status).toBe(499);
    expect(runner.cleanupComplete).toBe(true);
    expect(runner.stopAttempted).toBe(true);
  });

  it("rejects an incorrect processing code without cancelling a registered job", async () => {
    const registry = new ProcessJobRegistry();
    const handler = createCancelHandler(() => config, registry);
    const signal = registry.register(parseProcessJobId(jobId));

    expect((await handler(cancelRequest(jobId, "incorrect"))).status).toBe(400);
    expect(signal.aborted).toBe(false);
    registry.complete(parseProcessJobId(jobId));
  });

  it("returns a safe accepted response for an unknown or completed job", async () => {
    const registry = new ProcessJobRegistry();
    const handler = createCancelHandler(() => config, registry);

    expect((await handler(cancelRequest(jobId))).status).toBe(202);
    registry.complete(parseProcessJobId(jobId));
    expect((await handler(cancelRequest(jobId))).status).toBe(202);
  });

  it("expires a pending cancellation so an old unknown UUID cannot occupy memory indefinitely", () => {
    let now = 0;
    const registry = new ProcessJobRegistry({ now: () => now, pendingCancelTtlMs: 1_000, maxPendingCancels: 2 });
    registry.cancel(parseProcessJobId(jobId));
    now = 1_001;

    expect(registry.register(parseProcessJobId(jobId)).aborted).toBe(false);
    registry.complete(parseProcessJobId(jobId));
  });

  it("evicts the oldest pending cancellation when capacity is exhausted", () => {
    const registry = new ProcessJobRegistry({ pendingCancelTtlMs: 60_000, maxPendingCancels: 2 });
    registry.cancel(parseProcessJobId(jobId));
    registry.cancel(parseProcessJobId(secondJobId));
    registry.cancel(parseProcessJobId(thirdJobId));

    expect(registry.register(parseProcessJobId(jobId)).aborted).toBe(false);
    expect(registry.register(parseProcessJobId(secondJobId)).aborted).toBe(true);
    expect(registry.register(parseProcessJobId(thirdJobId)).aborted).toBe(true);
    registry.complete(parseProcessJobId(jobId));
    registry.complete(parseProcessJobId(secondJobId));
    registry.complete(parseProcessJobId(thirdJobId));
    expect(registry.register(parseProcessJobId(fourthJobId)).aborted).toBe(false);
    registry.complete(parseProcessJobId(fourthJobId));
  });
});
