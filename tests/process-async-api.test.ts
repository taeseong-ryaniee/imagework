// @vitest-environment node
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProcessHandler } from "../app/api/process/route";
import { createStatusHandler } from "../app/api/process/status/route";
import { createResultHandler } from "../app/api/process/result/route";
import { JobCancelledError, QueueCapacityError, RunnerConfigurationError } from "../lib/job-errors";
import type { ProcessInput } from "../lib/image-input";
import { ProcessJobRegistry, parseProcessJobId } from "../lib/process-job-registry";

// Lets a test block or fail the result route's single file read; the real read runs afterwards.
const hooks = vi.hoisted(() => ({ readFile: undefined as undefined | ((path: unknown) => Promise<void>) }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const readFile = (async (...args: Parameters<typeof actual.readFile>) => {
    await hooks.readFile?.(args[0]);
    return actual.readFile(...args);
  }) as typeof actual.readFile;
  return { ...actual, readFile };
});

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

// Every result path and job root a registry could delete lives under a per-test tree inside os.tmpdir().
let fixtureRoot = "";
const resultFixture = (): string => join(fixtureRoot, "unused", "result.png");
const temporaryPaths: string[] = [];
const registries: ProcessJobRegistry[] = [];

const makeRegistry = (...args: ConstructorParameters<typeof ProcessJobRegistry>): ProcessJobRegistry => {
  const registry = new ProcessJobRegistry(...args);
  registries.push(registry);
  return registry;
};

const exists = (path: string): Promise<boolean> => stat(path).then(() => true, () => false);
const eventually = async (predicate: () => Promise<boolean>, timeoutMs = 2_000): Promise<boolean> => {
  for (let elapsed = 0; elapsed < timeoutMs; elapsed += 10) {
    if (await predicate()) return true;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  return false;
};

const createDoneJob = async (registry: ProcessJobRegistry): Promise<{ readonly jobDir: string; readonly bytes: Buffer }> => {
  const jobDir = join(fixtureRoot, jobId);
  await mkdir(jobDir, { recursive: true, mode: 0o700 });
  const bytes = Buffer.from([137, 80, 78, 71]);
  const resultPath = join(jobDir, "result.png");
  await writeFile(resultPath, bytes, { mode: 0o600 });
  const id = parseProcessJobId(jobId);
  registry.register(id);
  registry.markProcessing(id);
  registry.markDone(id, resultPath);
  return { jobDir, bytes };
};

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "imagework-async-api-test-"));
  temporaryPaths.push(fixtureRoot);
});

