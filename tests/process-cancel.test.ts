import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCancelHandler } from "../app/api/process/cancel/route";
import { parseRunnerConfig } from "../lib/local-job-runner";
import { ProcessJobRegistry, parseProcessJobId } from "../lib/process-job-registry";

const processingCode = "0123456789abcdef0123456789abcdef";
const jobId = "9bc368f7-0f53-4ebd-80c2-1d1bdfe94c98";
const secondJobId = "6c499b5d-ca00-4cd2-a536-1cc4c4087370";

// The configured job root and every result path live in a per-test tree inside os.tmpdir(), so the
// registry's expiry cleanup can only ever delete inside it.
let fixtureRoot = "";
let config: ReturnType<typeof parseRunnerConfig>;
const temporaryPaths: string[] = [];
const registries: ProcessJobRegistry[] = [];

const makeRegistry = (...args: ConstructorParameters<typeof ProcessJobRegistry>): ProcessJobRegistry => {
  const registry = new ProcessJobRegistry(...args);
  registries.push(registry);
  return registry;
};

const configFor = (root: string) => parseRunnerConfig({
  IMAGEWORK_PROCESSING_CODE: processingCode,
  IMAGEWORK_WORKER_PYTHON: "/usr/bin/python3",
  IMAGEWORK_WORKER_SCRIPT: "/opt/imagework/local-worker.py",
  IMAGEWORK_MODEL_CACHE: "/opt/imagework/model-cache",
  IMAGEWORK_VTRACER_BIN: "/usr/local/bin/vtracer",
  IMAGEWORK_JOB_TIMEOUT_SECONDS: "60",
  IMAGEWORK_JOB_TMP_ROOT: join(root, "jobs"),
  IMAGEWORK_MAX_QUEUE_DEPTH: "4",
  IMAGEWORK_RESULT_TTL_SECONDS: "600",
});

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "imagework-cancel-test-"));
  temporaryPaths.push(fixtureRoot);
  config = configFor(fixtureRoot);
});

afterEach(async () => {
  await Promise.all(registries.splice(0).map((registry) => registry.dispose?.()));
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

const cancelRequest = (id: string, code = processingCode): Request => new Request("http://localhost/api/process/cancel", {
  method: "POST",
  body: JSON.stringify({ jobId: id, processingCode: code }),
  headers: { "Content-Type": "application/json" },
});

describe("explicit process cancellation", () => {
  it("등록 전에 먼저 도착한 취소 요청은 이후 등록되는 신호를 이미 중단된 상태로 만든다", async () => {
    const registry = makeRegistry();
    const handler = createCancelHandler(() => config, registry);

    expect((await handler(cancelRequest(jobId))).status).toBe(202);

    expect(registry.register(parseProcessJobId(jobId)).aborted).toBe(true);
  });

  it("형식이 잘못된 요청 바디를 400으로 거부한다", async () => {
    const handler = createCancelHandler(() => config, makeRegistry());
    const missingJobId = new Request("http://localhost/api/process/cancel", {
      method: "POST",
      body: JSON.stringify({ processingCode }),
      headers: { "Content-Type": "application/json" },
    });
    const malformedJobId = new Request("http://localhost/api/process/cancel", {
      method: "POST",
      body: JSON.stringify({ jobId: "not-a-uuid", processingCode }),
      headers: { "Content-Type": "application/json" },
    });

    expect((await handler(missingJobId)).status).toBe(400);
    expect((await handler(malformedJobId)).status).toBe(400);
  });

  it("처리 코드가 일치하지 않으면 등록된 작업을 취소하지 않고 400을 반환한다", async () => {
    const registry = makeRegistry();
    const handler = createCancelHandler(() => config, registry);
    const signal = registry.register(parseProcessJobId(jobId));

    const response = await handler(cancelRequest(jobId, "incorrect"));

    expect(response.status).toBe(400);
    expect(signal.aborted).toBe(false);
  });

  it("올바른 취소 요청은 대기 중인 작업을 취소 상태로 전이시키고 202를 반환한다", async () => {
    const registry = makeRegistry();
    const handler = createCancelHandler(() => config, registry);
    const signal = registry.register(parseProcessJobId(jobId));

    const response = await handler(cancelRequest(jobId));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(signal.aborted).toBe(true);
    expect(registry.read(parseProcessJobId(jobId))?.state).toBe("cancelled");
  });

  it("처리 중인 작업도 취소 상태로 전이시킨다", async () => {
    const registry = makeRegistry();
    const handler = createCancelHandler(() => config, registry);
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);

    const response = await handler(cancelRequest(jobId));

    expect(response.status).toBe(202);
    expect(registry.read(id)?.state).toBe("cancelled");
  });

  it("존재하지 않거나 이미 종료된 작업에 대한 취소도 안전하게 202를 반환한다", async () => {
    const registry = makeRegistry();
    const handler = createCancelHandler(() => config, registry);
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markDone(id, join(fixtureRoot, "jobs", "result.png"));

    expect((await handler(cancelRequest(secondJobId))).status).toBe(202); // never registered
    expect((await handler(cancelRequest(jobId))).status).toBe(202); // already done
    expect(registry.read(id)?.state).toBe("done"); // untouched by the redundant cancel
  });

  it("성공 응답에 캐시 방지·스니핑 방지 헤더를 설정한다", async () => {
    const handler = createCancelHandler(() => config, makeRegistry());

    const response = await handler(cancelRequest(jobId));

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
