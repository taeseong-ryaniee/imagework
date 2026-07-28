import { chmod, copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import type { ProcessInput } from "./colab-input";
import { CommandExecutionError, JobCancelledError, JobTimeoutError, ProcessingCodeError, QueueCapacityError, RunnerConfigurationError } from "./colab-errors";
import { extractRequestedResult } from "./zip-contract";

const authModes = ["adc"] as const;
const accelerators = ["T4"] as const;
const requiredColabCliVersion = "0.6.0";
const samRequirementsFilename = "sam3-requirements.lock";
const samBuildRequirementsFilename = "sam3-build-requirements.lock";
const vtracerCargoLockFilename = "vtracer-Cargo.lock";
const preSessionMarker = "pre-session";
const confirmedSessionMarker = "confirmed-session";

const configSchema = z.object({
  IMAGEWORK_HF_TOKEN: z.string().min(1),
  IMAGEWORK_PROCESSING_CODE: z.string().min(32).max(512),
  IMAGEWORK_COLAB_AUTH_MODE: z.enum(authModes),
  IMAGEWORK_GOOGLE_APPLICATION_CREDENTIALS: z.string().startsWith("/"),
  IMAGEWORK_COLAB_CONFIG: z.string().startsWith("/"),
  IMAGEWORK_COLAB_ACCELERATOR: z.enum(accelerators),
  IMAGEWORK_JOB_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(7200),
  IMAGEWORK_JOB_SCRIPT: z.string().startsWith("/"),
  IMAGEWORK_JOB_TMP_ROOT: z.string().startsWith("/"),
  IMAGEWORK_RECOVERY_ROOT: z.string().startsWith("/"),
  IMAGEWORK_MAX_QUEUE_DEPTH: z.coerce.number().int().min(1).max(100),
});

export type RunnerConfig = {
  readonly hfToken: string;
  readonly processingCode: string;
  readonly authMode: (typeof authModes)[number];
  readonly googleApplicationCredentials: string;
  readonly colabConfigRoot: string;
  readonly accelerator: (typeof accelerators)[number];
  readonly timeoutMs: number;
  readonly jobScript: string;
  readonly jobTmpRoot: string;
  readonly recoveryRoot: string;
  readonly maxQueueDepth: number;
};

export type CommandOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly input?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly captureStdout?: boolean;
};

type EnvironmentSource = Readonly<Record<string, string | undefined>>;
type IsolatedEnvironment = NodeJS.ProcessEnv & {
  readonly HOME: string;
  readonly XDG_CONFIG_HOME: string;
  readonly XDG_STATE_HOME: string;
  readonly XDG_CACHE_HOME: string;
};

export interface CommandRunner {
  run(command: string, args: readonly string[], options?: CommandOptions): Promise<string>;
}

type JobResult = Readonly<{
  readonly bytes: Buffer;
  readonly name: "imagework-results.zip" | "result.png" | "result.svg";
}>;

const configValue = (environment: EnvironmentSource, name: string): string | undefined => environment[name];