afterEach(async () => {
  hooks.readFile = undefined;
  await Promise.all(registries.splice(0).map((registry) => registry.dispose?.()));
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("D18 async job API contract", () => {
  it("POST /api/process는 처리 완료를 기다리지 않고 202 {jobId}를 즉시 반환한다", async () => {
    const registry = makeRegistry();
    const runner = new DeferredRunner();
    const process = createProcessHandler(() => runner, registry, () => config);

    const response = await process(processRequest(jobId));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ jobId });
    expect(runner.calls).toHaveLength(1); // run() was invoked, but the response did not wait for it to settle
    runner.settle.resolve();
  });

  it("run()이 큐 진입 전에 RunnerConfigurationError로 즉시 거부되면 202 이후 registry가 실패로 보정된다", async () => {
    const registry = makeRegistry();
    const runner = { run: async () => { throw new RunnerConfigurationError(); } };
    const process = createProcessHandler(() => runner, registry, () => config);

    expect((await process(processRequest(jobId))).status).toBe(202);
    await flushMicrotasks();

    expect(registry.read(parseProcessJobId(jobId))).toMatchObject({ state: "failed", errorKind: "runnerConfiguration" });
  });

  it("run()이 이미 취소된 signal로 즉시 거부되면 202 이후 registry가 취소로 보정된다", async () => {
    const registry = makeRegistry();
    const runner = { run: async () => { throw new JobCancelledError(); } };
    const process = createProcessHandler(() => runner, registry, () => config);

    expect((await process(processRequest(jobId))).status).toBe(202);
    await flushMicrotasks();

    expect(registry.read(parseProcessJobId(jobId))?.state).toBe("cancelled");
  });

  it("status는 queued 상태에서 대기 순번을 포함한 바디를 반환한다", async () => {
    const registry = makeRegistry();
    registry.register(parseProcessJobId(jobId));
    const status = createStatusHandler(registry, () => config);

    const response = await status(statusRequest(jobId));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ state: "queued", queuePosition: 1 });
  });

  it("status는 processing 상태에서 상태 값만 포함한 바디를 반환한다", async () => {
    const registry = makeRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);
    const status = createStatusHandler(registry, () => config);

    const response = await status(statusRequest(jobId));

    await expect(response.json()).resolves.toEqual({ state: "processing" });
  });

  it("status는 done 상태에서 resultPath를 노출하지 않는다", async () => {
    const registry = makeRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);
    registry.markDone(id, resultFixture());
    const status = createStatusHandler(registry, () => config);

    const response = await status(statusRequest(jobId));

    const body = await response.json() as Record<string, unknown>;
    expect(body.state).toBe("done");
    expect(body).not.toHaveProperty("resultPath");
  });

  it("status는 failed 상태에서 errorKind를 포함한 바디를 반환한다", async () => {
    const registry = makeRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);
    registry.markFailed(id, "inference");
    const status = createStatusHandler(registry, () => config);

    const response = await status(statusRequest(jobId));

    await expect(response.json()).resolves.toEqual({ state: "failed", errorKind: "inference" });
  });

  it("status는 cancelled 상태에서 상태 값만 포함한 바디를 반환한다", async () => {
    const registry = makeRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markCancelled(id);
    const status = createStatusHandler(registry, () => config);

    const response = await status(statusRequest(jobId));

    await expect(response.json()).resolves.toEqual({ state: "cancelled" });
  });

  it("status는 존재하지 않거나 형식이 잘못된 jobId에 400을 반환한다", async () => {
    const status = createStatusHandler(makeRegistry(), () => config);

    expect((await status(statusRequest(jobId))).status).toBe(400); // never registered
    expect((await status(statusRequest("not-a-uuid"))).status).toBe(400);
  });

  it("헤더의 처리 코드가 제출 코드와 다르면 status와 result 모두 400을 반환한다", async () => {
    const registry = makeRegistry();
    registry.register(parseProcessJobId(jobId));
    const status = createStatusHandler(registry, () => config);
    const result = createResultHandler(registry, () => config);

    expect((await status(statusRequest(jobId, "wrong-code"))).status).toBe(400);
    expect((await result(resultRequest(jobId, "wrong-code"))).status).toBe(400);
  });

  it("done 상태의 결과를 200으로 스트리밍하고, 다운로드 후 결과 파일과 작업 디렉터리를 정리한다", async () => {
    const jobDir = join(fixtureRoot, jobId);
    await mkdir(jobDir, { recursive: true, mode: 0o700 });
    const resultPath = join(jobDir, "result.png");
    const bytes = Buffer.from([137, 80, 78, 71]);
    await writeFile(resultPath, bytes, { mode: 0o600 });
    const registry = makeRegistry();
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
    const registry = makeRegistry();
    setup(registry, parseProcessJobId(jobId));
    const result = createResultHandler(registry, () => config);

    const response = await result(resultRequest(jobId));

    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Disposition")).toBeNull();
  });

  it("result TTL이 만료된 이후에는 400을 반환한다", async () => {
    let now = 0;
    const registry = makeRegistry({ now: () => now, resultTtlMs: 1_000 });
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);
    registry.markDone(id, resultFixture());
    const result = createResultHandler(registry, () => config);
    now = 1_001;

    expect((await result(resultRequest(jobId))).status).toBe(400);
  });

  it("result는 존재하지 않거나 형식이 잘못된 jobId에 400을 반환한다", async () => {
    const result = createResultHandler(makeRegistry(), () => config);

    expect((await result(resultRequest(jobId))).status).toBe(400); // never registered
    expect((await result(resultRequest("not-a-uuid"))).status).toBe(400);
  });
  it("status는 done 상태에서 서버가 정한 만료 시각 expiresAt만 추가로 반환한다", async () => {
    const registry = makeRegistry({ now: () => 1_000, resultTtlMs: 7_000 });
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);
    registry.markDone(id, resultFixture());
    const status = createStatusHandler(registry, () => config);

    const body = await (await status(statusRequest(jobId))).json() as Record<string, unknown>;

    expect(body).toEqual({ state: "done", expiresAt: 8_000 });
    expect(body).not.toHaveProperty("resultPath");
  });

  it("OW199 regression F2 sequential single download", async () => {
    const registry = makeRegistry();
    const { jobDir, bytes } = await createDoneJob(registry);
    const result = createResultHandler(registry, () => config);

    const first = await result(resultRequest(jobId));
    expect(first.status).toBe(200);
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(new Uint8Array(bytes));
    const second = await result(resultRequest(jobId));

    expect(second.status).toBe(400);
    expect(await exists(jobDir)).toBe(false);
  });

  it("OW199 regression F2 concurrent single download", async () => {
    const registry = makeRegistry();
    await createDoneJob(registry);
    const result = createResultHandler(registry, () => config);

    const responses = await Promise.all([1, 2, 3].map(() => result(resultRequest(jobId))));
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([200, 400, 400]);
  });

  it("OW199 regression F2 claim survives expiry", async () => {
    let now = 0;
    const registry = makeRegistry({ now: () => now, resultTtlMs: 1_000 });
    const { jobDir, bytes } = await createDoneJob(registry);
    const result = createResultHandler(registry, () => config);
    const gate = Promise.withResolvers<void>();
    let entered = false;
    hooks.readFile = async () => {
      hooks.readFile = undefined;
      entered = true;
      await gate.promise;
    };

    const winner = result(resultRequest(jobId));
    try {
      expect(await eventually(async () => entered)).toBe(true);
      expect((await result(resultRequest(jobId))).status).toBe(400); // the claim is already taken
      now = 1_001;
      registry.read(parseProcessJobId(jobId)); // expiry sweep while the winner still holds its claim
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      expect(await exists(jobDir)).toBe(true);
      expect((await result(resultRequest(jobId))).status).toBe(400);
      expect(await exists(jobDir)).toBe(true);
    } finally {
      gate.resolve();
    }
    const response = await winner;

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(bytes));
    expect(await exists(jobDir)).toBe(false);
  });

  it("OW199 regression F2 failed read consumes claim", async () => {
    const registry = makeRegistry();
    const { jobDir } = await createDoneJob(registry);
    const result = createResultHandler(registry, () => config);
    hooks.readFile = async () => {
      hooks.readFile = undefined;
      throw new Error("simulated read failure");
    };

    const failed = await result(resultRequest(jobId));
    const retry = await result(resultRequest(jobId));

    expect(failed.status).toBe(500);
    expect(retry.status).toBe(400);
    expect(await exists(jobDir)).toBe(false);
  });

  it("OW199 regression F4 provider failure leaves no queued entry", async () => {
    const registry = makeRegistry();
    const process = createProcessHandler(() => { throw new RunnerConfigurationError(); }, registry, () => config);

    const response = await process(processRequest(jobId));

    expect(response.status).toBe(503);
    expect(registry.read(parseProcessJobId(jobId))?.state).toBe("failed");
  });

  it.each([
    { label: "runner not ready", error: () => new RunnerConfigurationError(), status: 503, state: "failed", retryAfter: null },
    { label: "queue full", error: () => new QueueCapacityError(), status: 429, state: "failed", retryAfter: "60" },
    { label: "cancelled before submission", error: () => new JobCancelledError(), status: 499, state: "cancelled", retryAfter: null },
  ])("OW199 regression F4 synchronous refusal terminalizes registration: $label", async ({ error, status, state, retryAfter }) => {
    const registry = makeRegistry();
    const process = createProcessHandler(() => ({ run: () => { throw error(); } }), registry, () => config);

    const response = await process(processRequest(jobId));

    expect(response.status).toBe(status);
    expect(response.headers.get("Retry-After")).toBe(retryAfter);
    expect(registry.read(parseProcessJobId(jobId))?.state).toBe(state);
  });
});
