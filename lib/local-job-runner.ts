import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
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
// (spawned when the runner starts on the first submission, and again after a stop or crash)
// instead of a per-job CLI invocation. See the OW-202 Linear comment for the full cross-task
// protocol writeup (stdio message shapes, env var inheritance, resultPath convention).

const resultArchiveName = "imagework-results.zip";
const cancelGraceMs = 30_000;
const circuitBreakerWindowMs = 10 * 60 * 1000;
const maxCrashesPerWindow = 3;
const gpuLockConfirmMs = 250;
const groupStopTimeoutMs = 10_000;
const groupProbeIntervalMs = 50;

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
  // Cancellation signal (SIGUSR1) only: reaches the worker process, never its descendants.
  kill(signal: NodeJS.Signals): void;
  // Forced stop: SIGKILL to the worker's whole process group. Resolves once the worker has exited and no
  // member of the group is left (a descendant such as vtracer may outlive the worker); rejects when that
  // cannot be confirmed in time.
  stopGroup(): Promise<void>;
  // Synchronous SIGKILL to the worker's whole process group, for the process exit callback only. It confirms nothing:
  // it returns once the signal was sent and throws the signal error (ESRCH when the group is already gone).
  killGroupSync(): void;
  onStdoutData(listener: (chunk: string) => void): void;
  onStderrData(listener: (chunk: string) => void): void;
  onExit(listener: () => void): void;
  // The child process itself or any of its stdio pipes failed (spawn error, EPIPE on stdin, a broken output pipe).
  onError(listener: () => void): void;
}

export interface WorkerProcessFactory {
  spawn(config: RunnerConfig): WorkerHandle;
}

const isMissingProcess = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === "ESRCH";

type GroupStopOptions = { readonly stopTimeoutMs: number; readonly probeIntervalMs: number };

// Spawned with default env inheritance (no `env` override): the child sees the same
// IMAGEWORK_MODEL_CACHE / IMAGEWORK_VTRACER_BIN the Next.js process was started with,
// so local-worker.py reads them straight from os.environ — no extra plumbing needed.
// `detached` makes the worker its own process-group leader (pgid === pid), which is what lets
// stopGroup reach vtracer; the child is still awaited, never unref'd.
export class NodeWorkerProcessFactory implements WorkerProcessFactory {
  constructor(private readonly options: GroupStopOptions = { stopTimeoutMs: groupStopTimeoutMs, probeIntervalMs: groupProbeIntervalMs }) {}