export const parseRunnerConfig = (environment: EnvironmentSource): RunnerConfig => {
  const parsed = configSchema.safeParse({
    IMAGEWORK_HF_TOKEN: configValue(environment, "IMAGEWORK_HF_TOKEN"),
    IMAGEWORK_PROCESSING_CODE: configValue(environment, "IMAGEWORK_PROCESSING_CODE"),
    IMAGEWORK_COLAB_AUTH_MODE: configValue(environment, "IMAGEWORK_COLAB_AUTH_MODE"),
    IMAGEWORK_GOOGLE_APPLICATION_CREDENTIALS: configValue(environment, "IMAGEWORK_GOOGLE_APPLICATION_CREDENTIALS"),
    IMAGEWORK_COLAB_CONFIG: configValue(environment, "IMAGEWORK_COLAB_CONFIG"),
    IMAGEWORK_COLAB_ACCELERATOR: configValue(environment, "IMAGEWORK_COLAB_ACCELERATOR"),
    IMAGEWORK_JOB_TIMEOUT_SECONDS: configValue(environment, "IMAGEWORK_JOB_TIMEOUT_SECONDS"),
    IMAGEWORK_JOB_SCRIPT: configValue(environment, "IMAGEWORK_JOB_SCRIPT"),
    IMAGEWORK_JOB_TMP_ROOT: configValue(environment, "IMAGEWORK_JOB_TMP_ROOT"),
    IMAGEWORK_RECOVERY_ROOT: configValue(environment, "IMAGEWORK_RECOVERY_ROOT"),
    IMAGEWORK_MAX_QUEUE_DEPTH: configValue(environment, "IMAGEWORK_MAX_QUEUE_DEPTH"),
  });
  if (!parsed.success) throw new RunnerConfigurationError();
  return {
    hfToken: parsed.data.IMAGEWORK_HF_TOKEN,
    processingCode: parsed.data.IMAGEWORK_PROCESSING_CODE,
    authMode: parsed.data.IMAGEWORK_COLAB_AUTH_MODE,
    googleApplicationCredentials: parsed.data.IMAGEWORK_GOOGLE_APPLICATION_CREDENTIALS,
    colabConfigRoot: parsed.data.IMAGEWORK_COLAB_CONFIG,
    accelerator: parsed.data.IMAGEWORK_COLAB_ACCELERATOR,
    timeoutMs: parsed.data.IMAGEWORK_JOB_TIMEOUT_SECONDS * 1000,
    jobScript: parsed.data.IMAGEWORK_JOB_SCRIPT,
    jobTmpRoot: parsed.data.IMAGEWORK_JOB_TMP_ROOT,
    recoveryRoot: parsed.data.IMAGEWORK_RECOVERY_ROOT,
    maxQueueDepth: parsed.data.IMAGEWORK_MAX_QUEUE_DEPTH,
  };
};

export class NodeCommandRunner implements CommandRunner {
  async run(command: string, args: readonly string[], options: CommandOptions = {}): Promise<string> {
    if (options.signal?.aborted) throw new CommandExecutionError();
    return new Promise<string>((resolve, reject) => {
      const child = spawn(command, args, { detached: process.platform !== "win32", env: options.env, stdio: "pipe" });
      const stdout: Buffer[] = [];
      let capturedStdoutBytes = 0;
      const maxCapturedStdoutBytes = 16 * 1024;
      child.stdout.on("data", (chunk: Buffer) => {
        if (!options.captureStdout || capturedStdoutBytes >= maxCapturedStdoutBytes) return;
        const output = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const captured = output.subarray(0, maxCapturedStdoutBytes - capturedStdoutBytes);
        stdout.push(captured);
        capturedStdoutBytes += captured.length;
      });
      child.stderr.resume();
      let settled = false;
      let terminationRequested = false;
      let killTimer: NodeJS.Timeout | undefined;
      const clearTimers = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (killTimer) clearTimeout(killTimer);
      };
      const complete = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimers();
        options.signal?.removeEventListener("abort", terminateChild);
        callback();
      };
      const sendSignal = (signal: NodeJS.Signals): boolean => {
        try {
          if (process.platform !== "win32" && child.pid) {
            process.kill(-child.pid, signal);
            return true;
          }
          return child.kill(signal);
        } catch (error) {
          if (isErrno(error, "ESRCH")) return false;
          complete(() => reject(new CommandExecutionError()));
          return false;
        }
      };
      const terminateChild = () => {
        if (settled || terminationRequested) return;
        terminationRequested = true;
        if (!sendSignal("SIGTERM")) return;
        killTimer = setTimeout(() => {
          if (!settled) sendSignal("SIGKILL");
        }, 5_000);
      };
      const timeoutTimer = options.timeoutMs === undefined ? undefined : setTimeout(terminateChild, options.timeoutMs);
      options.signal?.addEventListener("abort", terminateChild, { once: true });
      child.once("error", () => {
        complete(() => reject(new CommandExecutionError()));
      });
      child.once("exit", () => {
        if (!terminationRequested) clearTimers();
      });
      child.once("close", (code) => {
        complete(() => {
          if (code === 0 && !terminationRequested && !options.signal?.aborted) {
            resolve(Buffer.concat(stdout).toString("utf8"));
            return;
          }
          reject(new CommandExecutionError());
        });
      });
      child.stdin.end(options.input);
    });
  }
}

export class ColabJobRunner {
  private queue: Promise<void> = Promise.resolve();
  private queueDepth = 0;
  private recoveryComplete = false;
  private cliVersionChecked = false;

