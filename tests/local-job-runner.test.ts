// @vitest-environment node
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProcessHandler } from "../app/api/process/route";
import {
  LocalJobRunner,
  NodeWorkerProcessFactory,
  parseRunnerConfig,
  type GpuLock,
  type RunnerConfig,
  type WorkerHandle,
  type WorkerProcessFactory,
} from "../lib/local-job-runner";
import type { ProcessInput } from "../lib/image-input";
import { ProcessJobRegistry, parseProcessJobId } from "../lib/process-job-registry";

// Test seams over modules the runner imports: a gate in front of writeFile, a delay map for the 30s cancel
// grace (setTimeout is imported from node:timers, so vitest fake timers cannot reach it) and a spawn stub for
// the real adapter. All default to pass-through.
const hooks = vi.hoisted(() => ({
  writeFile: undefined as undefined | ((path: unknown) => Promise<void>),
  failRm: undefined as undefined | ((path: unknown) => boolean),
  mapDelay: undefined as undefined | ((delayMs: number) => number),
  spawn: undefined as undefined | ((...args: unknown[]) => unknown),
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const writeFile = (async (...args: Parameters<typeof actual.writeFile>) => {
    await hooks.writeFile?.(args[0]);
    return actual.writeFile(...args);
  }) as typeof actual.writeFile;
  const rm = (async (...args: Parameters<typeof actual.rm>) => {
    if (hooks.failRm?.(args[0])) throw Object.assign(new Error("EBUSY"), { code: "EBUSY" });
    return actual.rm(...args);
  }) as typeof actual.rm;
  return { ...actual, writeFile, rm };
});
vi.mock("node:timers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:timers")>();
  const setTimeout = ((handler: () => void, delayMs?: number, ...rest: unknown[]) =>
    (actual.setTimeout as (...args: unknown[]) => NodeJS.Timeout)(handler, hooks.mapDelay ? hooks.mapDelay(delayMs ?? 0) : delayMs, ...rest)) as typeof actual.setTimeout;
  return { ...actual, setTimeout };
});
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const spawn = ((...args: Parameters<typeof actual.spawn>) => (hooks.spawn ? hooks.spawn(...args) : actual.spawn(...args))) as typeof actual.spawn;
  return { ...actual, spawn };
});

// --- fixtures shared across cases (mirrors the archive-building helpers in the retired remote-session runner tests) ---

const processingCode = "0123456789abcdef0123456789abcdef";
const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");
const jobId = "9bc368f7-0f53-4ebd-80c2-1d1bdfe94c98";
const secondJobId = "6c499b5d-ca00-4cd2-a536-1cc4c4087370";
const thirdJobId = "a8f850bd-26f9-46d4-874a-39cc32e056d8";

const input: ProcessInput = {
  bytes: png,
  extension: ".png",
  mode: "photo",
  outputFormat: "zip",
  box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 },
  processingCode,
};

const transparentPng = (): Buffer => {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = deflateSync(Buffer.from([0, 255, 255, 255, 0, 0, 0, 0, 255]));
  const chunk = (name: string, content: Buffer): Buffer => {
    const value = Buffer.alloc(12 + content.length);
    value.writeUInt32BE(content.length, 0);
    value.write(name, 4, "ascii");
    content.copy(value, 8);
    return value;
  };
  return Buffer.concat([header, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
};

const makeZip = (members: readonly string[]): Buffer => {
  const records: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const member of members) {
    const name = Buffer.from(member, "utf8");
    const content = transparentPng();
    const local = Buffer.alloc(30 + name.length + content.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    content.copy(local, 30 + name.length);
    records.push(local);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    directory.push(central);
    offset += local.length;
  }
  const centralSize = directory.reduce((size, value) => size + value.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...records, ...directory, end]);
};

// --- DI seam fakes (WorkerProcessFactory / WorkerHandle / GpuLock, per OW-202's Decisions comment) ---

// `holdGroup` models a descendant (vtracer) that outlives the worker process: stopGroup() stays pending
// until the test releases or fails it, independent of the parent's `emitExit`.
class FakeWorker implements WorkerHandle {
  readonly written: string[] = [];
  readonly killSignals: NodeJS.Signals[] = [];
  readonly groupKillAttempts: NodeJS.Signals[] = []; // synchronous whole-group signals; they never synthesize an exit
  groupKillError: Error | null = null; // thrown by killGroupSync() after the attempt is recorded
  stopGroupCalls = 0;
  stopFails = false; // every stopGroup() rejects while set (failGroup() fails only the held one)
  private groupHold: PromiseWithResolvers<void> | null = null;
  private stdoutListener?: (chunk: string) => void;
  private exitListener?: () => void;
  private errorListener?: () => void;

  writeLine(line: string): void {
    this.written.push(line);
  }

  kill(signal: NodeJS.Signals): void {
    this.killSignals.push(signal);
  }

  killGroupSync(): void {
    this.groupKillAttempts.push("SIGKILL");
    if (this.groupKillError) throw this.groupKillError;
  }

  stopGroup(): Promise<void> {
    this.stopGroupCalls += 1;
    if (this.stopFails) return Promise.reject(new Error("process group did not stop"));
    return this.groupHold?.promise ?? Promise.resolve();
  }

  holdGroup(): void {
    this.groupHold = Promise.withResolvers<void>();
    this.groupHold.promise.catch(() => {});
  }

  releaseGroup(): void {
    this.groupHold?.resolve();
    this.groupHold = null;
  }

  failGroup(): void {
    this.groupHold?.reject(new Error("process group did not stop"));
    this.groupHold = null;
  }

  onStdoutData(listener: (chunk: string) => void): void {
    this.stdoutListener = listener;
  }

  onStderrData(): void {
    // diagnostics only — nothing under test reads stderr.
  }

  onExit(listener: () => void): void {
    this.exitListener = listener;
  }

  onError(listener: () => void): void {
    this.errorListener = listener;
  }

  emitStdout(line: string): void {
    this.stdoutListener?.(`${line}\n`);
  }

  emitExit(): void {
    this.exitListener?.();
  }

  emitError(): void {
    this.errorListener?.();
  }
}

class FakeWorkerFactory implements WorkerProcessFactory {
  readonly spawned: FakeWorker[] = [];

  spawn(): WorkerHandle {
    const worker = new FakeWorker();
    this.spawned.push(worker);
    return worker;
  }
}

class FakeGpuLock implements GpuLock {
  released = 0;
  private readonly gate: PromiseWithResolvers<void> | null;

  constructor(hold = false) {
    this.gate = hold ? Promise.withResolvers<void>() : null;
    this.gate?.promise.catch(() => {});
  }

  acquire(): Promise<void> {
    return this.gate?.promise ?? Promise.resolve();
  }

  grant(): void {
    this.gate?.resolve();
  }

  deny(): void {
    this.gate?.reject(new Error("lock busy"));
  }

  release(): void {
    this.released += 1;
  }
}

// A native setTimeout reference: polling for async fs-driven state uses genuine wall-clock time.
const realSetTimeout = setTimeout;
const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => realSetTimeout(resolve, ms));
const waitFor = async (predicate: () => boolean, timeoutMs = 2_000): Promise<void> => {
  const attempts = Math.ceil(timeoutMs / 5);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return;
    await sleep(5);
  }
  throw new Error("condition was not met in time");
};
const eventually = async (predicate: () => Promise<boolean>, timeoutMs = 2_000): Promise<boolean> => {
  for (let elapsed = 0; elapsed < timeoutMs; elapsed += 10) {
    if (await predicate()) return true;
    await sleep(10);
  }
  return false;
};
const stateOf = (promise: Promise<void>): Promise<"pending" | "resolved" | "rejected"> => Promise.race([
  promise.then(() => "resolved" as const, () => "rejected" as const),
  sleep(30).then(() => "pending" as const),
]);
const exists = (path: string): Promise<boolean> => stat(path).then(() => true, () => false);