  spawn(config: RunnerConfig): WorkerHandle {
    const child = spawn(config.workerPythonPath, [config.workerScriptPath], { stdio: ["pipe", "pipe", "pipe"], detached: true });
    const groupId = child.pid;
    const { stopTimeoutMs, probeIntervalMs } = this.options;
    let exited = false;
    let stopping: Promise<void> | undefined;
    child.once("exit", () => {
      exited = true;
    });
    // Only ESRCH on the group probe proves no member is left; EPERM or anything else is a failure, never success.
    const stopGroup = async (): Promise<void> => {
      if (groupId === undefined) return; // spawn failed before a PID existed
      try {
        process.kill(-groupId, "SIGKILL");
      } catch (error) {
        if (!isMissingProcess(error)) throw error;
      }
      const deadline = Date.now() + stopTimeoutMs;
      for (;;) {
        let groupGone = false;
        try {
          process.kill(-groupId, 0);
        } catch (error) {
          if (!isMissingProcess(error)) throw error;
          groupGone = true;
        }
        if (groupGone && exited) return;
        if (Date.now() >= deadline) throw new Error("worker process group did not stop");
        await new Promise<void>((resolve) => setTimeout(resolve, probeIntervalMs));
      }
    };
    return {
      writeLine: (line) => child.stdin.write(`${line}\n`),
      kill: (signal) => {
        child.kill(signal);
      },
      killGroupSync: () => {
        if (groupId !== undefined) process.kill(-groupId, "SIGKILL");
      },
      stopGroup: () => {
        if (!stopping) {
          stopping = stopGroup().catch((error: unknown) => {
            stopping = undefined; // a later attempt (disposal) may retry
            throw error;
          });
        }
        return stopping;
      },
      onStdoutData: (listener) => child.stdout.on("data", (chunk: Buffer) => listener(chunk.toString("utf8"))),
      onStderrData: (listener) => child.stderr.on("data", (chunk: Buffer) => listener(chunk.toString("utf8"))),
      onExit: (listener) => child.once("exit", () => listener()),
      // Persistent listeners: a pipe error is a different emitter from the child's, and later errors must stay consumed.
      onError: (listener) => {
        for (const emitter of [child, child.stdin, child.stdout, child.stderr]) emitter.on("error", () => listener());
      },
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
  jobDir?: string; // unique per admitted attempt, created by dispatch
  dispatching?: Promise<void>; // Node I/O still writing into jobDir
  completing?: Promise<void>; // result extraction/write still touching jobDir
  settled: boolean;
  submitted: boolean; // the job line was written to the worker (before that, cancellation needs no signal)
  terminalSeen: boolean; // the worker already sent its one terminal message
  published: boolean; // jobDir now belongs to the registry (done)
};

// A worker whose process group is not yet confirmed stopped, with the job whose directory it may still write to.
type StopRecord = { readonly generation: Generation; readonly item: QueueItem | null };

// One spawned worker. `retired` stops every event of a replaced or stopped worker from touching new state.
type Generation = {
  readonly handle: WorkerHandle;
  ready: boolean;
  retired: boolean;
  readyTimer: NodeJS.Timeout | null;
};

export type LocalJobRunnerOptions = {
  readonly workers?: WorkerProcessFactory;
  readonly registry?: ProcessJobRegistry;
  readonly gpuLock?: GpuLock;
  readonly now?: () => number;
};

// Lifecycle: the first submission constructs the runner, which takes the GPU lock, sweeps the job root and
// spawns the worker. Until the worker reports ready (and again while a replacement starts) submissions are
// queued, not refused. Only a failed startup, an open circuit or a full queue refuse a submission.
export class LocalJobRunner {
  private readonly workers: WorkerProcessFactory;
  private readonly registry: ProcessJobRegistry;
  private readonly gpuLock: GpuLock;
  private readonly now: () => number;

  private readonly queue: QueueItem[] = [];
  private generation: Generation | null = null;
  private inFlightItem: QueueItem | null = null;
  private startupFailed = false;
  private circuitOpen = false;
  private recovering = false; // a worker was retired; nothing dispatches until its writers stopped and a replacement is ready
  private disposed = false;
  private everReady = false;
  private lockHeld = false;
  private cancelGraceTimer: NodeJS.Timeout | null = null;
  private jobTimeoutTimer: NodeJS.Timeout | null = null;
  private crashTimestamps: number[] = [];
  private readonly background = new Set<Promise<void>>();
  private readonly trackedFailures: unknown[] = [];
  // Every retired worker whose group stop is pending or failed. Its files and the GPU lock stay until it is confirmed.
  private readonly unconfirmedStops = new Set<StopRecord>();
  private readonly retainedJobDirs = new Set<string>();
  private readonly initialization: Promise<void>;
  private disposing: Promise<void> | undefined;
  // A synchronous exit callback can neither await a stop nor observe reaping. An unconfirmed stop keeps the lock. A live
  // generation (starting, ready or processing) gets one synchronous group SIGKILL, and the lock is released only once that
  // signal was sent or the group was already gone (ESRCH); any other error (EPERM) keeps it. Uncatchable SIGKILL delivery,
  // not observed reaping, is what the release relies on; systemd's control-group kill stays the production guarantee.
  private readonly releaseLockOnExit = (): void => {
    if (this.unconfirmedStops.size > 0) return;
    if (this.generation) {
      try {
        this.generation.handle.killGroupSync();
      } catch (error) {
        if (!isMissingProcess(error)) return;
      }
    }
    this.gpuLock.release();
  };

  constructor(private readonly config: RunnerConfig, options: LocalJobRunnerOptions = {}) {
    this.workers = options.workers ?? new NodeWorkerProcessFactory();
    this.registry = options.registry ?? processJobRegistry;
    this.gpuLock = options.gpuLock ?? new FlockGpuLock();
    this.now = options.now ?? Date.now;
    this.registry.configureResultTtl(config.resultTtlMs);
    process.once("exit", this.releaseLockOnExit);
    this.initialization = this.initialize();
  }

  // Admission is synchronous: a refusal throws (cancellation first, then permanent failure, then capacity);
  // an accepted job returns the promise that settles when the job does.
  run(jobId: ProcessJobId, input: ProcessInput, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new JobCancelledError();
    if (this.disposed || this.startupFailed || this.circuitOpen) throw new RunnerConfigurationError();
    if (this.depth() >= this.config.maxQueueDepth) throw new QueueCapacityError();
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => this.handleCancel(item);
      const item: QueueItem = { jobId, input, signal, onAbort, resolve, reject, settled: false, submitted: false, terminalSeen: false, published: false };
      signal.addEventListener("abort", onAbort, { once: true });
      this.queue.push(item);
      this.pump();
    });
  }

