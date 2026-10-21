import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProcessHandler } from "../app/api/process/route";
import { createStatusHandler } from "../app/api/process/status/route";
import { createResultHandler } from "../app/api/process/result/route";
import { JobCancelledError, RunnerConfigurationError } from "../lib/job-errors";
import type { ProcessInput } from "../lib/image-input";
import { ProcessJobRegistry, parseProcessJobId } from "../lib/process-job-registry";

const processingCode = "0123456789abcdef0123456789abcdef";
const config = { processingCode };
const jobId = "9bc368f7-0f53-4ebd-80c2-1d1bdfe94c98";
const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");

const processRequest = (id: string, processingHeader = processingCode): Request => {
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
  const request = new Request("http://localhost/api/process", { method: "POST", headers });
  Object.defineProperty(request, "formData", { value: async () => formData });
  return request;
};

const statusRequest = (id: string, code = processingCode): Request => new Request(`http://localhost/api/process/status?jobId=${encodeURIComponent(id)}`, {
  headers: { "x-imagework-processing-code": code },
});

const resultRequest = (id: string, code = processingCode): Request => new Request(`http://localhost/api/process/result?jobId=${encodeURIComponent(id)}`, {
  headers: { "x-imagework-processing-code": code },
});

const flushMicrotasks = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

class DeferredRunner {
  readonly settle = Promise.withResolvers<void>();
  readonly calls: { readonly jobId: string }[] = [];

  async run(id: string, input: ProcessInput, signal: AbortSignal): Promise<void> {
    void input;
    void signal;
    this.calls.push({ jobId: id });
    await this.settle.promise;
  }
}