  constructor(private readonly config: RunnerConfig, private readonly commands: CommandRunner = new NodeCommandRunner()) {}

  run(input: ProcessInput, signal?: AbortSignal): Promise<JobResult> {
    if (signal?.aborted) return Promise.reject(new JobCancelledError());
    if (this.queueDepth >= this.config.maxQueueDepth) return Promise.reject(new QueueCapacityError());
    this.queueDepth += 1;
    let started = false;
    let cancelled = false;
    const current = this.queue.then(async () => {
      started = true;
      if (cancelled || signal?.aborted) throw new JobCancelledError();
      return this.runOne(input, signal);
    });
    this.queue = current.then(() => undefined, () => undefined);
    void current.then(() => { this.queueDepth -= 1; }, () => { this.queueDepth -= 1; });
    return new Promise<JobResult>((resolve, reject) => {
      const cancelQueuedJob = () => {
        cancelled = true;
        if (!started) reject(new JobCancelledError());
      };
      signal?.addEventListener("abort", cancelQueuedJob, { once: true });
      current.then(
        (result) => {
          signal?.removeEventListener("abort", cancelQueuedJob);
          if (cancelled) {
            reject(new JobCancelledError());
            return;
          }
          resolve(result);
        },
        (error) => {
          signal?.removeEventListener("abort", cancelQueuedJob);
          if (started || !cancelled) reject(error);
        },
      );
    });
  }