const readyLine = JSON.stringify({ ready: true });
const temporaryPaths: string[] = [];
const runners: LocalJobRunner[] = [];
const registries: ProcessJobRegistry[] = [];
const factories: FakeWorkerFactory[] = [];
const locks: FakeGpuLock[] = [];
const expectedDisposeFailures = new Set<LocalJobRunner>(); // runners whose disposal is asserted to reject
let exitListenerBaseline = 0;

const rawEnvFor = (root: string, overrides: Partial<Record<string, string>> = {}): Record<string, string | undefined> => ({
  IMAGEWORK_PROCESSING_CODE: processingCode,
  IMAGEWORK_WORKER_PYTHON: "/usr/bin/python3",
  IMAGEWORK_WORKER_SCRIPT: "/opt/imagework/local-worker.py",
  IMAGEWORK_MODEL_CACHE: "/opt/imagework/model-cache",
  IMAGEWORK_VTRACER_BIN: "/usr/local/bin/vtracer",
  IMAGEWORK_JOB_TIMEOUT_SECONDS: "300",
  IMAGEWORK_JOB_TMP_ROOT: join(root, "jobs"),
  IMAGEWORK_MAX_QUEUE_DEPTH: "4",
  IMAGEWORK_RESULT_TTL_SECONDS: "600",
  ...overrides,
});
const rawConfigFor = (root: string, overrides: Partial<Record<string, string>> = {}): RunnerConfig => parseRunnerConfig(rawEnvFor(root, overrides));

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "imagework-local-runner-test-"));
  temporaryPaths.push(root);
  return root;
};

const makeRegistry = (...args: ConstructorParameters<typeof ProcessJobRegistry>): ProcessJobRegistry => {
  const registry = new ProcessJobRegistry(...args);
  registries.push(registry);
  return registry;
};

type Harness = Readonly<{
  readonly runner: LocalJobRunner;
  readonly workers: FakeWorkerFactory;
  readonly registry: ProcessJobRegistry;
  readonly config: RunnerConfig;
  readonly lock: FakeGpuLock;
}>;

type Setup = {
  readonly overrides?: Partial<Record<string, string>>;
  readonly patch?: Partial<RunnerConfig>;
  readonly now?: () => number;
  readonly lock?: FakeGpuLock;
};

const createRunner = async (setup: Setup = {}): Promise<Harness> => {
  const config: RunnerConfig = { ...rawConfigFor(await makeRoot(), setup.overrides), ...setup.patch };
  const workers = new FakeWorkerFactory();
  factories.push(workers);
  const registry = makeRegistry(setup.now ? { now: setup.now } : {});
  const lock = setup.lock ?? new FakeGpuLock();
  locks.push(lock);
  const runner = new LocalJobRunner(config, { workers, gpuLock: lock, registry, ...(setup.now ? { now: setup.now } : {}) });
  runners.push(runner);
  return { runner, workers, registry, config, lock };
};

const createReadyRunner = async (setup: Setup = {}): Promise<Harness> => {
  const harness = await createRunner(setup);
  await waitFor(() => harness.workers.spawned.length === 1);
  harness.workers.spawned[0].emitStdout(readyLine);
  return harness;
};

// run() may refuse synchronously (admission) or reject later; tests see both as a rejected promise.
// The extra catch marks the promise handled so jobs left over at teardown never surface as unhandled.
const submit = (runner: LocalJobRunner, registry: ProcessJobRegistry, id: string, jobInput: ProcessInput = input): Promise<void> => {
  const signal = registry.register(parseProcessJobId(id));
  let completion: Promise<void>;
  try {
    completion = runner.run(parseProcessJobId(id), jobInput, signal);
  } catch (error) {
    completion = Promise.reject(error);
  }
  completion.catch(() => {});
  return completion;
};

const jobDirOf = (worker: FakeWorker, index = 0): string => (JSON.parse(worker.written[index]) as { readonly jobDir: string }).jobDir;

const writeSuccessZip = async (jobDir: string): Promise<void> => {
  await writeFile(join(jobDir, "imagework-results.zip"), makeZip(["result.png"]));
};

const startJob = async (workers: FakeWorkerFactory, runner: LocalJobRunner, registry: ProcessJobRegistry, id = jobId, jobInput: ProcessInput = input) => {
  const worker = workers.spawned[workers.spawned.length - 1];
  const before = worker.written.length;
  const job = submit(runner, registry, id, jobInput);
  await waitFor(() => worker.written.length === before + 1);
  return { worker, job, jobDir: jobDirOf(worker, before) };
};

const rootIsEmpty = (config: RunnerConfig) => async (): Promise<boolean> => (await readdir(config.jobTmpRoot)).length === 0;

const postRequest = (id: string): Request => {
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
  const request = new Request("http://localhost/api/process", { method: "POST", headers: { "x-imagework-processing-code": processingCode } });
  Object.defineProperty(request, "formData", { value: async () => formData });
  return request;
};

const openCircuit = async (workers: FakeWorkerFactory): Promise<void> => {
  for (let crash = 0; crash < 4; crash += 1) {
    await waitFor(() => workers.spawned.length === crash + 1);
    workers.spawned[crash].emitExit();
  }
  await sleep(30);
};

beforeEach(() => {
  exitListenerBaseline = process.listenerCount("exit");
});

// Mocks stay installed until every runner and registry has been disposed: a real-adapter fake PID must never
// reach the real process.kill. An expected disposal rejection is tolerated only for runners that asserted it.
afterEach(async () => {
  hooks.writeFile = undefined;
  hooks.mapDelay = undefined;
  hooks.failRm = undefined;
  for (const lock of locks.splice(0)) lock.deny(); // a lock still undecided would keep its runner initializing
  for (const factory of factories.splice(0)) {
    for (const worker of factory.spawned) {
      worker.stopFails = false;
      worker.releaseGroup();
    }
  }
  const disposals = await Promise.allSettled(runners.splice(0).map(async (runner) => {
    try {
      await runner.dispose();
    } catch (error) {
      if (!expectedDisposeFailures.has(runner)) throw error;
    }
  }));
  const registryDisposals = await Promise.allSettled(registries.splice(0).map((registry) => registry.dispose()));
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
  hooks.spawn = undefined;
  expectedDisposeFailures.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  const failures = [...disposals, ...registryDisposals].flatMap((outcome) => (outcome.status === "rejected" ? [outcome.reason] : []));
  if (failures.length > 0) throw new AggregateError(failures, "test teardown failed");
  expect(process.listenerCount("exit")).toBe(exitListenerBaseline);
});