const temporaryPaths: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("D18 async job API contract", () => {
  it("POST /api/process는 처리 완료를 기다리지 않고 202 {jobId}를 즉시 반환한다", async () => {
    const registry = new ProcessJobRegistry();
    const runner = new DeferredRunner();
    const process = createProcessHandler(() => runner, registry, () => config);

    const response = await process(processRequest(jobId));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ jobId });
    expect(runner.calls).toHaveLength(1); // run() was invoked, but the response did not wait for it to settle
    runner.settle.resolve();
  });

  it("run()이 큐 진입 전에 RunnerConfigurationError로 즉시 거부되면 202 이후 registry가 실패로 보정된다", async () => {
    const registry = new ProcessJobRegistry();
    const runner = { run: async () => { throw new RunnerConfigurationError(); } };
    const process = createProcessHandler(() => runner, registry, () => config);

    expect((await process(processRequest(jobId))).status).toBe(202);
    await flushMicrotasks();

    expect(registry.read(parseProcessJobId(jobId))).toMatchObject({ state: "failed", errorKind: "runnerConfiguration" });
  });

  it("run()이 이미 취소된 signal로 즉시 거부되면 202 이후 registry가 취소로 보정된다", async () => {
    const registry = new ProcessJobRegistry();
    const runner = { run: async () => { throw new JobCancelledError(); } };
    const process = createProcessHandler(() => runner, registry, () => config);

    expect((await process(processRequest(jobId))).status).toBe(202);
    await flushMicrotasks();

    expect(registry.read(parseProcessJobId(jobId))?.state).toBe("cancelled");
  });

  it("status는 queued 상태에서 대기 순번을 포함한 바디를 반환한다", async () => {
    const registry = new ProcessJobRegistry();
    registry.register(parseProcessJobId(jobId));
    const status = createStatusHandler(registry, () => config);

    const response = await status(statusRequest(jobId));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ state: "queued", queuePosition: 1 });
  });

  it("status는 processing 상태에서 상태 값만 포함한 바디를 반환한다", async () => {
    const registry = new ProcessJobRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);
    const status = createStatusHandler(registry, () => config);

    const response = await status(statusRequest(jobId));

    await expect(response.json()).resolves.toEqual({ state: "processing" });
  });

  it("status는 done 상태에서 resultPath를 노출하지 않고 상태 값만 반환한다", async () => {
    const registry = new ProcessJobRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);
    registry.markDone(id, "/tmp/imagework-test/result.png");
    const status = createStatusHandler(registry, () => config);

    const response = await status(statusRequest(jobId));

    await expect(response.json()).resolves.toEqual({ state: "done" });
  });

  it("status는 failed 상태에서 errorKind를 포함한 바디를 반환한다", async () => {
    const registry = new ProcessJobRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);
    registry.markFailed(id, "inference");
    const status = createStatusHandler(registry, () => config);

    const response = await status(statusRequest(jobId));

    await expect(response.json()).resolves.toEqual({ state: "failed", errorKind: "inference" });
  });

  it("status는 cancelled 상태에서 상태 값만 포함한 바디를 반환한다", async () => {
    const registry = new ProcessJobRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markCancelled(id);
    const status = createStatusHandler(registry, () => config);

    const response = await status(statusRequest(jobId));

    await expect(response.json()).resolves.toEqual({ state: "cancelled" });
  });

  it("status는 존재하지 않거나 형식이 잘못된 jobId에 400을 반환한다", async () => {
    const status = createStatusHandler(new ProcessJobRegistry(), () => config);

    expect((await status(statusRequest(jobId))).status).toBe(400); // never registered
    expect((await status(statusRequest("not-a-uuid"))).status).toBe(400);
  });

  it("헤더의 처리 코드가 제출 코드와 다르면 status와 result 모두 400을 반환한다", async () => {
    const registry = new ProcessJobRegistry();
    registry.register(parseProcessJobId(jobId));
    const status = createStatusHandler(registry, () => config);
    const result = createResultHandler(registry, () => config);

    expect((await status(statusRequest(jobId, "wrong-code"))).status).toBe(400);
    expect((await result(resultRequest(jobId, "wrong-code"))).status).toBe(400);
  });

  it("done 상태의 결과를 200으로 스트리밍하고, 다운로드 후 결과 파일과 작업 디렉터리를 정리한다", async () => {
    const root = await mkdtemp(join(tmpdir(), "imagework-async-api-test-"));
    temporaryPaths.push(root);
    const jobDir = join(root, jobId);
    await mkdir(jobDir, { recursive: true, mode: 0o700 });
    const resultPath = join(jobDir, "result.png");
    const bytes = Buffer.from([137, 80, 78, 71]);
    await writeFile(resultPath, bytes, { mode: 0o600 });
    const registry = new ProcessJobRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);
    registry.markDone(id, resultPath);
    const result = createResultHandler(registry, () => config);

    const response = await result(resultRequest(jobId));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Content-Disposition")).toContain("result.png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(bytes));
    await expect(stat(jobDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    { label: "queued", setup: (registry: ProcessJobRegistry, id: ReturnType<typeof parseProcessJobId>) => registry.register(id) },
    { label: "processing", setup: (registry: ProcessJobRegistry, id: ReturnType<typeof parseProcessJobId>) => { registry.register(id); registry.markProcessing(id); } },
    { label: "failed", setup: (registry: ProcessJobRegistry, id: ReturnType<typeof parseProcessJobId>) => { registry.register(id); registry.markFailed(id, "inference"); } },
    { label: "cancelled", setup: (registry: ProcessJobRegistry, id: ReturnType<typeof parseProcessJobId>) => { registry.register(id); registry.markCancelled(id); } },
  ])("$label 상태의 작업은 result에서 400을 반환하며 어떤 바이트도 내주지 않는다 (D22)", async ({ setup }) => {
    const registry = new ProcessJobRegistry();
    setup(registry, parseProcessJobId(jobId));
    const result = createResultHandler(registry, () => config);

    const response = await result(resultRequest(jobId));

    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Disposition")).toBeNull();
  });

  it("result TTL이 만료된 이후에는 400을 반환한다", async () => {
    let now = 0;
    const registry = new ProcessJobRegistry({ now: () => now, resultTtlMs: 1_000 });
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);
    registry.markDone(id, "/tmp/imagework-test/result.png");
    const result = createResultHandler(registry, () => config);
    now = 1_001;

    expect((await result(resultRequest(jobId))).status).toBe(400);
  });

  it("result는 존재하지 않거나 형식이 잘못된 jobId에 400을 반환한다", async () => {
    const result = createResultHandler(new ProcessJobRegistry(), () => config);

    expect((await result(resultRequest(jobId))).status).toBe(400); // never registered
    expect((await result(resultRequest("not-a-uuid"))).status).toBe(400);
  });
});
