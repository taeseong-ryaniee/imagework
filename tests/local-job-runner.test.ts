import { mkdir, mkdtemp, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  LocalJobRunner,
  parseRunnerConfig,
  type GpuLock,
  type RunnerConfig,
  type WorkerHandle,
  type WorkerProcessFactory,
} from "../lib/local-job-runner";
import type { ProcessInput } from "../lib/image-input";
import { ProcessJobRegistry, parseProcessJobId } from "../lib/process-job-registry";

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

class FakeWorker implements WorkerHandle {
  readonly written: string[] = [];
  readonly killSignals: NodeJS.Signals[] = [];
  private stdoutListener?: (chunk: string) => void;
  private exitListener?: () => void;

  writeLine(line: string): void {
    this.written.push(line);
  }

  kill(signal: NodeJS.Signals): void {
    this.killSignals.push(signal);
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

  emitStdout(line: string): void {
    this.stdoutListener?.(`${line}\n`);
  }

  emitExit(): void {
    this.exitListener?.();
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
  async acquire(): Promise<void> {
    // always granted — GPU contention is out of scope for these unit tests.
  }

  release(): void {}
}

// A native setTimeout reference: two cases here (job timeout, cancel grace) exercise real
// hardcoded 30s windows, so polling for async fs-driven state uses genuine wall-clock time.
const realSetTimeout = setTimeout;
const waitFor = async (predicate: () => boolean, timeoutMs = 2_000): Promise<void> => {
  const attempts = Math.ceil(timeoutMs / 5);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => realSetTimeout(resolve, 5));
  }
  throw new Error("condition was not met in time");
};

const temporaryPaths: string[] = [];

