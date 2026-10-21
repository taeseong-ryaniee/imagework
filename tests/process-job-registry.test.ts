// @vitest-environment node
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessJobRegistry, parseProcessJobId } from "../lib/process-job-registry";

// Test seams over modules the registry imports: a due-time-aware node:timers (inactive unless `controlled`, so every
// other test keeps native timers) and a failure switch in front of rm.
type FakeTimer = { readonly callback: () => void; readonly dueAt: number; fired: boolean; cleared: boolean; unref(): FakeTimer };
const seams = vi.hoisted(() => ({
  controlled: false,
  clock: 0,
  timers: [] as FakeTimer[],
  failRm: undefined as undefined | ((path: unknown) => boolean),
}));
vi.mock("node:timers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:timers")>();
  const setTimeout = ((callback: () => void, delayMs?: number, ...rest: unknown[]) => {
    if (!seams.controlled) return (actual.setTimeout as (...args: unknown[]) => NodeJS.Timeout)(callback, delayMs, ...rest);
    const timer: FakeTimer = { callback, dueAt: seams.clock + (delayMs ?? 0), fired: false, cleared: false, unref: () => timer };
    seams.timers.push(timer);
    return timer as unknown as NodeJS.Timeout;
  }) as typeof actual.setTimeout;
  const clearTimeout = ((handle: unknown) => {
    if (seams.timers.includes(handle as FakeTimer)) (handle as FakeTimer).cleared = true;
    else actual.clearTimeout(handle as NodeJS.Timeout);
  }) as typeof actual.clearTimeout;
  return { ...actual, setTimeout, clearTimeout };
});
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const rm = (async (...args: Parameters<typeof actual.rm>) => {
    if (seams.failRm?.(args[0])) throw Object.assign(new Error("EBUSY"), { code: "EBUSY" });
    return actual.rm(...args);
  }) as typeof actual.rm;
  return { ...actual, rm };
});

const jobId = "9bc368f7-0f53-4ebd-80c2-1d1bdfe94c98";
const secondJobId = "6c499b5d-ca00-4cd2-a536-1cc4c4087370";
const thirdJobId = "a8f850bd-26f9-46d4-874a-39cc32e056d8";

// Every result path the registry could delete lives under a per-test tree inside os.tmpdir().
let fixtureRoot = "";
let resultPath = "";
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

const writeResult = async (name = "job"): Promise<string> => {
  const directory = join(fixtureRoot, name);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "result.png");
  await writeFile(path, Buffer.from([137, 80, 78, 71]), { mode: 0o600 });
  return path;
};

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "imagework-registry-test-"));
  temporaryPaths.push(fixtureRoot);
  resultPath = join(fixtureRoot, "jobs", "result.png");
});