  private async runOne(input: ProcessInput, signal?: AbortSignal): Promise<JobResult> {
    throwIfAborted(signal);
    if (!matchesProcessingCode(input.processingCode, this.config.processingCode)) throw new ProcessingCodeError();
    await this.verifyCliVersion();
    await this.recoverStaleJobs();
    const startedAt = Date.now();
    const jobId = randomUUID();
    const localRoot = join(this.config.jobTmpRoot, jobId);
    const configRoot = join(this.config.colabConfigRoot, jobId);
    const homeRoot = join(configRoot, "home");
    const stateRoot = join(configRoot, "state");
    const cacheRoot = join(configRoot, "cache");
    const session = `imagework-${jobId}`;
    const remoteRoot = `/content/${session}`;
    const localInput = join(localRoot, `input${input.extension}`);
    const localToken = join(localRoot, "hf-token");
    const localConfig = join(localRoot, "job.json");
    const localWorker = join(localRoot, "remote-worker.py");
    const localResult = join(localRoot, "imagework-results.zip");
    const localCredentials = join(localRoot, "adc.json");
    const localRequirements = join(localRoot, samRequirementsFilename);
    const localBuildRequirements = join(localRoot, samBuildRequirementsFilename);
    const localCargoLock = join(localRoot, vtracerCargoLockFilename);
    const recoveryMarker = join(this.config.recoveryRoot, jobId);
    let sessionConfirmed = false;
    try {
      await Promise.all([localRoot, configRoot, homeRoot, stateRoot, cacheRoot, this.config.recoveryRoot].map((path) => mkdir(path, { recursive: true, mode: 0o700 })));
      await Promise.all([localRoot, configRoot, homeRoot, stateRoot, cacheRoot, this.config.recoveryRoot].map((path) => chmod(path, 0o700)));
      await Promise.all([
        writeFile(localInput, input.bytes, { mode: 0o600 }),
        writeFile(localToken, this.config.hfToken, { mode: 0o600 }),
        writeFile(localConfig, JSON.stringify({ mode: input.mode, box: input.box }), { mode: 0o600 }),
        copyFile(this.config.jobScript, localWorker),
        copyFile(this.config.googleApplicationCredentials, localCredentials),
        copyFile(join(dirname(this.config.jobScript), samRequirementsFilename), localRequirements),
        copyFile(join(dirname(this.config.jobScript), samBuildRequirementsFilename), localBuildRequirements),
        copyFile(join(dirname(this.config.jobScript), vtracerCargoLockFilename), localCargoLock),
        writeFile(recoveryMarker, preSessionMarker, { mode: 0o600 }),
      ]);
      await Promise.all([localInput, localToken, localConfig, localWorker, localCredentials, localRequirements, localBuildRequirements, localCargoLock, recoveryMarker].map((path) => chmod(path, 0o600)));
      const environment = isolatedEnvironment(homeRoot, stateRoot, cacheRoot, localCredentials);
      await this.colab(["new", "-s", session, "--gpu", this.config.accelerator], environment, startedAt, undefined, signal);
      sessionConfirmed = true;
      await writeFile(recoveryMarker, confirmedSessionMarker, { mode: 0o600 });
      await chmod(recoveryMarker, 0o600);
      await this.colab(["exec", "-s", session], environment, startedAt, `from pathlib import Path\nroot = Path(${JSON.stringify(remoteRoot)})\nroot.mkdir(parents=True, exist_ok=True)\n`, signal);
      await this.colab(["upload", "-s", session, localInput, `${remoteRoot}/${basename(localInput)}`], environment, startedAt, undefined, signal);
      await this.colab(["upload", "-s", session, localConfig, `${remoteRoot}/job.json`], environment, startedAt, undefined, signal);
      await this.colab(["upload", "-s", session, localWorker, `${remoteRoot}/remote-worker.py`], environment, startedAt, undefined, signal);
      await this.colab(["upload", "-s", session, localRequirements, `${remoteRoot}/${samRequirementsFilename}`], environment, startedAt, undefined, signal);
      await this.colab(["upload", "-s", session, localBuildRequirements, `${remoteRoot}/${samBuildRequirementsFilename}`], environment, startedAt, undefined, signal);
      await this.colab(["upload", "-s", session, localCargoLock, `${remoteRoot}/${vtracerCargoLockFilename}`], environment, startedAt, undefined, signal);
      const workerCommand = (stage: "--prepare" | "--run") => `import runpy\nimport sys\nsys.argv = ["remote-worker.py", ${JSON.stringify(stage)}]\nrunpy.run_path(${JSON.stringify(`${remoteRoot}/remote-worker.py`)}, run_name="__main__")\n`;
      await this.colab(["exec", "-s", session], environment, startedAt, workerCommand("--prepare"), signal);
      await this.colab(["upload", "-s", session, localToken, `${remoteRoot}/hf-token`], environment, startedAt, undefined, signal);
      await rm(localToken, { force: true });
      await this.colab(["exec", "-s", session], environment, startedAt, workerCommand("--run"), signal);
      await this.colab(["download", "-s", session, `${remoteRoot}/imagework-results.zip`, localResult], environment, startedAt, undefined, signal);
      const result = await extractRequestedResult(localResult, input.mode, input.outputFormat);
      return { bytes: result.bytes, name: result.name };
    } finally {
      await rm(localToken, { force: true });
      const remoteStopped = !sessionConfirmed || await this.cleanupRemote(session, remoteRoot, isolatedEnvironment(homeRoot, stateRoot, cacheRoot, localCredentials));
      await rm(localRoot, { force: true, recursive: true });
      if (remoteStopped) {
        await rm(recoveryMarker, { force: true });
        await rm(configRoot, { force: true, recursive: true });
      } else {
        this.recoveryComplete = false;
        throw new CommandExecutionError();
      }
    }
  }

