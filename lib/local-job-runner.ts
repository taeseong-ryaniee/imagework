import { chmod, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { z } from "zod";
import type { ProcessInput } from "./image-input";
import {
  CommandExecutionError,
  ImageworkInputError,
  JobCancelledError,
  JobTimeoutError,
  ResultContractError,
  RunnerConfigurationError,
  QueueCapacityError,
} from "./job-errors";
import { extractRequestedResult } from "./zip-contract";
import { processJobRegistry, ProcessJobRegistry, type ProcessJobId } from "./process-job-registry";

// Local replacement for the remote-session runner: a single long-lived worker process
// (spawned once at startup) instead of a per-job CLI invocation. See the OW-202 Linear
// comment for the full cross-task protocol writeup (stdio message shapes, env var
// inheritance, resultPath convention).

const resultArchiveName = "imagework-results.zip";
const cancelGraceMs = 30_000;
const circuitBreakerWindowMs = 10 * 60 * 1000;
const maxCrashesPerWindow = 3;
const gpuLockConfirmMs = 250;

const configSchema = z.object({
  IMAGEWORK_PROCESSING_CODE: z.string().min(32).max(512),
  IMAGEWORK_WORKER_PYTHON: z.string().startsWith("/"),
  IMAGEWORK_WORKER_SCRIPT: z.string().startsWith("/"),
  IMAGEWORK_MODEL_CACHE: z.string().startsWith("/"),
  IMAGEWORK_VTRACER_BIN: z.string().startsWith("/"),
  IMAGEWORK_JOB_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(600).default(300),
  IMAGEWORK_JOB_TMP_ROOT: z.string().startsWith("/"),
  IMAGEWORK_MAX_QUEUE_DEPTH: z.coerce.number().int().min(1).max(100),
  IMAGEWORK_RESULT_TTL_SECONDS: z.coerce.number().int().min(1).default(600),
});

export type RunnerConfig = {
  readonly processingCode: string;
  readonly workerPythonPath: string;
  readonly workerScriptPath: string;
  readonly modelCacheRoot: string;
  readonly vtracerBinPath: string;
  readonly timeoutMs: number;
  readonly jobTmpRoot: string;
  readonly maxQueueDepth: number;
  readonly resultTtlMs: number;
};

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

const configValue = (environment: EnvironmentSource, name: string): string | undefined => environment[name];

export const parseRunnerConfig = (environment: EnvironmentSource): RunnerConfig => {
  const parsed = configSchema.safeParse({
    IMAGEWORK_PROCESSING_CODE: configValue(environment, "IMAGEWORK_PROCESSING_CODE"),
    IMAGEWORK_WORKER_PYTHON: configValue(environment, "IMAGEWORK_WORKER_PYTHON"),
    IMAGEWORK_WORKER_SCRIPT: configValue(environment, "IMAGEWORK_WORKER_SCRIPT"),
    IMAGEWORK_MODEL_CACHE: configValue(environment, "IMAGEWORK_MODEL_CACHE"),
    IMAGEWORK_VTRACER_BIN: configValue(environment, "IMAGEWORK_VTRACER_BIN"),
    IMAGEWORK_JOB_TIMEOUT_SECONDS: configValue(environment, "IMAGEWORK_JOB_TIMEOUT_SECONDS"),
    IMAGEWORK_JOB_TMP_ROOT: configValue(environment, "IMAGEWORK_JOB_TMP_ROOT"),
    IMAGEWORK_MAX_QUEUE_DEPTH: configValue(environment, "IMAGEWORK_MAX_QUEUE_DEPTH"),
    IMAGEWORK_RESULT_TTL_SECONDS: configValue(environment, "IMAGEWORK_RESULT_TTL_SECONDS"),
  });
  if (!parsed.success) throw new RunnerConfigurationError();
  return {
    processingCode: parsed.data.IMAGEWORK_PROCESSING_CODE,
    workerPythonPath: parsed.data.IMAGEWORK_WORKER_PYTHON,
    workerScriptPath: parsed.data.IMAGEWORK_WORKER_SCRIPT,
    modelCacheRoot: parsed.data.IMAGEWORK_MODEL_CACHE,
    vtracerBinPath: parsed.data.IMAGEWORK_VTRACER_BIN,
    timeoutMs: parsed.data.IMAGEWORK_JOB_TIMEOUT_SECONDS * 1000,
    jobTmpRoot: parsed.data.IMAGEWORK_JOB_TMP_ROOT,
    maxQueueDepth: parsed.data.IMAGEWORK_MAX_QUEUE_DEPTH,
    resultTtlMs: parsed.data.IMAGEWORK_RESULT_TTL_SECONDS * 1000,
  };
};

export const matchesProcessingCode = (received: string, expected: string): boolean => {
  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
};

// --- stdio protocol (matches OW-201's runner/local-worker.py contract) ---

const workerErrorKinds = ["invalidInput", "inference", "vectorize", "cancelled"] as const;
type WorkerErrorKind = (typeof workerErrorKinds)[number];

const workerMessageSchema = z.union([
  z.object({ jobId: z.string(), ok: z.literal(true) }),
  z.object({ jobId: z.string(), ok: z.literal(false), errorKind: z.enum(workerErrorKinds) }),
]);
type WorkerMessage = z.infer<typeof workerMessageSchema>;

const isReadyMessage = (value: unknown): boolean =>
  typeof value === "object" && value !== null && (value as Record<string, unknown>).ready === true;

// --- DI seam #1: the worker process (a fake implementation drives unit tests) ---

export interface WorkerHandle {
  writeLine(line: string): void;
  kill(signal: NodeJS.Signals): void;
  onStdoutData(listener: (chunk: string) => void): void;
  onStderrData(listener: (chunk: string) => void): void;
  onExit(listener: () => void): void;
}

export interface WorkerProcessFactory {
  spawn(config: RunnerConfig): WorkerHandle;
}

// Spawned with default env inheritance (no `env` override): the child sees the same
// IMAGEWORK_MODEL_CACHE / IMAGEWORK_VTRACER_BIN the Next.js process was started with,
// so local-worker.py reads them straight from os.environ — no extra plumbing needed.
class NodeWorkerProcessFactory implements WorkerProcessFactory {
  spawn(config: RunnerConfig): WorkerHandle {
    const child = spawn(config.workerPythonPath, [config.workerScriptPath], { stdio: ["pipe", "pipe", "pipe"] });
    return {
      writeLine: (line) => child.stdin.write(`${line}\n`),
      kill: (signal) => {
        child.kill(signal);
      },
      onStdoutData: (listener) => child.stdout.on("data", (chunk: Buffer) => listener(chunk.toString("utf8"))),
      onStderrData: (listener) => child.stderr.on("data", (chunk: Buffer) => listener(chunk.toString("utf8"))),
      onExit: (listener) => child.once("exit", () => listener()),
    };
  }
}

// --- DI seam #2: GPU single-ownership lock (D21a) ---

export interface GpuLock {
  acquire(modelCacheRoot: string): Promise<void>;
  release(): void;
}

// True flock(2) semantics via the `flock` utility (already present on the deploy target,
// no new dependency): a held child process (`flock --nonblock <lock> sleep infinity`)
// keeps the advisory lock for as long as it lives, and the kernel releases it
// automatically if that child (or this whole process group, under systemd's default
// KillMode=control-group) dies — including on a hard crash. `--nonblock` makes a losing
// attempt exit almost immediately; `gpuLockConfirmMs` is just long enough to tell "it
// exited because the lock was busy" apart from "it's still running because it won".
class FlockGpuLock implements GpuLock {
  private child: ChildProcess | null = null;

  async acquire(modelCacheRoot: string): Promise<void> {
    const lockFilePath = join(modelCacheRoot, ".gpu.lock");
    const child = spawn("flock", ["--nonblock", lockFilePath, "sleep", "infinity"], { stdio: "ignore" });
    const acquired = await new Promise<boolean>((resolve) => {
      child.once("error", () => resolve(false));
      child.once("exit", () => resolve(false));
      setTimeout(() => resolve(true), gpuLockConfirmMs).unref();
    });
    if (!acquired) {
      child.kill();
      throw new RunnerConfigurationError();
    }
    this.child = child;
  }

  release(): void {
    this.child?.kill();
    this.child = null;
  }
}

// --- the runner ---

type QueueItem = {
  readonly jobId: ProcessJobId;
  readonly input: ProcessInput;
  readonly signal: AbortSignal;
  readonly onAbort: () => void;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
};

export type LocalJobRunnerOptions = {
  readonly workers?: WorkerProcessFactory;
  readonly registry?: ProcessJobRegistry;
  readonly gpuLock?: GpuLock;
  readonly now?: () => number;
};

export class LocalJobRunner {
  private readonly workers: WorkerProcessFactory;
  private readonly registry: ProcessJobRegistry;
  private readonly gpuLock: GpuLock;
  private readonly now: () => number;

  private readonly queue: QueueItem[] = [];
  private worker: WorkerHandle | null = null;
  private ready = false;
  private processing = false;
  private circuitOpen = false;
  private plannedKill = false;
  private currentJobId: ProcessJobId | null = null;
  private inFlightItem: QueueItem | null = null;
  private cancelGraceTimer: NodeJS.Timeout | null = null;
  private jobTimeoutTimer: NodeJS.Timeout | null = null;
  private crashTimestamps: number[] = [];

  constructor(private readonly config: RunnerConfig, options: LocalJobRunnerOptions = {}) {
    this.workers = options.workers ?? new NodeWorkerProcessFactory();
    this.registry = options.registry ?? processJobRegistry;
    this.gpuLock = options.gpuLock ?? new FlockGpuLock();
    this.now = options.now ?? Date.now;
    process.once("exit", () => this.gpuLock.release());
    void this.initialize();
  }

  run(jobId: ProcessJobId, input: ProcessInput, signal: AbortSignal): Promise<void> {
    if (this.circuitOpen || !this.ready) return Promise.reject(new RunnerConfigurationError());
    if (signal.aborted) return Promise.reject(new JobCancelledError());
    if (this.depth() >= this.config.maxQueueDepth) return Promise.reject(new QueueCapacityError());
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => this.handleCancel(jobId);
      const item: QueueItem = { jobId, input, signal, onAbort, resolve, reject };
      signal.addEventListener("abort", onAbort, { once: true });
      this.queue.push(item);
      this.pump();
    });
  }

  private depth(): number {
    return this.queue.length + (this.processing ? 1 : 0);
  }

  private async initialize(): Promise<void> {
    try {
      await this.gpuLock.acquire(this.config.modelCacheRoot);
    } catch {
      console.error("[local-job-runner] GPU lock not acquired; startup aborted.");
      return;
    }
    await this.sweepStaleJobDirs();
    this.respawn();
  }

  private async sweepStaleJobDirs(): Promise<void> {
    await mkdir(this.config.jobTmpRoot, { recursive: true, mode: 0o700 });
    const entries = await readdir(this.config.jobTmpRoot);
    await Promise.all(entries.map((name) => rm(join(this.config.jobTmpRoot, name), { recursive: true, force: true })));
  }

  private respawn(): void {
    const worker = this.workers.spawn(this.config);
    this.worker = worker;
    let buffer = "";
    worker.onStdoutData((chunk) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        this.handleWorkerLine(buffer.slice(0, newlineIndex));
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
      }
    });
    worker.onStderrData((chunk) => this.logDiagnostic(chunk));
    worker.onExit(() => this.handleWorkerExit());
  }

  private handleWorkerLine(rawLine: string): void {
    const line = rawLine.trim();
    if (line.length === 0) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.logDiagnostic(rawLine);
      return;
    }
    if (isReadyMessage(parsed)) {
      this.ready = true;
      this.pump();
      return;
    }
    const message = workerMessageSchema.safeParse(parsed);
    if (!message.success || message.data.jobId !== this.currentJobId) {
      this.logDiagnostic(rawLine);
      return;
    }
    void this.completeCurrent(message.data);
  }

  // Malformed stdout lines and everything on stderr land here — the worker isolates its
  // protocol channel on its own fd (D19), this is defense-in-depth on our side.
  private logDiagnostic(chunk: string): void {
    console.error(`[local-job-runner] ${chunk}`);
  }

  private pump(): void {
    if (this.processing || this.circuitOpen || !this.ready || !this.worker) return;
    const item = this.queue.shift();
    if (!item) return;
    this.processing = true;
    this.currentJobId = item.jobId;
    this.inFlightItem = item;
    this.registry.markProcessing(item.jobId);
    this.armJobTimeout(item.jobId);
    void this.dispatch(item);
  }

  private jobRootFor(jobId: ProcessJobId): string {
    return join(this.config.jobTmpRoot, jobId);
  }

  private async dispatch(item: QueueItem): Promise<void> {
    const jobRoot = this.jobRootFor(item.jobId);
    try {
      await mkdir(jobRoot, { recursive: true, mode: 0o700 });
      await chmod(jobRoot, 0o700);
      const inputPath = join(jobRoot, `input${item.input.extension}`);
      const configPath = join(jobRoot, "job.json");
      await Promise.all([
        writeFile(inputPath, item.input.bytes, { mode: 0o600 }),
        writeFile(configPath, JSON.stringify({ mode: item.input.mode, box: item.input.box }), { mode: 0o600 }),
      ]);
      await Promise.all([chmod(inputPath, 0o600), chmod(configPath, 0o600)]);
      if (this.currentJobId !== item.jobId) return; // settled elsewhere (cancel/timeout) while writing
      this.worker?.writeLine(JSON.stringify({ jobId: item.jobId, jobDir: jobRoot }));
    } catch {
      if (this.currentJobId !== item.jobId) return;
      this.finalizeCurrent(() => {
        this.registry.markFailed(item.jobId, "dispatchError");
        item.reject(new CommandExecutionError());
      });
    }
  }

  private async completeCurrent(message: WorkerMessage): Promise<void> {
    if (this.currentJobId !== message.jobId || !this.inFlightItem) return;
    const item = this.inFlightItem;
    if (!message.ok) {
      this.finalizeCurrent(() => this.rejectWithErrorKind(item, message.errorKind));
      return;
    }
    try {
      const rawZipPath = join(this.jobRootFor(item.jobId), resultArchiveName);
      const extracted = await extractRequestedResult(rawZipPath, item.input.mode, item.input.outputFormat);
      if (this.currentJobId !== item.jobId) return; // settled elsewhere while extracting
      const resultPath = join(this.jobRootFor(item.jobId), extracted.name);
      await writeFile(resultPath, extracted.bytes, { mode: 0o600 });
      await chmod(resultPath, 0o600);
      if (this.currentJobId !== item.jobId) return;
      this.finalizeCurrent(() => {
        this.registry.markDone(item.jobId, resultPath);
        item.resolve();
      });
    } catch {
      if (this.currentJobId !== item.jobId) return;
      this.finalizeCurrent(() => {
        this.registry.markFailed(item.jobId, "resultContract");
        item.reject(new ResultContractError());
      });
    }
  }

  private rejectWithErrorKind(item: QueueItem, errorKind: WorkerErrorKind): void {
    if (errorKind === "cancelled") {
      this.registry.markCancelled(item.jobId);
      item.reject(new JobCancelledError());
      return;
    }
    this.registry.markFailed(item.jobId, errorKind);
    item.reject(errorKind === "invalidInput" ? new ImageworkInputError() : new CommandExecutionError());
  }

  // Scoped cancellation (D16): only the job currently occupying the worker gets a
  // signal; a still-queued job is removed without ever touching the worker.
  private handleCancel(jobId: ProcessJobId): void {
    if (this.currentJobId === jobId) {
      this.worker?.kill("SIGUSR1");
      this.armCancelGraceTimer(jobId);
      return;
    }
    const index = this.queue.findIndex((queued) => queued.jobId === jobId);
    if (index === -1) return;
    const [item] = this.queue.splice(index, 1);
    item.signal.removeEventListener("abort", item.onAbort);
    this.registry.markCancelled(jobId);
    item.reject(new JobCancelledError());
  }

  private armCancelGraceTimer(jobId: ProcessJobId): void {
    this.clearCancelGraceTimer();
    const timer = setTimeout(() => this.forceCancelCurrent(jobId), cancelGraceMs);
    timer.unref();
    this.cancelGraceTimer = timer;
  }

  private forceCancelCurrent(jobId: ProcessJobId): void {
    if (this.currentJobId !== jobId) return;
    this.finalizeCurrent(() => {
      this.registry.markCancelled(jobId);
      this.inFlightItem?.reject(new JobCancelledError());
    });
    this.killAndRespawn();
  }

  private armJobTimeout(jobId: ProcessJobId): void {
    this.clearJobTimeout();
    const timer = setTimeout(() => this.timeoutCurrent(jobId), this.config.timeoutMs);
    timer.unref();
    this.jobTimeoutTimer = timer;
  }

  private timeoutCurrent(jobId: ProcessJobId): void {
    if (this.currentJobId !== jobId) return;
    this.finalizeCurrent(() => {
      this.registry.markFailed(jobId, "timeout");
      this.inFlightItem?.reject(new JobTimeoutError());
    });
    this.killAndRespawn();
  }

  // finalizeCurrent captures the item and nulls tracking state before `apply` runs, so
  // `apply` reads `this.inFlightItem` (captured below) rather than the now-cleared field.
  private finalizeCurrent(apply: () => void): void {
    const item = this.settleCurrent();
    if (!item) return;
    this.inFlightItem = item; // restore for `apply`'s duration; cleared again right after.
    apply();
    this.inFlightItem = null;
    this.pump();
  }

  private settleCurrent(): QueueItem | null {
    const item = this.inFlightItem;
    if (!item) return null;
    this.clearCancelGraceTimer();
    this.clearJobTimeout();
    this.currentJobId = null;
    this.inFlightItem = null;
    this.processing = false;
    item.signal.removeEventListener("abort", item.onAbort);
    return item;
  }

  private killAndRespawn(): void {
    this.plannedKill = true;
    this.worker?.kill("SIGKILL");
  }

  private clearCancelGraceTimer(): void {
    if (this.cancelGraceTimer) clearTimeout(this.cancelGraceTimer);
    this.cancelGraceTimer = null;
  }

  private clearJobTimeout(): void {
    if (this.jobTimeoutTimer) clearTimeout(this.jobTimeoutTimer);
    this.jobTimeoutTimer = null;
  }

  private handleWorkerExit(): void {
    this.ready = false;
    this.worker = null;
    const wasPlanned = this.plannedKill;
    this.plannedKill = false;
    const item = this.settleCurrent();
    if (!wasPlanned) {
      if (item) {
        this.registry.markFailed(item.jobId, "workerCrash");
        item.reject(new CommandExecutionError());
      }
      this.recordCrash();
    }
    if (this.circuitOpen) return;
    this.respawn();
  }

  // Respawn circuit breaker: more than `maxCrashesPerWindow` crashes inside
  // `circuitBreakerWindowMs` stops respawning for good and drains the queue.
  private recordCrash(): void {
    const nowMs = this.now();
    this.crashTimestamps = this.crashTimestamps.filter((timestamp) => nowMs - timestamp < circuitBreakerWindowMs);
    this.crashTimestamps.push(nowMs);
    if (this.crashTimestamps.length <= maxCrashesPerWindow) return;
    this.circuitOpen = true;
    for (const item of this.queue.splice(0)) {
      item.signal.removeEventListener("abort", item.onAbort);
      this.registry.markFailed(item.jobId, "runnerConfiguration");
      item.reject(new RunnerConfigurationError());
    }
  }
}
