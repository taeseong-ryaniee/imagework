import { describe, expect, it } from "vitest";
import { ProcessJobRegistry, parseProcessJobId } from "../lib/process-job-registry";

const jobId = "9bc368f7-0f53-4ebd-80c2-1d1bdfe94c98";
const secondJobId = "6c499b5d-ca00-4cd2-a536-1cc4c4087370";
const thirdJobId = "a8f850bd-26f9-46d4-874a-39cc32e056d8";
const resultPath = "/tmp/imagework-test-jobs/result.png";

describe("ProcessJobRegistry", () => {
  it("queued에서 processing을 거쳐 done으로 전이하고 상태별 필드 형태를 유지한다", () => {
    const registry = new ProcessJobRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    expect(registry.read(id)).toEqual({ state: "queued", queuePosition: 1 });

    registry.markProcessing(id);
    expect(registry.read(id)).toEqual({ state: "processing" });

    registry.markDone(id, resultPath);
    const done = registry.read(id);
    expect(done?.state).toBe("done");
    expect(done?.resultPath).toBe(resultPath);
    expect(done?.errorKind).toBeUndefined();
    expect(done?.expiresAt).toBeGreaterThan(Date.now());
    expect(done).not.toHaveProperty("queuePosition");
  });

  it("queued에서 processing을 거쳐 failed로 전이하며 errorKind를 보존한다", () => {
    const registry = new ProcessJobRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);

    registry.markFailed(id, "inference");

    expect(registry.read(id)).toMatchObject({ state: "failed", errorKind: "inference" });
    expect(registry.read(id)?.resultPath).toBeUndefined();
  });

  it("queued에서 processing을 거쳐 cancelled로 전이한다", () => {
    const registry = new ProcessJobRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);

    registry.markCancelled(id);

    expect(registry.read(id)?.state).toBe("cancelled");
  });

  it("cancel은 queued 또는 processing만 cancelled로 전이시키고 이미 종료된 작업은 그대로 둔다", () => {
    const registry = new ProcessJobRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markDone(id, resultPath);

    registry.cancel(id);

    expect(registry.read(id)?.state).toBe("done");
  });

  it("queued가 아닌 작업에 markProcessing을 호출해도 아무 효과가 없다", () => {
    const registry = new ProcessJobRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markDone(id, resultPath);

    registry.markProcessing(id);

    expect(registry.read(id)?.state).toBe("done");
  });

  it("결과 TTL이 만료되면 조회 결과가 존재하지 않는 jobId와 동일해진다", () => {
    let now = 0;
    const registry = new ProcessJobRegistry({ now: () => now, resultTtlMs: 1_000 });
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markDone(id, resultPath);
    expect(registry.read(id)?.state).toBe("done");

    now = 1_001;

    expect(registry.read(id)).toBeUndefined();
  });

  it("등록 전에 먼저 도착한 취소는 pending TTL 안에서 등록 시 그대로 해소된다", () => {
    const now = 0;
    const registry = new ProcessJobRegistry({ now: () => now, pendingCancelTtlMs: 1_000, maxPendingCancels: 2 });
    const id = parseProcessJobId(jobId);
    registry.cancel(id);

    expect(registry.register(id).aborted).toBe(true);
  });

  it("등록 전에 먼저 도착한 취소는 pending TTL이 지나면 더 이상 유효하지 않다", () => {
    let now = 0;
    const registry = new ProcessJobRegistry({ now: () => now, pendingCancelTtlMs: 1_000, maxPendingCancels: 2 });
    const id = parseProcessJobId(jobId);
    registry.cancel(id);
    now = 1_001;

    expect(registry.register(id).aborted).toBe(false);
  });

  it("대기 취소 용량을 초과하면 가장 오래된 항목부터 축출한다", () => {
    const registry = new ProcessJobRegistry({ pendingCancelTtlMs: 60_000, maxPendingCancels: 2 });
    registry.cancel(parseProcessJobId(jobId));
    registry.cancel(parseProcessJobId(secondJobId));
    registry.cancel(parseProcessJobId(thirdJobId)); // evicts jobId, the oldest pending entry

    expect(registry.register(parseProcessJobId(jobId)).aborted).toBe(false);
    expect(registry.register(parseProcessJobId(secondJobId)).aborted).toBe(true);
    expect(registry.register(parseProcessJobId(thirdJobId)).aborted).toBe(true);
  });

  it("queuePosition은 1부터 시작해 등록 순서를 따른다", () => {
    const registry = new ProcessJobRegistry();
    registry.register(parseProcessJobId(jobId));
    registry.register(parseProcessJobId(secondJobId));
    registry.register(parseProcessJobId(thirdJobId));

    expect(registry.read(parseProcessJobId(jobId))?.queuePosition).toBe(1);
    expect(registry.read(parseProcessJobId(secondJobId))?.queuePosition).toBe(2);
    expect(registry.read(parseProcessJobId(thirdJobId))?.queuePosition).toBe(3);
  });

  it("앞선 대기 작업이 processing으로 전이하면 뒤따르는 queuePosition이 앞당겨진다", () => {
    const registry = new ProcessJobRegistry();
    registry.register(parseProcessJobId(jobId));
    registry.register(parseProcessJobId(secondJobId));
    registry.register(parseProcessJobId(thirdJobId));

    registry.markProcessing(parseProcessJobId(jobId));

    expect(registry.read(parseProcessJobId(jobId))).not.toHaveProperty("queuePosition");
    expect(registry.read(parseProcessJobId(secondJobId))?.queuePosition).toBe(1);
    expect(registry.read(parseProcessJobId(thirdJobId))?.queuePosition).toBe(2);
  });
});