  // Stops admission, fails what is queued or running, stops the worker's process group and waits for every
  // pending directory deletion. Rejects when a process group could not be confirmed stopped (its job
  // directories and the GPU lock are then kept).
  dispose(): Promise<void> {
    this.disposing ??= this.shutdown();
    return this.disposing;
  }

  private get ready(): boolean {
    return this.generation?.ready === true && !this.generation.retired;
  }

  private depth(): number {
    return this.queue.length + (this.inFlightItem ? 1 : 0);
  }

  private async initialize(): Promise<void> {
    try {
      await this.gpuLock.acquire(this.config.modelCacheRoot);
    } catch {
      console.error("[local-job-runner] GPU lock not acquired; startup aborted.");
      this.failStartup();
      return;
    }
    this.lockHeld = true;
    if (this.disposed) return;
    try {
      await this.sweepStaleJobDirs();
    } catch {
      console.error("[local-job-runner] job directory sweep failed; startup aborted.");
      this.failStartup();
      return;
    }
    if (this.disposed) return;
    this.spawnWorker(true);
  }

  private async sweepStaleJobDirs(): Promise<void> {
    await mkdir(this.config.jobTmpRoot, { recursive: true, mode: 0o700 });
    const entries = await readdir(this.config.jobTmpRoot);
    await Promise.all(entries.map((name) => rm(join(this.config.jobTmpRoot, name), { recursive: true, force: true })));
  }

  // Startup failure is permanent: queued jobs fail, later submissions are refused.
  private failStartup(): void {
    this.startupFailed = true;
    this.drainQueue();
    if (this.lockHeld && this.unconfirmedStops.size === 0 && !this.generation) {
      this.lockHeld = false;
      this.gpuLock.release();
    }
  }

  private drainQueue(): void {
    for (const item of this.queue.splice(0)) {
      item.signal.removeEventListener("abort", item.onAbort);
      this.registry.markFailed(item.jobId, "runnerConfiguration", item.signal);
      item.reject(new RunnerConfigurationError());
    }
  }