describe("LocalJobRunner", () => {
  it("워커가 크래시하면 재스폰 후 다음 작업이 성공한다", async () => {
    const { runner, workers, registry } = await createReadyRunner();
    const { worker: firstWorker, job: firstJob } = await startJob(workers, runner, registry);

    firstWorker.emitExit();

    await expect(firstJob).rejects.toMatchObject({ name: "CommandExecutionError" });
    expect(registry.read(parseProcessJobId(jobId))).toMatchObject({ state: "failed", errorKind: "workerCrash" });
    await waitFor(() => workers.spawned.length === 2);
    const secondWorker = workers.spawned[1];
    secondWorker.emitStdout(readyLine);

    const { job: secondJob, jobDir } = await startJob(workers, runner, registry, secondJobId);
    await writeSuccessZip(jobDir);
    secondWorker.emitStdout(JSON.stringify({ jobId: secondJobId, ok: true }));

    await expect(secondJob).resolves.toBeUndefined();
    expect(registry.read(parseProcessJobId(secondJobId))).toMatchObject({ state: "done" });
    expect(registry.read(parseProcessJobId(secondJobId))?.resultPath).toBeTruthy();
  });

  it("추론 중 취소하면 SIGUSR1을 보내고 워커 응답에 따라 cancelled로 전이한다", async () => {
    const { runner, workers, registry } = await createReadyRunner();
    const { worker, job } = await startJob(workers, runner, registry);
    expect(registry.read(parseProcessJobId(jobId))?.state).toBe("processing");

    registry.cancel(parseProcessJobId(jobId));
    expect(worker.killSignals).toEqual(["SIGUSR1"]);
    worker.emitStdout(JSON.stringify({ jobId, ok: false, errorKind: "cancelled" }));

    await expect(job).rejects.toMatchObject({ name: "JobCancelledError" });
    expect(registry.read(parseProcessJobId(jobId))?.state).toBe("cancelled");
    expect(worker.stopGroupCalls).toBe(0); // an acknowledged cancellation keeps the same worker
  });

  it("대기 중인 작업을 취소해도 워커에 닿지 않고 실행 중인 작업에는 영향이 없다", async () => {
    const { runner, workers, registry } = await createReadyRunner();
    const { worker } = await startJob(workers, runner, registry);

    const queuedJob = submit(runner, registry, secondJobId);
    expect(registry.read(parseProcessJobId(secondJobId))?.state).toBe("queued");

    registry.cancel(parseProcessJobId(secondJobId));

    await expect(queuedJob).rejects.toMatchObject({ name: "JobCancelledError" });
    expect(registry.read(parseProcessJobId(secondJobId))?.state).toBe("cancelled");
    expect(worker.killSignals).toEqual([]);
    expect(worker.written).toHaveLength(1);
    expect(registry.read(parseProcessJobId(jobId))?.state).toBe("processing");
  });

  it("쓰레기 stdout 라인을 무시하고 이어지는 정상 메시지를 처리한다", async () => {
    const { runner, workers, registry } = await createReadyRunner();
    const { worker, job } = await startJob(workers, runner, registry);

    worker.emitStdout("this is not json");
    worker.emitStdout(JSON.stringify({ jobId: "not-the-current-job", ok: true }));
    worker.emitStdout(JSON.stringify({ jobId, ok: false, errorKind: "inference" }));

    await expect(job).rejects.toMatchObject({ name: "CommandExecutionError" });
    expect(registry.read(parseProcessJobId(jobId))).toMatchObject({ state: "failed", errorKind: "inference" });
  });

  it("최대 큐 깊이를 초과하면 QueueCapacityError로 즉시 거부한다", async () => {
    const { runner, registry } = await createReadyRunner({ overrides: { IMAGEWORK_MAX_QUEUE_DEPTH: "1" } });
    submit(runner, registry, jobId);

    await expect(submit(runner, registry, secondJobId)).rejects.toMatchObject({ name: "QueueCapacityError" });
  });

  it("설정된 타임아웃을 넘기면 JobTimeoutError로 실패하고 워커 프로세스 그룹을 강제 종료한다", async () => {
    const { runner, workers, registry } = await createReadyRunner({ patch: { timeoutMs: 100 } });
    const { worker, job } = await startJob(workers, runner, registry);

    await expect(job).rejects.toMatchObject({ name: "JobTimeoutError" });

    expect(registry.read(parseProcessJobId(jobId))).toMatchObject({ state: "failed", errorKind: "timeout" });
    await waitFor(() => worker.stopGroupCalls === 1);
    expect(worker.killSignals).toEqual([]); // SIGUSR1 stays worker-scoped; the forced stop goes through stopGroup
  });

  it("10분 내 3회 초과 크래시 시 서킷이 열려 대기 큐를 드레인한다", async () => {
    let now = 0;
    const { runner, workers, registry } = await createReadyRunner({ now: () => now });
    await startJob(workers, runner, registry);
    const secondJob = submit(runner, registry, secondJobId);
    expect(registry.read(parseProcessJobId(secondJobId))?.state).toBe("queued");

    for (let crash = 0; crash < 4; crash += 1) {
      now += 1_000;
      await waitFor(() => workers.spawned.length === crash + 1);
      workers.spawned[crash].emitExit();
    }

    await expect(secondJob).rejects.toMatchObject({ name: "RunnerConfigurationError" });
    expect(registry.read(parseProcessJobId(secondJobId))).toMatchObject({ state: "failed", errorKind: "runnerConfiguration" });
    await expect(submit(runner, registry, thirdJobId)).rejects.toMatchObject({ name: "RunnerConfigurationError" });
    expect(workers.spawned).toHaveLength(4); // 1 initial + 3 respawns; the 4th crash trips the breaker before a 5th spawn
  });

  it("SIGUSR1 유예 시간을 넘기면 워커 그룹을 강제 종료하고 재스폰한다", async () => {
    hooks.mapDelay = (delayMs) => (delayMs === 30_000 ? 50 : delayMs);
    const { runner, workers, registry } = await createReadyRunner();
    const { worker, job } = await startJob(workers, runner, registry);

    registry.cancel(parseProcessJobId(jobId));
    expect(worker.killSignals).toEqual(["SIGUSR1"]);

    await expect(job).rejects.toMatchObject({ name: "JobCancelledError" });
    expect(registry.read(parseProcessJobId(jobId))?.state).toBe("cancelled");
    await waitFor(() => worker.stopGroupCalls === 1);

    worker.emitExit(); // the OS finalizing the SIGKILL
    await waitFor(() => workers.spawned.length === 2);
  });

  it.each([
    { errorKind: "invalidInput", expectedError: "ImageworkInputError" },
    { errorKind: "cancelled", expectedError: "JobCancelledError" },
    { errorKind: "inference", expectedError: "CommandExecutionError" },
    { errorKind: "vectorize", expectedError: "CommandExecutionError" },
  ] as const)("워커의 errorKind '$errorKind'를 $expectedError로 매핑한다", async ({ errorKind, expectedError }) => {
    const { runner, workers, registry } = await createReadyRunner();
    const { worker, job } = await startJob(workers, runner, registry);

    worker.emitStdout(JSON.stringify({ jobId, ok: false, errorKind }));

    await expect(job).rejects.toMatchObject({ name: expectedError });
    const status = registry.read(parseProcessJobId(jobId));
    if (errorKind === "cancelled") expect(status?.state).toBe("cancelled");
    else expect(status).toMatchObject({ state: "failed", errorKind });
  });

  it("기동 시 IMAGEWORK_JOB_TMP_ROOT의 고아 디렉터리를 스윕한다", async () => {
    const root = await makeRoot();
    const jobTmpRoot = join(root, "jobs");
    await mkdir(join(jobTmpRoot, "orphan-job-id"), { recursive: true, mode: 0o700 });
    await writeFile(join(jobTmpRoot, "orphan-job-id", "input.png"), Buffer.from([1, 2, 3]), { mode: 0o600 });
    const workers = new FakeWorkerFactory();
    factories.push(workers);
    runners.push(new LocalJobRunner(rawConfigFor(root), { workers, gpuLock: new FakeGpuLock(), registry: makeRegistry() }));

    await waitFor(() => workers.spawned.length === 1);

    await expect(readdir(jobTmpRoot)).resolves.toEqual([]);
  });

  it("OW199 regression F4 cold start queues until ready", async () => {
    const lock = new FakeGpuLock(true);
    const { runner, workers, registry } = await createRunner({ lock });

    const job = submit(runner, registry, jobId);
    expect(await stateOf(job)).toBe("pending"); // starting: accepted, not refused
    lock.grant();
    await waitFor(() => workers.spawned.length === 1);
    const worker = workers.spawned[0];
    await sleep(30);
    expect(worker.written).toHaveLength(0); // no dispatch before the worker reports ready

    worker.emitStdout(readyLine);
    await waitFor(() => worker.written.length === 1);
    await writeSuccessZip(jobDirOf(worker));
    worker.emitStdout(JSON.stringify({ jobId, ok: true }));

    await expect(job).resolves.toBeUndefined();
  });

  it("OW199 regression F4 respawn queues until ready", async () => {
    const { runner, workers, registry } = await createReadyRunner();
    const { worker: first, job: firstJob } = await startJob(workers, runner, registry);
    first.emitExit();
    await expect(firstJob).rejects.toMatchObject({ name: "CommandExecutionError" });

    const job = submit(runner, registry, secondJobId);
    expect(await stateOf(job)).toBe("pending"); // respawning: accepted, not refused
    await waitFor(() => workers.spawned.length === 2);
    const second = workers.spawned[1];
    await sleep(30);
    expect(second.written).toHaveLength(0);

    second.emitStdout(readyLine);
    await waitFor(() => second.written.length === 1);
    await writeSuccessZip(jobDirOf(second));
    second.emitStdout(JSON.stringify({ jobId: secondJobId, ok: true }));

    await expect(job).resolves.toBeUndefined();
  });

  it("OW199 regression F4 lock failure drains queue", async () => {
    const lock = new FakeGpuLock(true);
    const { runner, workers, registry } = await createRunner({ lock });
    const job = submit(runner, registry, jobId);
    expect(await stateOf(job)).toBe("pending");

    lock.deny();

    await expect(job).rejects.toMatchObject({ name: "RunnerConfigurationError" });
    expect(registry.read(parseProcessJobId(jobId))).toMatchObject({ state: "failed", errorKind: "runnerConfiguration" });
    await expect(submit(runner, registry, secondJobId)).rejects.toMatchObject({ name: "RunnerConfigurationError" });
    expect(workers.spawned).toHaveLength(0);
  });

  it.each([
    { label: "startup failed", status: 503, retryAfter: null, state: "failed" },
    { label: "queue full", status: 429, retryAfter: "60", state: "failed" },
    { label: "cancelled before submission", status: 499, retryAfter: null, state: "cancelled" },
    { label: "circuit open", status: 503, retryAfter: null, state: "failed" },
  ])("OW199 regression F4 admission HTTP status: $label", async ({ label, status, retryAfter, state }) => {
    const lock = new FakeGpuLock(label === "startup failed");
    const { runner, workers, registry } = label === "queue full"
      ? await createReadyRunner({ overrides: { IMAGEWORK_MAX_QUEUE_DEPTH: "1" } })
      : label === "startup failed" ? await createRunner({ lock }) : await createReadyRunner();
    const handler = createProcessHandler(() => runner, registry, () => ({ processingCode }));
    if (label === "startup failed") {
      lock.deny();
      await sleep(30);
    } else if (label === "queue full") {
      expect((await handler(postRequest(thirdJobId))).status).toBe(202); // occupies the single slot
    } else if (label === "cancelled before submission") {
      registry.cancel(parseProcessJobId(jobId));
    } else {
      await openCircuit(workers);
    }

    const response = await handler(postRequest(jobId));

    expect(response.status).toBe(status);
    expect(response.headers.get("Retry-After")).toBe(retryAfter);
    expect(registry.read(parseProcessJobId(jobId))?.state).toBe(state);
  });

  it("OW199 regression F4 forced stop preserves successor", async () => {
    const { runner, workers, registry } = await createReadyRunner({ patch: { timeoutMs: 150 } });
    const first = workers.spawned[0];
    first.holdGroup();
    const { job: firstJob } = await startJob(workers, runner, registry);
    const secondJob = submit(runner, registry, secondJobId);

    await expect(firstJob).rejects.toMatchObject({ name: "JobTimeoutError" });
    await sleep(100);
    expect(first.written).toHaveLength(1); // the successor is never dispatched to the retiring worker

    first.emitExit();
    first.releaseGroup();
    await waitFor(() => workers.spawned.length === 2);
    const second = workers.spawned[1];
    expect(await stateOf(secondJob)).toBe("pending");
    expect(second.written).toHaveLength(0);
    second.emitStdout(readyLine);
    await waitFor(() => second.written.length === 1);
    await writeSuccessZip(jobDirOf(second));
    second.emitStdout(JSON.stringify({ jobId: secondJobId, ok: true }));

    await expect(secondJob).resolves.toBeUndefined();
  });

  it("OW199 regression R1 timeout waits for every writer", async () => {
    const { runner, workers, registry } = await createReadyRunner({ patch: { timeoutMs: 150 } });
    const worker = workers.spawned[0];
    worker.holdGroup(); // a descendant (vtracer) is still writing into the job directory
    const { job, jobDir } = await startJob(workers, runner, registry);
    await expect(job).rejects.toMatchObject({ name: "JobTimeoutError" });

    worker.emitExit(); // the worker process itself is gone, its descendant is not
    await sleep(100);
    expect(workers.spawned).toHaveLength(1);
    expect(await exists(jobDir)).toBe(true);

    worker.releaseGroup();
    expect(await eventually(async () => !(await exists(jobDir)))).toBe(true);
    await waitFor(() => workers.spawned.length === 2);
    expect(workers.spawned).toHaveLength(2);
    expect(workers.spawned[1].written).toHaveLength(0);
  });

  it("OW199 regression R1 cancel grace waits for every writer", async () => {
    hooks.mapDelay = (delayMs) => (delayMs === 30_000 ? 50 : delayMs);
    const { runner, workers, registry } = await createReadyRunner();
    const worker = workers.spawned[0];
    worker.holdGroup();
    const { job, jobDir } = await startJob(workers, runner, registry);
    registry.cancel(parseProcessJobId(jobId));
    await expect(job).rejects.toMatchObject({ name: "JobCancelledError" });

    worker.emitExit();
    await sleep(100);
    expect(workers.spawned).toHaveLength(1);
    expect(await exists(jobDir)).toBe(true);
    expect(registry.read(parseProcessJobId(jobId))?.state).toBe("cancelled"); // visibility is not delayed

    worker.releaseGroup();
    expect(await eventually(async () => !(await exists(jobDir)))).toBe(true);
    await waitFor(() => workers.spawned.length === 2);
    expect(workers.spawned).toHaveLength(2);
  });

  it("OW199 regression R1 crash waits for descendants", async () => {
    const { runner, workers, registry } = await createReadyRunner();
    const worker = workers.spawned[0];
    worker.holdGroup();
    const { job, jobDir } = await startJob(workers, runner, registry);

    worker.emitExit();
    await expect(job).rejects.toMatchObject({ name: "CommandExecutionError" });
    await sleep(100);
    expect(workers.spawned).toHaveLength(1);
    expect(await exists(jobDir)).toBe(true);

    worker.releaseGroup();
    expect(await eventually(async () => !(await exists(jobDir)))).toBe(true);
    await waitFor(() => workers.spawned.length === 2);
    expect(workers.spawned).toHaveLength(2);
  });

  it.each([
    {
      label: "dispatch failure",
      run: async ({ runner, registry }: Harness) => {
        const job = submit(runner, registry, jobId, { ...input, bytes: undefined as unknown as Buffer });
        await expect(job).rejects.toMatchObject({ name: "CommandExecutionError" });
      },
    },
    {
      label: "worker failure",
      run: async ({ runner, workers, registry }: Harness) => {
        const { worker, job } = await startJob(workers, runner, registry);
        worker.emitStdout(JSON.stringify({ jobId, ok: false, errorKind: "inference" }));
        await expect(job).rejects.toMatchObject({ name: "CommandExecutionError" });
      },
    },
    {
      label: "invalid archive",
      run: async ({ runner, workers, registry }: Harness) => {
        const { worker, job, jobDir } = await startJob(workers, runner, registry);
        await writeFile(join(jobDir, "imagework-results.zip"), Buffer.from("not a zip"));
        worker.emitStdout(JSON.stringify({ jobId, ok: true }));
        await expect(job).rejects.toMatchObject({ name: "ResultContractError" });
      },
    },
    {
      label: "acknowledged cancellation",
      run: async ({ runner, workers, registry }: Harness) => {
        const { worker, job } = await startJob(workers, runner, registry);
        registry.cancel(parseProcessJobId(jobId));
        worker.emitStdout(JSON.stringify({ jobId, ok: false, errorKind: "cancelled" }));
        await expect(job).rejects.toMatchObject({ name: "JobCancelledError" });
      },
    },
  ])("OW199 regression F3 terminal cleanup: $label", async ({ run }) => {
    const harness = await createReadyRunner();

    await run(harness);

    expect(await eventually(rootIsEmpty(harness.config))).toBe(true);
  });

  it("OW199 regression F3 cancellation cannot publish late worker success", async () => {
    const harness = await createReadyRunner();
    const { worker, job, jobDir } = await startJob(harness.workers, harness.runner, harness.registry);
    await writeSuccessZip(jobDir);

    harness.registry.cancel(parseProcessJobId(jobId));
    worker.emitStdout(JSON.stringify({ jobId, ok: true })); // the worker finished before it saw SIGUSR1

    await expect(job).rejects.toMatchObject({ name: "JobCancelledError" });
    const status = harness.registry.read(parseProcessJobId(jobId));
    expect(status?.state).toBe("cancelled");
    expect(status?.resultPath).toBeUndefined();
    expect(await eventually(rootIsEmpty(harness.config))).toBe(true);
  });

  it("OW199 regression F3 cleanup waits for Node writes", async () => {
    const { runner, workers, registry } = await createReadyRunner({ patch: { timeoutMs: 400 } });
    const gate = Promise.withResolvers<void>();
    let blocked = false;
    hooks.writeFile = async (path) => {
      if (!String(path).endsWith("result.png")) return;
      blocked = true;
      await gate.promise;
    };
    const { worker, job, jobDir } = await startJob(workers, runner, registry, jobId, { ...input, outputFormat: "png" });
    await writeSuccessZip(jobDir);
    worker.emitStdout(JSON.stringify({ jobId, ok: true }));

    try {
      expect(await eventually(async () => blocked)).toBe(true);
      await expect(job).rejects.toMatchObject({ name: "JobTimeoutError" });
      await sleep(100);
      expect(await exists(jobDir)).toBe(true); // the result write is still outstanding
    } finally {
      gate.resolve();
    }

    expect(await eventually(async () => !(await exists(jobDir)))).toBe(true);
  });

  it("OW199 regression F3 configured shared TTL", async () => {
    const roots = [await makeRoot(), await makeRoot()];
    const envs = roots.map((root) => rawEnvFor(root, { IMAGEWORK_RESULT_TTL_SECONDS: "7" }));
    for (const [name, value] of Object.entries(envs[1])) vi.stubEnv(name, value ?? "");
    // A fresh module graph isolates the shared singleton the route factories capture.
    vi.resetModules();
    const registryModule = await import("../lib/process-job-registry");
    const runnerModule = await import("../lib/local-job-runner");
    const statusModule = await import("../app/api/process/status/route");
    const injected = makeRegistry();
    const shared = registryModule.processJobRegistry;
    registries.push(shared);

    const complete = async (registry: ProcessJobRegistry, env: Record<string, string | undefined>, id: string) => {
      const workers = new FakeWorkerFactory();
      factories.push(workers);
      const runner = new runnerModule.LocalJobRunner(runnerModule.parseRunnerConfig(env), {
        workers,
        gpuLock: new FakeGpuLock(),
        ...(registry === shared ? {} : { registry }),
      });
      runners.push(runner as unknown as LocalJobRunner);
      await waitFor(() => workers.spawned.length === 1);
      workers.spawned[0].emitStdout(readyLine);
      const { worker, job, jobDir } = await startJob(workers, runner as unknown as LocalJobRunner, registry, id);
      await writeSuccessZip(jobDir);
      worker.emitStdout(JSON.stringify({ jobId: id, ok: true }));
      await job;
    };
    await complete(injected, envs[0], jobId);
    await complete(shared as unknown as ProcessJobRegistry, envs[1], secondJobId);

    const expected = Date.now() + 7_000;
    expect(Math.abs((injected.read(parseProcessJobId(jobId))?.expiresAt ?? 0) - expected)).toBeLessThan(2_000);
    expect(Math.abs((shared.read(registryModule.parseProcessJobId(secondJobId))?.expiresAt ?? 0) - expected)).toBeLessThan(2_000);
    const response = await statusModule.GET(new Request(`http://localhost/api/process/status?jobId=${secondJobId}`, { headers: { "x-imagework-processing-code": processingCode } }));
    const body = await response.json() as { readonly state: string; readonly expiresAt?: number };
    expect(body.state).toBe("done");
    expect(Math.abs((body.expiresAt ?? 0) - expected)).toBeLessThan(2_000);
  });

  it("OW199 support R1 acknowledged errors reuse the worker without a group stop", async () => {
    const { runner, workers, registry } = await createReadyRunner();
    const { worker, job } = await startJob(workers, runner, registry);
    worker.emitStdout(JSON.stringify({ jobId, ok: false, errorKind: "inference" }));
    await expect(job).rejects.toMatchObject({ name: "CommandExecutionError" });

    const next = await startJob(workers, runner, registry, secondJobId);

    expect(workers.spawned).toHaveLength(1);
    expect(worker.stopGroupCalls).toBe(0);
    next.worker.emitStdout(JSON.stringify({ jobId: secondJobId, ok: false, errorKind: "inference" }));
    await expect(next.job).rejects.toMatchObject({ name: "CommandExecutionError" });
  });

  it("OW199 support R1 group stop failure fails closed", async () => {
    const { runner, workers, registry } = await createReadyRunner({ patch: { timeoutMs: 150 } });
    const worker = workers.spawned[0];
    worker.holdGroup();
    const { job, jobDir } = await startJob(workers, runner, registry);
    await expect(job).rejects.toMatchObject({ name: "JobTimeoutError" });
    await waitFor(() => worker.stopGroupCalls === 1);

    worker.failGroup();
    await sleep(100);

    expect(await exists(jobDir)).toBe(true); // unconfirmed writers keep their directory
    expect(workers.spawned).toHaveLength(1); // and no replacement is spawned
    await expect(submit(runner, registry, secondJobId)).rejects.toMatchObject({ name: "RunnerConfigurationError" });
  });

  it("OW199 support F4 spawn error and stale exit events are handled once", async () => {
    const { runner, workers, registry } = await createReadyRunner();
    const { worker, job } = await startJob(workers, runner, registry);

    worker.emitError();
    await expect(job).rejects.toMatchObject({ name: "CommandExecutionError" });
    await waitFor(() => workers.spawned.length === 2);
    worker.emitExit(); // late exit of the retired generation
    await sleep(50);

    expect(workers.spawned).toHaveLength(2);
  });

  it("OW199 support F4 missing readiness fails initial startup", async () => {
    const { runner, workers, registry } = await createRunner({ patch: { timeoutMs: 100 } });
    const job = submit(runner, registry, jobId);
    await waitFor(() => workers.spawned.length === 1);

    await expect(job).rejects.toMatchObject({ name: "RunnerConfigurationError" });

    expect(workers.spawned[0].stopGroupCalls).toBe(1);
    expect(registry.read(parseProcessJobId(jobId))).toMatchObject({ state: "failed", errorKind: "runnerConfiguration" });
  });

  it("OW199 support R2 isolated cleanup and teardown", async () => {
    const exitListeners = process.listenerCount("exit");
    const lock = new FakeGpuLock(true);
    const { runner, workers } = await createRunner({ lock });
    expect(process.listenerCount("exit")).toBe(exitListeners + 1);

    const disposing = runner.dispose();
    lock.grant(); // the lock is acquired after disposal started
    await disposing;

    expect(workers.spawned).toHaveLength(0); // no late spawn
    expect(lock.released).toBeGreaterThanOrEqual(1);
    expect(process.listenerCount("exit")).toBe(exitListeners);
  });

  const outcomeOf = (promise: Promise<void>): Promise<"resolved" | "rejected"> => promise.then(() => "resolved" as const, () => "rejected" as const);

  it("OW199 r5 regression V1 dispose retains active files on failed stop", async () => {
    const { runner, workers, registry, lock } = await createReadyRunner();
    const worker = workers.spawned[0];
    const { jobDir } = await startJob(workers, runner, registry);
    worker.stopFails = true;
    expectedDisposeFailures.add(runner);

    const outcome = await outcomeOf(runner.dispose());

    expect.soft(outcome).toBe("rejected");
    expect.soft(await exists(jobDir)).toBe(true); // an unconfirmed group may still write here
    expect.soft(lock.released).toBe(0);
    expect.soft(workers.spawned).toHaveLength(1);
  });

  it("OW199 r5 regression V1 initial readiness failure retains lock", async () => {
    const { runner, workers, registry, lock } = await createRunner({ patch: { timeoutMs: 100 } });
    const job = submit(runner, registry, jobId);
    await waitFor(() => workers.spawned.length === 1);
    workers.spawned[0].stopFails = true;

    await expect(job).rejects.toMatchObject({ name: "RunnerConfigurationError" });
    await sleep(50);

    expect.soft(lock.released).toBe(0); // the group that may hold the GPU was never confirmed stopped
    await expect.soft(submit(runner, registry, secondJobId)).rejects.toMatchObject({ name: "RunnerConfigurationError" });
    expect.soft(workers.spawned).toHaveLength(1);
  });

  it("OW199 r5 regression V1 shutdown observes pending recovery failure", async () => {
    const { runner, workers, registry, lock } = await createReadyRunner({ patch: { timeoutMs: 150 } });
    const worker = workers.spawned[0];
    worker.holdGroup();
    const { job, jobDir } = await startJob(workers, runner, registry);
    await expect(job).rejects.toMatchObject({ name: "JobTimeoutError" });
    await waitFor(() => worker.stopGroupCalls === 1);
    expectedDisposeFailures.add(runner);

    const disposal = outcomeOf(runner.dispose()); // recovery is still waiting for its stop
    await sleep(30);
    worker.stopFails = true; // the held stop and every retry fail
    worker.failGroup();

    expect.soft(await disposal).toBe("rejected");
    expect.soft(await exists(jobDir)).toBe(true);
    expect.soft(lock.released).toBe(0);
    expect.soft(workers.spawned).toHaveLength(1);
  });

  it("OW199 r5 regression V1 disposal cleans a recovered retained directory", async () => {
    const { runner, workers, registry, lock } = await createReadyRunner({ patch: { timeoutMs: 150 } });
    const worker = workers.spawned[0];
    worker.holdGroup();
    const { job, jobDir } = await startJob(workers, runner, registry);
    await expect(job).rejects.toMatchObject({ name: "JobTimeoutError" });
    await waitFor(() => worker.stopGroupCalls === 1);
    worker.failGroup();
    await sleep(100);
    expect(await exists(jobDir)).toBe(true); // unconfirmed writers keep their directory

    const outcome = await outcomeOf(runner.dispose()); // the retry at disposal confirms the stop

    expect.soft(outcome).toBe("resolved");
    expect.soft(await exists(jobDir)).toBe(false);
    expect.soft(lock.released).toBeGreaterThanOrEqual(1);
  });

  it("OW199 r5 regression V1 exit callback retains an unconfirmed lock", async () => {
    const onceSpy = vi.spyOn(process, "once");
    const { runner, workers, registry, lock } = await createReadyRunner({ patch: { timeoutMs: 150 } });
    const exitCallback = onceSpy.mock.calls.find(([event]) => event === "exit")?.[1] as (() => void) | undefined;
    onceSpy.mockRestore();
    expect(exitCallback).toBeTypeOf("function");
    const worker = workers.spawned[0];
    worker.holdGroup();
    const { job } = await startJob(workers, runner, registry);
    await expect(job).rejects.toMatchObject({ name: "JobTimeoutError" });
    await waitFor(() => worker.stopGroupCalls === 1);

    exitCallback?.(); // stop still pending
    expect.soft(lock.released).toBe(0);
    worker.failGroup();
    await sleep(100);
    exitCallback?.(); // stop failed
    expect.soft(lock.released).toBe(0);
  });

  describe("exit callback with a live generation", () => {
    const exitStates = ["starting", "ready", "processing"] as const;
    const exitOutcomes = ["sent", "EPERM", "ESRCH"] as const;
    const exitCases = exitStates.flatMap((state) => exitOutcomes.map((outcome) => [state, outcome] as const));

    it.each(exitCases)("OW199 r7 regression X1 exit %s %s", async (state, outcome) => {
      const onceSpy = vi.spyOn(process, "once");
      const { runner, workers, registry, lock } = state === "starting" ? await createRunner() : await createReadyRunner();
      const exitCallback = onceSpy.mock.calls.find(([event]) => event === "exit")?.[1] as (() => void) | undefined;
      onceSpy.mockRestore();
      expect(exitCallback).toBeTypeOf("function");
      await waitFor(() => workers.spawned.length === 1);
      const worker = workers.spawned[0];
      if (state === "processing") {
        await startJob(workers, runner, registry);
        expect(registry.read(parseProcessJobId(jobId))?.state).toBe("processing");
      }
      const groupSignalsAtRelease: number[] = [];
      const release = lock.release.bind(lock);
      vi.spyOn(lock, "release").mockImplementation(() => {
        groupSignalsAtRelease.push(worker.groupKillAttempts.length);
        release();
      });
      worker.groupKillError = outcome === "sent" ? null : Object.assign(new Error(outcome), { code: outcome });

      let thrown: unknown;
      try {
        exitCallback?.();
      } catch (error) {
        thrown = error;
      }
      expect.soft(thrown).toBeUndefined();
      expect.soft(worker.groupKillAttempts).toEqual(["SIGKILL"]);
      expect.soft(worker.killSignals).toEqual([]);
      expect.soft(worker.stopGroupCalls).toBe(0);
      expect.soft(groupSignalsAtRelease).toEqual(outcome === "EPERM" ? [] : [1]); // released only after the signal attempt
      expect.soft(lock.released).toBe(outcome === "EPERM" ? 0 : 1);
      worker.groupKillError = null;
    });

    it("OW199 r7 support X1 no generation preserves release", async () => {
      const onceSpy = vi.spyOn(process, "once");
      const { workers, lock } = await createRunner({ lock: new FakeGpuLock(true) }); // acquisition never completes: no worker exists
      const exitCallback = onceSpy.mock.calls.find(([event]) => event === "exit")?.[1] as (() => void) | undefined;
      onceSpy.mockRestore();
      expect(exitCallback).toBeTypeOf("function");

      exitCallback?.();

      expect.soft(lock.released).toBe(1);
      expect.soft(workers.spawned).toHaveLength(0);
    });
  });

  it("OW199 r5 regression V2 reused UUID cancellation stays with queued attempt", async () => {
    let now = 0;
    const graceArms: number[] = [];
    hooks.mapDelay = (delayMs) => {
      if (delayMs !== 30_000) return delayMs;
      graceArms.push(delayMs);
      return 400;
    };
    const { runner, workers, registry } = await createReadyRunner({ now: () => now, patch: { resultTtlMs: 50 } });
    const id = parseProcessJobId(jobId);
    const { worker, job: attemptA } = await startJob(workers, runner, registry);

    registry.cancel(id); // attempt A: SIGUSR1 and one grace timer
    now = 100; // A's cancelled entry expires while its worker still runs
    const attemptB = submit(runner, registry, jobId); // same UUID, new registration
    expect(registry.read(id)?.state).toBe("queued");
    registry.cancel(id); // cancels B only
    const attemptBOutcome = await stateOf(attemptB);

    expect.soft(registry.read(id)?.state).toBe("cancelled");
    expect.soft(attemptBOutcome).toBe("rejected");
    expect.soft(worker.killSignals).toEqual(["SIGUSR1"]); // no second signal for A
    expect.soft(graceArms).toHaveLength(1); // A's grace deadline is not reset

    await waitFor(() => worker.stopGroupCalls === 1);
    await expect(attemptA).rejects.toMatchObject({ name: "JobCancelledError" });
    worker.emitExit();
    await waitFor(() => workers.spawned.length === 2);
    workers.spawned[1].emitStdout(readyLine);
    await sleep(60);
    expect.soft(workers.spawned[1].written).toHaveLength(0); // B never reaches a worker
  });

  it("OW199 r5 support V2 aborted queued attempt never dispatches", async () => {
    const { runner, workers, registry } = await createReadyRunner();
    const { worker, job, jobDir } = await startJob(workers, runner, registry);
    const queued = submit(runner, registry, secondJobId);
    registry.cancel(parseProcessJobId(secondJobId));

    await writeSuccessZip(jobDir);
    worker.emitStdout(JSON.stringify({ jobId, ok: true }));
    await expect(job).resolves.toBeUndefined();
    await sleep(60);

    expect(await stateOf(queued)).toBe("rejected");
    expect(registry.read(parseProcessJobId(secondJobId))?.state).toBe("cancelled");
    expect(worker.written).toHaveLength(1);
  });

  it("OW199 r5 support V2 cancellation during staging never dispatches", async () => {
    const { runner, workers, registry, config } = await createReadyRunner();
    const worker = workers.spawned[0];
    const gate = Promise.withResolvers<void>();
    let blocked = false;
    hooks.writeFile = async (path) => {
      if (!String(path).endsWith("job.json")) return;
      blocked = true;
      await gate.promise;
    };
    const job = submit(runner, registry, jobId);
    let outcome: "pending" | "resolved" | "rejected";
    try {
      await waitFor(() => blocked);
      registry.cancel(parseProcessJobId(jobId)); // the worker has not been sent this job yet
      outcome = await stateOf(job);
    } finally {
      gate.resolve();
    }
    await sleep(60);

    expect.soft(outcome).toBe("rejected");
    expect.soft(worker.killSignals).toEqual([]);
    expect.soft(worker.written).toHaveLength(0);
    expect.soft(await eventually(rootIsEmpty(config))).toBe(true);
  });

  it("OW199 r5 support V4 duplicate terminal message is ignored", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { runner, workers, registry } = await createReadyRunner();
    const gate = Promise.withResolvers<void>();
    let blocked = false;
    hooks.writeFile = async (path) => {
      if (!String(path).endsWith("result.png")) return;
      blocked = true;
      await gate.promise;
    };
    const { worker, job, jobDir } = await startJob(workers, runner, registry, jobId, { ...input, outputFormat: "png" });
    const next = submit(runner, registry, secondJobId);
    await writeSuccessZip(jobDir);
    const done = JSON.stringify({ jobId, ok: true });
    worker.emitStdout(done);
    try {
      expect(await eventually(async () => blocked)).toBe(true);
      worker.emitStdout(done); // duplicate while the result write is still outstanding
    } finally {
      gate.resolve();
    }

    await expect(job).resolves.toBeUndefined();
    worker.emitStdout(done); // and once more after settlement
    await waitFor(() => worker.written.length === 2);
    await sleep(60);

    expect(registry.read(parseProcessJobId(jobId))).toMatchObject({ state: "done" });
    expect(await exists(jobDir)).toBe(true); // the published directory belongs to the registry
    expect(worker.written).toHaveLength(2); // exactly one successor dispatch
    expect(worker.stopGroupCalls).toBe(0);
    expect(workers.spawned).toHaveLength(1);
    expect(registry.read(parseProcessJobId(secondJobId))?.state).toBe("processing");
    void next;
  });

  it("OW199 r5 support V4 runner cleanup error is reported and retried", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { runner, workers, registry } = await createReadyRunner();
    const { worker, job, jobDir } = await startJob(workers, runner, registry);
    hooks.failRm = (path) => path === jobDir;

    worker.emitStdout(JSON.stringify({ jobId, ok: false, errorKind: "inference" }));
    await expect(job).rejects.toMatchObject({ name: "CommandExecutionError" });

    expect(await eventually(async () => errorSpy.mock.calls.some(([message]) => String(message).includes("job directory cleanup failed")))).toBe(true);
    expect(await exists(jobDir)).toBe(true);
    hooks.failRm = undefined;
    await runner.dispose(); // disposal retries the deletion
    expect(await exists(jobDir)).toBe(false);
  });

  describe("worker pipe errors", () => {
    // A child whose stdio are real streams: a stream 'error' with no listener would terminate the process.
    class PipeChild extends EventEmitter {
      readonly lines: string[] = [];
      failWrites = false;
      readonly stdin: Writable;
      readonly stdout = new Readable({ read() {} });
      readonly stderr = new Readable({ read() {} });
      readonly kill = vi.fn();

      constructor(readonly pid: number) {
        super();
        this.stdin = new Writable({
          write: (chunk: Buffer, _encoding, done) => {
            this.lines.push(chunk.toString("utf8").trim());
            done(this.failWrites ? Object.assign(new Error("write EPIPE"), { code: "EPIPE" }) : null);
          },
        });
      }
    }

    it.each(["stdin", "stdout", "stderr"] as const)("OW199 r5 regression V3 %s error triggers generation recovery", async (stream) => {
      const children = [new PipeChild(5001), new PipeChild(5002), new PipeChild(5003)];
      const observed: unknown[] = []; // recording only: it never starts recovery itself
      for (const child of children) {
        child.on("error", (error) => observed.push(error));
        for (const pipe of [child.stdin, child.stdout, child.stderr]) pipe.on("error", (error) => observed.push(error));
      }
      let spawned = 0;
      hooks.spawn = () => children[spawned++];
      let groupAlive = true;
      const signals: Array<[number, string | number | undefined]> = [];
      vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
        signals.push([pid, signal]);
        if (signal === 0 && !groupAlive) throw Object.assign(new Error("no such process"), { code: "ESRCH" });
        return true;
      });
      const config = rawConfigFor(await makeRoot());
      const registry = makeRegistry();
      const lock = new FakeGpuLock();
      locks.push(lock);
      const runner = new LocalJobRunner(config, { workers: new NodeWorkerProcessFactory({ stopTimeoutMs: 3_000, probeIntervalMs: 5 }), gpuLock: lock, registry });
      runners.push(runner);
      try {
        await waitFor(() => spawned === 1);
        children[0].stdout.emit("data", Buffer.from(`${readyLine}\n`));
        children[0].failWrites = stream === "stdin";
        const job = submit(runner, registry, jobId);
        await waitFor(() => children[0].lines.length === 1);
        const jobDir = (JSON.parse(children[0].lines[0]) as { readonly jobDir: string }).jobDir;
        if (stream !== "stdin") children[0][stream].emit("error", Object.assign(new Error("pipe broke"), { code: "EPIPE" }));

        const outcome = await stateOf(job);
        expect.soft(outcome).toBe("rejected");
        expect.soft(registry.read(parseProcessJobId(jobId))).toMatchObject({ state: "failed", errorKind: "workerCrash" });
        expect.soft(signals).toContainEqual([-5001, "SIGKILL"]); // the group stop started
        expect.soft(await exists(jobDir)).toBe(true); // and its confirmation is still outstanding
        expect.soft(spawned).toBe(1);

        groupAlive = false;
        children[0].emit("exit", 1, null);
        expect.soft(await eventually(async () => !(await exists(jobDir)))).toBe(true);
        expect.soft(await eventually(async () => spawned === 2)).toBe(true);

        children[1].stdout.emit("data", Buffer.from(`${readyLine}\n`));
        for (const pipe of [children[0].stdin, children[0].stdout, children[0].stderr]) pipe.emit("error", new Error("late pipe error"));
        children[0].emit("error", new Error("late child error"));
        children[0].emit("exit", 1, null);
        await sleep(60);
        expect.soft(spawned).toBe(2); // retired-generation events never start a second replacement
        const successor = submit(runner, registry, secondJobId);
        await waitFor(() => children[1].lines.length === 1);
        expect(registry.read(parseProcessJobId(secondJobId))?.state).toBe("processing");
        void successor;
      } finally {
        groupAlive = false;
        const disposing = runner.dispose();
        await sleep(20);
        for (const child of children) child.emit("exit", 0, null);
        await disposing;
      }
    });
  });

  describe("NodeWorkerProcessFactory", () => {
    class FakeChild extends EventEmitter {
      readonly pid = 4242;
      readonly stdin = { write: vi.fn() };
      readonly stdout = new EventEmitter();
      readonly stderr = new EventEmitter();
      readonly kill = vi.fn();
    }

    const adapterFor = (child: FakeChild, options = { stopTimeoutMs: 150, probeIntervalMs: 5 }) => {
      const spawnMock = vi.fn(() => child);
      hooks.spawn = spawnMock;
      const handle = new NodeWorkerProcessFactory(options).spawn(rawConfigFor("/tmp/unused-adapter-root"));
      return { handle, spawnMock };
    };

    it("OW199 support R1 adapter isolates the process group and signals only the worker with SIGUSR1", async () => {
      const child = new FakeChild();
      const { handle, spawnMock } = adapterFor(child);
      const killMock = vi.spyOn(process, "kill");
      let probes = 0;
      killMock.mockImplementation((_pid, signal) => {
        if (signal === 0 && (probes += 1) >= 3) throw Object.assign(new Error("no such process"), { code: "ESRCH" });
        return true;
      });

      handle.kill("SIGUSR1");
      expect(child.kill).toHaveBeenCalledWith("SIGUSR1");
      expect(killMock).not.toHaveBeenCalled();
      const stopping = handle.stopGroup();
      queueMicrotask(() => child.emit("exit", null, "SIGKILL"));
      await expect(stopping).resolves.toBeUndefined();

      expect((spawnMock.mock.calls[0] as unknown as [string, string[], { detached?: boolean }])[2]).toMatchObject({ detached: true });
      expect(killMock).toHaveBeenCalledWith(-4242, "SIGKILL");
      expect(killMock).toHaveBeenCalledWith(-4242, 0);
    });

    type GroupKillHandle = { killGroupSync?: () => void };

    it.each(["sent", "EPERM", "ESRCH"] as const)("OW199 r7 regression X1 adapter %s", (outcome) => {
      const child = new FakeChild();
      const { handle } = adapterFor(child);
      const error = outcome === "sent" ? undefined : Object.assign(new Error(outcome), { code: outcome });
      const killMock = vi.spyOn(process, "kill").mockImplementation(() => {
        if (error) throw error;
        return true;
      });
      let thrown: unknown;
      try {
        (handle as unknown as GroupKillHandle).killGroupSync?.();
      } catch (caught) {
        thrown = caught;
      }

      expect.soft(killMock.mock.calls).toEqual([[-4242, "SIGKILL"]]); // one whole-group SIGKILL, no signal-0 probe
      expect.soft(child.kill).not.toHaveBeenCalled();
      expect.soft(thrown).toBe(error); // the caller classifies ESRCH and EPERM
    });

    it("OW199 r7 support X1 adapter missing PID sends nothing", () => {
      const child = new FakeChild();
      Object.defineProperty(child, "pid", { value: undefined });
      const { handle } = adapterFor(child);
      const killMock = vi.spyOn(process, "kill");

      (handle as unknown as GroupKillHandle).killGroupSync?.();

      expect(killMock).not.toHaveBeenCalled();
      expect(child.kill).not.toHaveBeenCalled();
    });

    it("OW199 support R1 adapter treats EPERM and an unbounded wait as failure", async () => {
      const permission = adapterFor(new FakeChild());
      const killMock = vi.spyOn(process, "kill");
      killMock.mockImplementation((_pid, signal) => {
        if (signal === 0) throw Object.assign(new Error("not permitted"), { code: "EPERM" });
        return true;
      });
      await expect(permission.handle.stopGroup()).rejects.toThrow();

      const stuckChild = new FakeChild();
      const stuck = adapterFor(stuckChild);
      killMock.mockImplementation(() => true); // the group never disappears
      queueMicrotask(() => stuckChild.emit("exit", null, "SIGKILL"));
      await expect(stuck.handle.stopGroup()).rejects.toThrow();
    });
  });
});