  private async colab(command: readonly string[], environment: IsolatedEnvironment, startedAt: number, input?: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const remainingMs = this.config.timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) throw new JobTimeoutError();
    const execTimeoutSeconds = String(Math.max(1, Math.ceil(remainingMs / 1000)));
    const args = ["--auth", this.config.authMode, "--config", join(environment.XDG_CONFIG_HOME, "sessions.json"), ...withRemoteExecTimeout(command, execTimeoutSeconds)];
    try {
      await this.commands.run("colab", args, { env: environment, input, timeoutMs: remainingMs, signal });
    } catch (error) {
      if (signal?.aborted) throw new JobCancelledError();
      if (error instanceof CommandExecutionError) {
        if (Date.now() - startedAt >= this.config.timeoutMs) throw new JobTimeoutError();
        throw error;
      }
      throw error;
    }
  }

  private async verifyCliVersion(): Promise<void> {
    if (this.cliVersionChecked) return;
    const version = await this.commands.run("colab", ["version"], { timeoutMs: 30_000, captureStdout: true });
    if (version.trim() !== `Version: ${requiredColabCliVersion}`) throw new RunnerConfigurationError();
    this.cliVersionChecked = true;
  }

  private async cleanupRemote(session: string, remoteRoot: string, environment: IsolatedEnvironment): Promise<boolean> {
    const args = ["--auth", this.config.authMode, "--config", join(environment.XDG_CONFIG_HOME, "sessions.json")];
    await Promise.allSettled([
      this.commands.run("colab", [...args, "exec", "-s", session, "--timeout", "30"], {
        env: environment,
        input: `import shutil\nshutil.rmtree(${JSON.stringify(remoteRoot)}, ignore_errors=True)\n`,
        timeoutMs: 30_000,
      }),
    ]);
    try {
      await this.commands.run("colab", [...args, "stop", "-s", session], { env: environment, timeoutMs: 30_000 });
      return (await this.sessionPresence(session, environment)) === "absent";
    } catch {
      return false;
    }
  }

  private async sessionPresence(session: string, environment: IsolatedEnvironment): Promise<"present" | "absent" | "unknown"> {
    const output = await this.commands.run("colab", ["--auth", this.config.authMode, "--config", join(environment.XDG_CONFIG_HOME, "sessions.json"), "sessions"], {
      env: environment,
      timeoutMs: 30_000,
      captureStdout: true,
    });
    const status = output.trim();
    if (status === "[colab] No active sessions found on server.") return "absent";
    const names = status.split(/\r?\n/).map((line) => /^\[(.+?)\]\s+\S+\s+\|\s+Hardware:\s+.+\s+\|\s+Variant:\s+\S+$/u.exec(line)?.[1]);
    if (names.length === 0 || names.some((name) => name === undefined)) return "unknown";
    return names.includes(session) ? "present" : "absent";
  }

  private async recoverStaleJobs(): Promise<void> {
    if (this.recoveryComplete) return;
    await mkdir(this.config.recoveryRoot, { recursive: true, mode: 0o700 });
    const markers = await readdir(this.config.recoveryRoot, { withFileTypes: true });
    for (const marker of markers.filter((marker) => marker.isFile() && /^[0-9a-f-]{36}$/.test(marker.name))) {
      const jobId = marker.name;
      const configRoot = join(this.config.colabConfigRoot, jobId);
      const environment = isolatedEnvironment(join(configRoot, "home"), join(configRoot, "state"), join(configRoot, "cache"), this.config.googleApplicationCredentials);
      const session = `imagework-${jobId}`;
      const presence = await this.sessionPresence(session, environment);
      if (presence === "absent") {
        await Promise.all([rm(join(this.config.recoveryRoot, jobId), { force: true }), rm(join(this.config.jobTmpRoot, jobId), { force: true, recursive: true }), rm(configRoot, { force: true, recursive: true })]);
        continue;
      }
      const args = ["--auth", this.config.authMode, "--config", join(environment.XDG_CONFIG_HOME, "sessions.json"), "stop", "-s", session];
      await this.commands.run("colab", args, { env: environment, timeoutMs: 30_000 });
      if ((await this.sessionPresence(session, environment)) !== "absent") throw new CommandExecutionError();
      await Promise.all([rm(join(this.config.recoveryRoot, jobId), { force: true }), rm(join(this.config.jobTmpRoot, jobId), { force: true, recursive: true }), rm(configRoot, { force: true, recursive: true })]);
    }
    this.recoveryComplete = true;
  }
}

export const matchesProcessingCode = (received: string, expected: string): boolean => {
  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new JobCancelledError();
};

const isolatedEnvironment = (home: string, state: string, cache: string, credentials: string): IsolatedEnvironment => ({
  PATH: process.env.PATH ?? "/usr/bin:/bin",
  HOME: home,
  XDG_CONFIG_HOME: state,
  XDG_STATE_HOME: state,
  XDG_CACHE_HOME: cache,
  GOOGLE_APPLICATION_CREDENTIALS: credentials,
  LANG: "C.UTF-8",
  NODE_ENV: process.env.NODE_ENV ?? "production",
});

const withRemoteExecTimeout = (command: readonly string[], timeoutSeconds: string): readonly string[] => {
  const action = command[0];
  if (action !== "exec") return command;
  return [...command, "--timeout", timeoutSeconds];
};

const isErrno = (error: unknown, code: string): error is NodeJS.ErrnoException => error instanceof Error && "code" in error && error.code === code;