  private spawnWorker(initial: boolean): void {
    let handle: WorkerHandle;
    try {
      handle = this.workers.spawn(this.config);
    } catch {
      console.error("[local-job-runner] worker spawn failed.");
      if (initial) {
        this.failStartup();
        return;
      }
      this.recordCrash();
      if (!this.circuitOpen) this.spawnWorker(false);
      return;
    }
    const generation: Generation = { handle, ready: false, retired: false, readyTimer: null };
    this.generation = generation;
    let buffer = "";
    handle.onStdoutData((chunk) => {
      if (generation.retired) return;
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        this.handleWorkerLine(generation, buffer.slice(0, newlineIndex));
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
      }
    });
    handle.onStderrData((chunk) => this.logDiagnostic(chunk));
    handle.onExit(() => this.handleWorkerFailure(generation));
    handle.onError(() => this.handleWorkerFailure(generation));
    generation.readyTimer = setTimeout(() => this.handleReadyTimeout(generation), this.config.timeoutMs);
    generation.readyTimer.unref();
  }

  private handleReadyTimeout(generation: Generation): void {
    if (generation.retired || generation.ready) return;
    console.error("[local-job-runner] worker did not report ready in time.");
    if (this.everReady) {
      this.recordCrash();
      this.track(this.recover(generation, null));
    } else {
      this.track(this.abandonStartup(generation));
    }
  }

  private handleWorkerLine(generation: Generation, rawLine: string): void {
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
      generation.ready = true;
      this.everReady = true;
      if (generation.readyTimer) clearTimeout(generation.readyTimer);
      generation.readyTimer = null;
      this.pump();
      return;
    }
    const message = workerMessageSchema.safeParse(parsed);
    const item = this.inFlightItem;
    if (!message.success || !item || item.terminalSeen || message.data.jobId !== item.jobId) {
      this.logDiagnostic(rawLine);
      return;
    }
    item.terminalSeen = true;
    item.completing = this.completeCurrent(item, message.data);
  }

  // Malformed stdout lines and everything on stderr land here — the worker isolates its
  // protocol channel on its own fd (D19), this is defense-in-depth on our side.
  private logDiagnostic(chunk: string): void {
    console.error(`[local-job-runner] ${chunk}`);
  }

  private pump(): void {
    if (this.inFlightItem || this.circuitOpen || this.startupFailed || this.recovering || this.disposed || !this.ready) return;
    for (let item = this.queue.shift(); item; item = this.queue.shift()) {
      if (item.signal.aborted) {
        this.cancelQueued(item); // a cancelled attempt is never sent to the worker
        continue;
      }
      this.inFlightItem = item;
      this.registry.markProcessing(item.jobId, item.signal);
      this.armJobTimeout(item);
      item.dispatching = this.dispatch(item);
      return;
    }
  }

  // Each admitted attempt gets its own directory, so a reused jobId can never share one.
  private async dispatch(item: QueueItem): Promise<void> {
    try {
      const jobDir = await mkdtemp(join(this.config.jobTmpRoot, `${item.jobId}-`));
      item.jobDir = jobDir;
      const inputPath = join(jobDir, `input${item.input.extension}`);
      const configPath = join(jobDir, "job.json");
      await writeFile(inputPath, item.input.bytes, { mode: 0o600 });
      await chmod(inputPath, 0o600);
      await writeFile(configPath, JSON.stringify({ mode: item.input.mode, box: item.input.box }), { mode: 0o600 });
      await chmod(configPath, 0o600);
      if (item.settled) return; // settled elsewhere (cancel/timeout) while writing
      item.submitted = true;
      this.generation?.handle.writeLine(JSON.stringify({ jobId: item.jobId, jobDir }));
    } catch {
      if (item.settled) return;
      this.finishCurrent(item, () => {
        this.registry.markFailed(item.jobId, "dispatchError", item.signal);
        item.reject(new CommandExecutionError());
      });
    }
  }

  private async completeCurrent(item: QueueItem, message: WorkerMessage): Promise<void> {
    if (!message.ok) {
      this.finishCurrent(item, () => this.rejectWithErrorKind(item, message.errorKind));
      return;
    }
    try {
      const jobDir = item.jobDir ?? "";
      const extracted = await extractRequestedResult(join(jobDir, resultArchiveName), item.input.mode, item.input.outputFormat);
      if (item.settled) return; // settled elsewhere while extracting
      const resultPath = join(jobDir, extracted.name);
      await writeFile(resultPath, extracted.bytes, { mode: 0o600 });
      await chmod(resultPath, 0o600);
      if (item.settled) return;
      if (item.signal.aborted) {
        // cancelled while the worker was finishing: the result is never published
        this.finishCurrent(item, () => {
          this.registry.markCancelled(item.jobId, item.signal);
          item.reject(new JobCancelledError());
        });
        return;
      }
      this.finishCurrent(item, () => {
        if (this.registry.markDone(item.jobId, resultPath, item.signal)) {
          item.published = true; // the registry owns the directory from here on
          item.resolve();
        } else {
          item.reject(new CommandExecutionError());
        }
      });
    } catch {
      if (item.settled) return;
      this.finishCurrent(item, () => {
        this.registry.markFailed(item.jobId, "resultContract", item.signal);
        item.reject(new ResultContractError());
      });
    }
  }

  private rejectWithErrorKind(item: QueueItem, errorKind: WorkerErrorKind): void {
    if (errorKind === "cancelled") {
      this.registry.markCancelled(item.jobId, item.signal);
      item.reject(new JobCancelledError());
      return;
    }
    this.registry.markFailed(item.jobId, errorKind, item.signal);
    item.reject(errorKind === "invalidInput" ? new ImageworkInputError() : new CommandExecutionError());
  }

  // Scoped cancellation (D16): only the attempt whose signal aborted is affected (a jobId can be registered again
  // while an earlier attempt is still running). The job occupying the worker gets a signal; a still-queued
  // attempt is removed without ever touching the worker.
  private handleCancel(item: QueueItem): void {
    if (this.inFlightItem === item) {
      if (item.terminalSeen) return; // the worker already answered; completion sees the aborted signal
      if (!item.submitted) {
        // still staging files: the worker never received this job, so there is nothing to signal
        this.finishCurrent(item, () => {
          this.registry.markCancelled(item.jobId, item.signal);
          item.reject(new JobCancelledError());
        });
        return;
      }
      this.generation?.handle.kill("SIGUSR1");
      this.armCancelGraceTimer(item);
      return;
    }
    const index = this.queue.indexOf(item);
    if (index === -1) return;
    this.queue.splice(index, 1);
    this.cancelQueued(item);
  }

  private cancelQueued(item: QueueItem): void {
    item.signal.removeEventListener("abort", item.onAbort);
    this.registry.markCancelled(item.jobId, item.signal);
    item.reject(new JobCancelledError());
  }

  private armCancelGraceTimer(item: QueueItem): void {
    this.clearCancelGraceTimer();
    const timer = setTimeout(() => this.forceCancelCurrent(item), cancelGraceMs);
    timer.unref();
    this.cancelGraceTimer = timer;
  }

  private forceCancelCurrent(item: QueueItem): void {
    const generation = this.generation;
    if (!generation || !this.settle(item)) return;
    this.registry.markCancelled(item.jobId, item.signal);
    item.reject(new JobCancelledError());
    this.track(this.recover(generation, item));
  }

  private armJobTimeout(item: QueueItem): void {
    this.clearJobTimeout();
    const timer = setTimeout(() => this.timeoutCurrent(item), this.config.timeoutMs);
    timer.unref();
    this.jobTimeoutTimer = timer;
  }

  private timeoutCurrent(item: QueueItem): void {
    const generation = this.generation;
    if (!generation || !this.settle(item)) return;
    this.registry.markFailed(item.jobId, "timeout", item.signal);
    item.reject(new JobTimeoutError());
    this.track(this.recover(generation, item));
  }

  // Ends the current job without touching the worker: a worker that answered (ok:false or ok:true) is idle,
  // and subprocess.run has returned, so only pending Node I/O must settle before the directory goes.
  private finishCurrent(item: QueueItem, apply: () => void): void {
    if (!this.settle(item)) return;
    apply();
    if (!item.published) this.track(this.removeJobDir(item));
    this.pump();
  }

  private settle(item: QueueItem): boolean {
    if (item.settled || this.inFlightItem !== item) return false;
    item.settled = true;
    this.clearCancelGraceTimer();
    this.clearJobTimeout();
    this.inFlightItem = null;
    item.signal.removeEventListener("abort", item.onAbort);
    return true;
  }

  private track(operation: Promise<void>): void {
    const tracked: Promise<void> = operation.catch((error: unknown) => {
      this.trackedFailures.push(error); // reported by disposal
    }).then(() => {
      this.background.delete(tracked);
    });
    this.background.add(tracked);
  }

  private clearCancelGraceTimer(): void {
    if (this.cancelGraceTimer) clearTimeout(this.cancelGraceTimer);
    this.cancelGraceTimer = null;
  }

  private clearJobTimeout(): void {
    if (this.jobTimeoutTimer) clearTimeout(this.jobTimeoutTimer);
    this.jobTimeoutTimer = null;
  }

  private async removeJobDir(item: QueueItem): Promise<void> {
    await Promise.allSettled([item.dispatching, item.completing]);
    if (!item.jobDir) return;
    try {
      await rm(item.jobDir, { recursive: true, force: true });
    } catch {
      this.retainedJobDirs.add(item.jobDir); // retried at disposal; the startup sweep covers the rest
      console.error("[local-job-runner] job directory cleanup failed.");
    }
  }

  private handleWorkerFailure(generation: Generation): void {
    if (generation.retired) return;
    const item = this.inFlightItem;
    if (item && this.settle(item)) {
      this.registry.markFailed(item.jobId, "workerCrash", item.signal);
      item.reject(new CommandExecutionError());
    }
    this.recordCrash();
    this.track(this.recover(generation, item));
  }

  // Retires a worker, then waits until none of its writers can still touch the job directory — the worker's
  // process group is gone (vtracer may outlive Python) and pending Node I/O has settled — before the directory
  // is deleted and a replacement is spawned. A group that cannot be confirmed stopped fails closed: the
  // directory is kept, the circuit opens and no replacement is spawned. The record stays in unconfirmedStops
  // from the first await on, so disposal and the lock-release paths see it while the stop is still pending.
  private async recover(generation: Generation, item: QueueItem | null): Promise<void> {
    const record: StopRecord = { generation, item };
    this.unconfirmedStops.add(record);
    this.retire(generation);
    this.recovering = true;
    let stopped = true;
    try {
      await generation.handle.stopGroup();
    } catch {
      stopped = false;
      console.error("[local-job-runner] worker process group did not stop; its job directory is kept.");
    }
    if (item) await Promise.allSettled([item.dispatching, item.completing]);
    if (!stopped) {
      this.circuitOpen = true;
      this.drainQueue();
      return;
    }
    if (item) await this.removeJobDir(item);
    this.unconfirmedStops.delete(record);
    this.recovering = false;
    if (this.disposed || this.circuitOpen) return;
    this.spawnWorker(false);
  }

  private async abandonStartup(generation: Generation): Promise<void> {
    const record: StopRecord = { generation, item: null };
    this.unconfirmedStops.add(record);
    this.retire(generation);
    this.recovering = true;
    try {
      await generation.handle.stopGroup();
      this.unconfirmedStops.delete(record);
    } catch {
      this.circuitOpen = true; // the group may still hold the GPU: keep the lock (failStartup checks the record)
      console.error("[local-job-runner] worker process group did not stop.");
    }
    this.failStartup();
  }

  private retire(generation: Generation): void {
    generation.retired = true;
    if (generation.readyTimer) clearTimeout(generation.readyTimer);
    generation.readyTimer = null;
    if (this.generation === generation) this.generation = null;
  }

  private async shutdown(): Promise<void> {
    this.disposed = true;
    process.removeListener("exit", this.releaseLockOnExit);
    const item = this.inFlightItem;
    if (item && this.settle(item)) {
      this.registry.markFailed(item.jobId, "runnerConfiguration", item.signal);
      item.reject(new RunnerConfigurationError());
    }
    this.drainQueue();
    const live = this.generation;
    if (live) {
      // Recorded and retired before the first await: its exit and error events can no longer start a recovery.
      this.unconfirmedStops.add({ generation: live, item });
      this.retire(live);
    }
    await this.initialization;
    // Recoveries already in flight finish first; one whose stop failed leaves its record behind and is retried below.
    while (this.background.size > 0) await Promise.allSettled([...this.background]);
    const failures: unknown[] = [...this.trackedFailures];
    for (const record of [...this.unconfirmedStops]) {
      try {
        await record.generation.handle.stopGroup();
      } catch (error) {
        failures.push(error); // unconfirmed: its directory stays and the lock is kept
        continue;
      }
      if (record.item) {
        await Promise.allSettled([record.item.dispatching, record.item.completing]);
        if (!record.item.published) await this.removeJobDir(record.item);
      }
      this.unconfirmedStops.delete(record);
    }
    for (const directory of this.retainedJobDirs) {
      try {
        await rm(directory, { recursive: true, force: true });
        this.retainedJobDirs.delete(directory);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, "worker shutdown was not clean");
    if (this.lockHeld && this.unconfirmedStops.size === 0) {
      this.lockHeld = false;
      this.gpuLock.release();
    }
  }

  // Respawn circuit breaker: more than `maxCrashesPerWindow` crashes inside
  // `circuitBreakerWindowMs` stops respawning for good and drains the queue.
  private recordCrash(): void {
    const nowMs = this.now();
    this.crashTimestamps = this.crashTimestamps.filter((timestamp) => nowMs - timestamp < circuitBreakerWindowMs);
    this.crashTimestamps.push(nowMs);
    if (this.crashTimestamps.length <= maxCrashesPerWindow) return;
    this.circuitOpen = true;
    this.drainQueue();
  }
}