const rawConfigFor = (root: string, overrides: Partial<Record<string, string>> = {}): RunnerConfig => parseRunnerConfig({
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

const configFor = async (overrides: Partial<Record<string, string>> = {}): Promise<RunnerConfig> => {
  const root = await mkdtemp(join(tmpdir(), "imagework-local-runner-test-"));
  temporaryPaths.push(root);
  return rawConfigFor(root, overrides);
};

type Harness = Readonly<{
  readonly runner: LocalJobRunner;
  readonly workers: FakeWorkerFactory;
  readonly registry: ProcessJobRegistry;
  readonly config: RunnerConfig;
}>;

const createReadyRunner = async (overrides: Partial<Record<string, string>> = {}, now?: () => number): Promise<Harness> => {
  const config = await configFor(overrides);
  const workers = new FakeWorkerFactory();
  const registry = new ProcessJobRegistry();
  const runner = new LocalJobRunner(config, { workers, gpuLock: new FakeGpuLock(), registry, ...(now ? { now } : {}) });
  await waitFor(() => workers.spawned.length === 1);
  workers.spawned[0].emitStdout(JSON.stringify({ ready: true }));
  return { runner, workers, registry, config };
};

const submit = (runner: LocalJobRunner, registry: ProcessJobRegistry, id: string): Promise<void> => {
  const signal = registry.register(parseProcessJobId(id));
  return runner.run(parseProcessJobId(id), input, signal);
};

const writeSuccessZip = async (config: RunnerConfig, id: string): Promise<void> => {
  await writeFile(join(config.jobTmpRoot, id, "imagework-results.zip"), makeZip(["result.png"]));
};

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("LocalJobRunner", () => {
  it("워커가 크래시하면 재스폰 후 다음 작업이 성공한다", async () => {
    const { runner, workers, registry, config } = await createReadyRunner();
    const firstWorker = workers.spawned[0];
    const firstJob = submit(runner, registry, jobId);
    await waitFor(() => firstWorker.written.length === 1);

    firstWorker.emitExit();

    await expect(firstJob).rejects.toMatchObject({ name: "CommandExecutionError" });
    expect(registry.read(parseProcessJobId(jobId))).toMatchObject({ state: "failed", errorKind: "workerCrash" });
    expect(workers.spawned).toHaveLength(2);
    const secondWorker = workers.spawned[1];
    secondWorker.emitStdout(JSON.stringify({ ready: true }));

    const secondJob = submit(runner, registry, secondJobId);
    await waitFor(() => secondWorker.written.length === 1);
    await writeSuccessZip(config, secondJobId);
    secondWorker.emitStdout(JSON.stringify({ jobId: secondJobId, ok: true }));

    await expect(secondJob).resolves.toBeUndefined();
    expect(registry.read(parseProcessJobId(secondJobId))).toMatchObject({ state: "done" });
    expect(registry.read(parseProcessJobId(secondJobId))?.resultPath).toBeTruthy();
  });

  it("추론 중 취소하면 SIGUSR1을 보내고 워커 응답에 따라 cancelled로 전이한다", async () => {
    const { runner, workers, registry } = await createReadyRunner();
    const worker = workers.spawned[0];
    const job = submit(runner, registry, jobId);
    await waitFor(() => worker.written.length === 1);
    expect(registry.read(parseProcessJobId(jobId))?.state).toBe("processing");

    registry.cancel(parseProcessJobId(jobId));
    expect(worker.killSignals).toEqual(["SIGUSR1"]);
    worker.emitStdout(JSON.stringify({ jobId, ok: false, errorKind: "cancelled" }));

    await expect(job).rejects.toMatchObject({ name: "JobCancelledError" });
    expect(registry.read(parseProcessJobId(jobId))?.state).toBe("cancelled");
  });

  it("대기 중인 작업을 취소해도 워커에 닿지 않고 실행 중인 작업에는 영향이 없다", async () => {
    const { runner, workers, registry } = await createReadyRunner();
    const worker = workers.spawned[0];
    const activeJob = submit(runner, registry, jobId);
    await waitFor(() => worker.written.length === 1);
    void activeJob.catch(() => {});

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
    const worker = workers.spawned[0];
    const job = submit(runner, registry, jobId);
    await waitFor(() => worker.written.length === 1);

    worker.emitStdout("this is not json");
    worker.emitStdout(JSON.stringify({ jobId: "not-the-current-job", ok: true }));
    worker.emitStdout(JSON.stringify({ jobId, ok: false, errorKind: "inference" }));

    await expect(job).rejects.toMatchObject({ name: "CommandExecutionError" });
    expect(registry.read(parseProcessJobId(jobId))).toMatchObject({ state: "failed", errorKind: "inference" });
  });

  it("최대 큐 깊이를 초과하면 QueueCapacityError로 즉시 거부한다", async () => {
    const { runner, registry } = await createReadyRunner({ IMAGEWORK_MAX_QUEUE_DEPTH: "1" });
    const firstJob = submit(runner, registry, jobId);
    void firstJob.catch(() => {});

    await expect(submit(runner, registry, secondJobId)).rejects.toMatchObject({ name: "QueueCapacityError" });
  });

  it("설정된 타임아웃을 넘기면 JobTimeoutError로 실패하고 워커를 강제 종료한다", async () => {
    const { runner, workers, registry } = await createReadyRunner({ IMAGEWORK_JOB_TIMEOUT_SECONDS: "30" });
    const worker = workers.spawned[0];
    const job = submit(runner, registry, jobId);
    await waitFor(() => worker.written.length === 1);

    await expect(job).rejects.toMatchObject({ name: "JobTimeoutError" });
    expect(registry.read(parseProcessJobId(jobId))).toMatchObject({ state: "failed", errorKind: "timeout" });
    expect(worker.killSignals).toEqual(["SIGKILL"]);
  }, 35_000);

  it("ready 신호 전에 도착한 요청은 RunnerConfigurationError로 즉시 거부된다", async () => {
    const config = await configFor();
    const workers = new FakeWorkerFactory();
    const registry = new ProcessJobRegistry();
    const runner = new LocalJobRunner(config, { workers, gpuLock: new FakeGpuLock(), registry });

    await expect(submit(runner, registry, jobId)).rejects.toMatchObject({ name: "RunnerConfigurationError" });
  });

  it("10분 내 3회 초과 크래시 시 서킷이 열려 대기 큐를 드레인한다", async () => {
    let now = 0;
    const { runner, workers, registry } = await createReadyRunner({}, () => now);
    const firstWorker = workers.spawned[0];
    const firstJob = submit(runner, registry, jobId);
    await waitFor(() => firstWorker.written.length === 1);
    void firstJob.catch(() => {});
    const secondJob = submit(runner, registry, secondJobId);
    expect(registry.read(parseProcessJobId(secondJobId))?.state).toBe("queued");

    for (let crash = 0; crash < 4; crash += 1) {
      now += 1_000;
      workers.spawned[workers.spawned.length - 1].emitExit();
    }

    await expect(secondJob).rejects.toMatchObject({ name: "RunnerConfigurationError" });
    expect(registry.read(parseProcessJobId(secondJobId))).toMatchObject({ state: "failed", errorKind: "runnerConfiguration" });
    await expect(runner.run(parseProcessJobId(thirdJobId), input, new AbortController().signal)).rejects.toMatchObject({ name: "RunnerConfigurationError" });
    expect(workers.spawned).toHaveLength(4); // 1 initial + 3 respawns; the 4th crash trips the breaker before a 5th spawn
  });

  it("SIGUSR1 유예 30초를 넘기면 SIGKILL로 강제 종료하고 재스폰한다", async () => {
    const { runner, workers, registry } = await createReadyRunner();
    const worker = workers.spawned[0];
    const job = submit(runner, registry, jobId);
    await waitFor(() => worker.written.length === 1);

    registry.cancel(parseProcessJobId(jobId));
    expect(worker.killSignals).toEqual(["SIGUSR1"]);

    await expect(job).rejects.toMatchObject({ name: "JobCancelledError" });
    expect(registry.read(parseProcessJobId(jobId))?.state).toBe("cancelled");
    expect(worker.killSignals).toEqual(["SIGUSR1", "SIGKILL"]);

    worker.emitExit(); // the OS finalizing the SIGKILL
    await waitFor(() => workers.spawned.length === 2);
  }, 35_000);

  it.each([
    { errorKind: "invalidInput", expectedError: "ImageworkInputError" },
    { errorKind: "cancelled", expectedError: "JobCancelledError" },
    { errorKind: "inference", expectedError: "CommandExecutionError" },
    { errorKind: "vectorize", expectedError: "CommandExecutionError" },
  ] as const)("워커의 errorKind '$errorKind'를 $expectedError로 매핑한다", async ({ errorKind, expectedError }) => {
    const { runner, workers, registry } = await createReadyRunner();
    const worker = workers.spawned[0];
    const job = submit(runner, registry, jobId);
    await waitFor(() => worker.written.length === 1);

    worker.emitStdout(JSON.stringify({ jobId, ok: false, errorKind }));

    await expect(job).rejects.toMatchObject({ name: expectedError });
    const status = registry.read(parseProcessJobId(jobId));
    if (errorKind === "cancelled") expect(status?.state).toBe("cancelled");
    else expect(status).toMatchObject({ state: "failed", errorKind });
  });

  it("기동 시 IMAGEWORK_JOB_TMP_ROOT의 고아 디렉터리를 스윕한다", async () => {
    const root = await mkdtemp(join(tmpdir(), "imagework-local-runner-test-"));
    temporaryPaths.push(root);
    const jobTmpRoot = join(root, "jobs");
    await mkdir(join(jobTmpRoot, "orphan-job-id"), { recursive: true, mode: 0o700 });
    await writeFile(join(jobTmpRoot, "orphan-job-id", "input.png"), Buffer.from([1, 2, 3]), { mode: 0o600 });
    const config = rawConfigFor(root);
    const workers = new FakeWorkerFactory();
    new LocalJobRunner(config, { workers, gpuLock: new FakeGpuLock(), registry: new ProcessJobRegistry() });

    await waitFor(() => workers.spawned.length === 1);

    await expect(readdir(jobTmpRoot)).resolves.toEqual([]);
  });
});