afterEach(async () => {
  await Promise.all(registries.splice(0).map((registry) => registry.dispose?.()));
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("ProcessJobRegistry", () => {
  it("queued에서 processing을 거쳐 done으로 전이하고 상태별 필드 형태를 유지한다", () => {
    const registry = makeRegistry();
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
    const registry = makeRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);

    registry.markFailed(id, "inference");

    expect(registry.read(id)).toMatchObject({ state: "failed", errorKind: "inference" });
    expect(registry.read(id)?.resultPath).toBeUndefined();
  });

  it("queued에서 processing을 거쳐 cancelled로 전이한다", () => {
    const registry = makeRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);

    registry.markCancelled(id);

    expect(registry.read(id)?.state).toBe("cancelled");
  });

  it("cancel은 queued 또는 processing만 cancelled로 전이시키고 이미 종료된 작업은 그대로 둔다", () => {
    const registry = makeRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markDone(id, resultPath);

    registry.cancel(id);

    expect(registry.read(id)?.state).toBe("done");
  });

  it("queued가 아닌 작업에 markProcessing을 호출해도 아무 효과가 없다", () => {
    const registry = makeRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markDone(id, resultPath);

    registry.markProcessing(id);

    expect(registry.read(id)?.state).toBe("done");
  });

  it("결과 TTL이 만료되면 조회 결과가 존재하지 않는 jobId와 동일해진다", () => {
    let now = 0;
    const registry = makeRegistry({ now: () => now, resultTtlMs: 1_000 });
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markDone(id, resultPath);
    expect(registry.read(id)?.state).toBe("done");

    now = 1_001;

    expect(registry.read(id)).toBeUndefined();
  });

  it("등록 전에 먼저 도착한 취소는 pending TTL 안에서 등록 시 그대로 해소된다", () => {
    const now = 0;
    const registry = makeRegistry({ now: () => now, pendingCancelTtlMs: 1_000, maxPendingCancels: 2 });
    const id = parseProcessJobId(jobId);
    registry.cancel(id);

    expect(registry.register(id).aborted).toBe(true);
  });

  it("등록 전에 먼저 도착한 취소는 pending TTL이 지나면 더 이상 유효하지 않다", () => {
    let now = 0;
    const registry = makeRegistry({ now: () => now, pendingCancelTtlMs: 1_000, maxPendingCancels: 2 });
    const id = parseProcessJobId(jobId);
    registry.cancel(id);
    now = 1_001;

    expect(registry.register(id).aborted).toBe(false);
  });

  it("대기 취소 용량을 초과하면 가장 오래된 항목부터 축출한다", () => {
    const registry = makeRegistry({ pendingCancelTtlMs: 60_000, maxPendingCancels: 2 });
    registry.cancel(parseProcessJobId(jobId));
    registry.cancel(parseProcessJobId(secondJobId));
    registry.cancel(parseProcessJobId(thirdJobId)); // evicts jobId, the oldest pending entry

    expect(registry.register(parseProcessJobId(jobId)).aborted).toBe(false);
    expect(registry.register(parseProcessJobId(secondJobId)).aborted).toBe(true);
    expect(registry.register(parseProcessJobId(thirdJobId)).aborted).toBe(true);
  });

  it("queuePosition은 1부터 시작해 등록 순서를 따른다", () => {
    const registry = makeRegistry();
    registry.register(parseProcessJobId(jobId));
    registry.register(parseProcessJobId(secondJobId));
    registry.register(parseProcessJobId(thirdJobId));

    expect(registry.read(parseProcessJobId(jobId))?.queuePosition).toBe(1);
    expect(registry.read(parseProcessJobId(secondJobId))?.queuePosition).toBe(2);
    expect(registry.read(parseProcessJobId(thirdJobId))?.queuePosition).toBe(3);
  });

  it("앞선 대기 작업이 processing으로 전이하면 뒤따르는 queuePosition이 앞당겨진다", () => {
    const registry = makeRegistry();
    registry.register(parseProcessJobId(jobId));
    registry.register(parseProcessJobId(secondJobId));
    registry.register(parseProcessJobId(thirdJobId));

    registry.markProcessing(parseProcessJobId(jobId));

    expect(registry.read(parseProcessJobId(jobId))).not.toHaveProperty("queuePosition");
    expect(registry.read(parseProcessJobId(secondJobId))?.queuePosition).toBe(1);
    expect(registry.read(parseProcessJobId(thirdJobId))?.queuePosition).toBe(2);
  });

  it("OW199 regression F3 timer-only expiry deletes files", async () => {
    const path = await writeResult();
    const registry = makeRegistry({ resultTtlMs: 50 });
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);
    registry.markDone(id, path);

    // No read/register/route call: only the native node:timers deadline may trigger the cleanup.
    const removed = await eventually(async () => !(await exists(dirname(path))));

    expect(removed).toBe(true);
  });

  it("OW199 regression F3 cancellation cannot publish late success", () => {
    const registry = makeRegistry();
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markProcessing(id);
    registry.cancel(id);

    registry.markDone(id, resultPath);
    registry.markFailed(id, "inference");

    const status = registry.read(id);
    expect(status?.state).toBe("cancelled");
    expect(status?.resultPath).toBeUndefined();
  });

  it("OW199 regression F3 expired UUID cannot affect new attempt", () => {
    let now = 0;
    const registry = makeRegistry({ now: () => now, resultTtlMs: 1_000 });
    const id = parseProcessJobId(jobId);
    const oldAttempt = registry.register(id);
    registry.markFailed(id, "timeout", oldAttempt);
    now = 1_001;
    const newAttempt = registry.register(id);
    expect(newAttempt).not.toBe(oldAttempt);

    // Callbacks still held by the old attempt must not touch the new registration.
    registry.markProcessing(id, oldAttempt);
    registry.markDone(id, resultPath, oldAttempt);
    registry.markCancelled(id, oldAttempt);

    expect(registry.read(id)).toEqual({ state: "queued", queuePosition: 1 });
  });

  it("OW199 support R2 isolated cleanup and teardown", async () => {
    const path = await writeResult("owned");
    const siblingRoot = await mkdtemp(join(tmpdir(), "imagework-registry-sibling-"));
    temporaryPaths.push(siblingRoot);
    const sentinel = join(siblingRoot, "sentinel.txt");
    await writeFile(sentinel, "keep", { mode: 0o600 });
    expect(path.startsWith(fixtureRoot)).toBe(true);
    const registry = makeRegistry({ resultTtlMs: 20 });
    const id = parseProcessJobId(jobId);
    registry.register(id);
    registry.markDone(id, path);

    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    await registry.dispose?.();

    expect(await exists(sentinel)).toBe(true);
    expect(await exists(fixtureRoot)).toBe(true);
  });
  it("OW199 r5 support V4 large TTL re-arms to absolute deadline", async () => {
    const path = await writeResult("large-ttl");
    const maxDelayMs = 2 ** 31 - 1;
    const ttlMs = maxDelayMs + 1_000;
    let now = 0;
    const fire = (timer: FakeTimer): void => {
      expect(timer.fired || timer.cleared).toBe(false); // a one-shot timer fires at most once
      expect(seams.clock).toBeGreaterThanOrEqual(timer.dueAt); // and never before its due time
      timer.fired = true;
      timer.callback();
    };
    seams.controlled = true;
    seams.clock = 0;
    seams.timers.length = 0;
    const registry = makeRegistry({ now: () => now, resultTtlMs: ttlMs });
    try {
      const id = parseProcessJobId(jobId);
      registry.register(id);
      registry.markProcessing(id);
      registry.markDone(id, path);
      expect(seams.timers).toHaveLength(1);
      const first = seams.timers[0];
      expect(first.dueAt).toBe(maxDelayMs);

      now = seams.clock = maxDelayMs;
      fire(first);
      expect(seams.timers).toHaveLength(2);
      const rearmed = seams.timers[1];
      expect(rearmed.dueAt).toBe(ttlMs); // the absolute deadline, not another full TTL
      expect(await exists(dirname(path))).toBe(true);

      now = seams.clock = ttlMs - 1; // one millisecond early: the re-armed timer is not fired
      expect(await exists(dirname(path))).toBe(true);

      now = seams.clock = ttlMs;
      fire(rearmed);
      expect(await eventually(async () => !(await exists(dirname(path))))).toBe(true); // before any registry read
      expect(registry.read(id)).toBeUndefined();
    } finally {
      await registry.dispose();
      seams.controlled = false;
      seams.timers.length = 0;
    }
  });

  it("OW199 r5 support V4 registry cleanup error is reported and retried", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const path = await writeResult("cleanup-error");
    const directory = dirname(path);
    seams.failRm = (target) => target === directory;
    try {
      const registry = makeRegistry({ resultTtlMs: 30 });
      const id = parseProcessJobId(jobId);
      registry.register(id);
      registry.markDone(id, path);

      // Only the native timer fires here; the failed deletion is reported and the file stays.
      expect(await eventually(async () => errorSpy.mock.calls.some(([message]) => String(message).includes("result directory cleanup failed")))).toBe(true);
      expect(await exists(path)).toBe(true);
      expect(registry.read(id)).toBeUndefined();

      seams.failRm = undefined;
      await registry.dispose(); // disposal retries the deletion once
      expect(await exists(directory)).toBe(false);
    } finally {
      seams.failRm = undefined;
      errorSpy.mockRestore();
    }
  });
});
