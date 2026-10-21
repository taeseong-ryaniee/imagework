import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { z } from "zod";
import { ImageworkInputError, JobRegistrationError, RunnerConfigurationError } from "./job-errors";

const processJobIdSchema = z.string().uuid().brand("ProcessJobId");
const defaultPendingCancelTtlMs = 5 * 60 * 1000;
const defaultMaxPendingCancels = 1_024;
const defaultResultTtlMs = 600 * 1000;
const maxTimerDelayMs = 2 ** 31 - 1; // setTimeout fires immediately above this; longer deadlines are re-armed

export type ProcessJobId = z.infer<typeof processJobIdSchema>;

export type ProcessJobState = "queued" | "processing" | "done" | "failed" | "cancelled";

export type ProcessJobStatus = {
  readonly state: ProcessJobState;
  readonly queuePosition?: number;
  readonly resultPath?: string;
  readonly errorKind?: string;
  readonly expiresAt?: number;
};

type JobEntry = {
  readonly kind: "job";
  readonly state: ProcessJobState;
  readonly controller: AbortController;
  readonly resultPath?: string;
  readonly errorKind?: string;
  readonly expiresAt?: number;
};

type PendingCancellation = {
  readonly kind: "pending";
  readonly controller: AbortController;
  readonly expiresAt: number;
};

type RegistryEntry = JobEntry | PendingCancellation;

type RegistryOptions = {
  readonly now?: () => number;
  readonly pendingCancelTtlMs?: number;
  readonly maxPendingCancels?: number;
  readonly resultTtlMs?: number;
};

export const parseProcessJobId = (value: unknown): ProcessJobId => {
  const parsed = processJobIdSchema.safeParse(value);
  if (!parsed.success) throw new ImageworkInputError();
  return parsed.data;
};

// State machine: queued -> processing -> done | failed | cancelled; a terminal state is final.
// A `pending` entry is a cancellation that arrived before `register` (see `cancel`'s
// default branch) — it is not yet a job and carries its own TTL, independent of the
// result TTL that terminal job entries get once they reach done/failed/cancelled.
//
// Result ownership: a `done` entry owns its result directory until `claimResult` hands it to the
// download, or its TTL expires and the registry deletes it. Failed/cancelled job directories are
// not the registry's: the runner deletes them once nothing can still write to them.
export class ProcessJobRegistry {
  private readonly jobs = new Map<ProcessJobId, RegistryEntry>();
  private readonly expiryTimers = new Map<ProcessJobId, NodeJS.Timeout>();
  private readonly now: () => number;
  private readonly pendingCancelTtlMs: number;
  private readonly maxPendingCancels: number;
  private readonly cleanups = new Set<Promise<void>>();
  private readonly failedCleanups = new Set<string>();
  private resultTtlMs = defaultResultTtlMs;

  constructor(options: RegistryOptions = {}) {
    this.now = options.now ?? Date.now;
    this.pendingCancelTtlMs = options.pendingCancelTtlMs ?? defaultPendingCancelTtlMs;
    this.maxPendingCancels = options.maxPendingCancels ?? defaultMaxPendingCancels;
    this.configureResultTtl(options.resultTtlMs ?? defaultResultTtlMs);
  }

  // The runner applies IMAGEWORK_RESULT_TTL_SECONDS to the registry it was given, including the shared
  // singleton the route handlers captured. Only deadlines computed afterwards use the new value.
  configureResultTtl(resultTtlMs: number): void {
    if (!Number.isSafeInteger(resultTtlMs) || resultTtlMs < 1 || !Number.isSafeInteger(this.now() + resultTtlMs)) throw new RunnerConfigurationError();
    this.resultTtlMs = resultTtlMs;
  }

  register(jobId: ProcessJobId): AbortSignal {
    this.pruneExpired();
    const existing = this.jobs.get(jobId);
    switch (existing?.kind) {
      case "job":
        throw new JobRegistrationError();
      case "pending":
        this.clearExpiryTimer(jobId);
        this.jobs.set(jobId, { kind: "job", state: "queued", controller: existing.controller });
        return existing.controller.signal;
      default: {
        const controller = new AbortController();
        this.jobs.set(jobId, { kind: "job", state: "queued", controller });
        return controller.signal;
      }
    }
  }

  cancel(jobId: ProcessJobId): void {
    this.pruneExpired();
    const existing = this.jobs.get(jobId);
    switch (existing?.kind) {
      case "job":
        switch (existing.state) {
          case "queued":
          case "processing":
            existing.controller.abort();
            this.markCancelled(jobId);
            return;
          default:
            return;
        }
      case "pending":
        return;
      default:
        this.enforcePendingCapacity();
        this.recordPendingCancellation(jobId);
    }
  }

  // The transition setters take the AbortSignal `register` returned: a callback still held by an
  // expired registration then cannot touch a later registration of the same jobId.
  markProcessing(jobId: ProcessJobId, signal?: AbortSignal): void {
    const entry = this.jobs.get(jobId);
    if (entry?.kind !== "job" || entry.state !== "queued" || !this.isAttempt(entry, signal)) return;
    this.jobs.set(jobId, { ...entry, state: "processing" });
  }

  // Each terminal setter returns whether it applied; it refuses an entry that is already terminal.
  markDone(jobId: ProcessJobId, resultPath: string, signal?: AbortSignal): boolean {
    return this.terminate(jobId, signal, { state: "done", resultPath, errorKind: undefined });
  }

  markFailed(jobId: ProcessJobId, errorKind: string, signal?: AbortSignal): boolean {
    return this.terminate(jobId, signal, { state: "failed", resultPath: undefined, errorKind });
  }

  markCancelled(jobId: ProcessJobId, signal?: AbortSignal): boolean {
    return this.terminate(jobId, signal, { state: "cancelled", resultPath: undefined, errorKind: undefined });
  }

  // Synchronous on purpose: the first caller takes the result path and every later caller (or the
  // expiry sweep) sees none, so one download owns the directory from here on.
  claimResult(jobId: ProcessJobId): string | undefined {
    this.pruneExpired();
    const entry = this.jobs.get(jobId);
    if (entry?.kind !== "job" || entry.state !== "done" || !entry.resultPath) return undefined;
    this.jobs.set(jobId, { ...entry, resultPath: undefined });
    return entry.resultPath;
  }

  // Stops the expiry timers and waits for result-directory deletions; a deletion that failed earlier is retried once.
  async dispose(): Promise<void> {
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
    await Promise.all(this.cleanups);
    await Promise.all([...this.failedCleanups].map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
      this.failedCleanups.delete(directory);
    }));
  }

  private isAttempt(entry: JobEntry, signal?: AbortSignal): boolean {
    return signal === undefined || entry.controller.signal === signal;
  }

  private terminate(jobId: ProcessJobId, signal: AbortSignal | undefined, outcome: Pick<JobEntry, "state" | "resultPath" | "errorKind">): boolean {
    const entry = this.jobs.get(jobId);
    if (entry?.kind !== "job" || (entry.state !== "queued" && entry.state !== "processing") || !this.isAttempt(entry, signal)) return false;
    const expiresAt = this.now() + this.resultTtlMs;
    this.jobs.set(jobId, { ...entry, ...outcome, expiresAt });
    this.armExpiryTimer(jobId, expiresAt);
    return true;
  }

  read(jobId: ProcessJobId): ProcessJobStatus | undefined {
    this.pruneExpired();
    const entry = this.jobs.get(jobId);
    if (entry?.kind !== "job") return undefined;
    if (entry.state !== "queued") {
      return { state: entry.state, resultPath: entry.resultPath, errorKind: entry.errorKind, expiresAt: entry.expiresAt };
    }
    return { state: entry.state, queuePosition: this.queuePositionOf(jobId) };
  }

  private queuePositionOf(jobId: ProcessJobId): number {
    let position = 0;
    for (const [id, entry] of this.jobs) {
      if (entry.kind !== "job" || entry.state !== "queued") continue;
      position += 1;
      if (id === jobId) return position;
    }
    return position;
  }

  private recordPendingCancellation(jobId: ProcessJobId): void {
    const controller = new AbortController();
    controller.abort();
    const expiresAt = this.now() + this.pendingCancelTtlMs;
    this.jobs.set(jobId, { kind: "pending", controller, expiresAt });
    this.armExpiryTimer(jobId, expiresAt);
  }

  private armExpiryTimer(jobId: ProcessJobId, expiresAt: number): void {
    this.clearExpiryTimer(jobId);
    const delayMs = Math.max(0, expiresAt - this.now());
    const timer = setTimeout(() => {
      this.expiryTimers.delete(jobId);
      this.pruneExpired();
      const entry = this.jobs.get(jobId);
      if (delayMs > maxTimerDelayMs && entry?.expiresAt !== undefined) this.armExpiryTimer(jobId, entry.expiresAt);
    }, Math.min(delayMs, maxTimerDelayMs));
    timer.unref();
    this.expiryTimers.set(jobId, timer);
  }

  private enforcePendingCapacity(): void {
    let pendingCount = 0;
    for (const entry of this.jobs.values()) {
      if (entry.kind === "pending") pendingCount += 1;
    }
    while (pendingCount >= this.maxPendingCancels) {
      const oldestPendingJobId = this.oldestPendingJobId();
      if (!oldestPendingJobId) return;
      this.remove(oldestPendingJobId);
      pendingCount -= 1;
    }
  }

  private oldestPendingJobId(): ProcessJobId | undefined {
    for (const [jobId, entry] of this.jobs) {
      if (entry.kind === "pending") return jobId;
    }
    return undefined;
  }

  // Single sweep for both TTL kinds: a `pending` entry's expiresAt is always set, a
  // `job` entry's expiresAt is only set once it reaches done/failed/cancelled — while
  // queued/processing it stays undefined and is never swept here.
  private pruneExpired(): void {
    const nowMs = this.now();
    for (const [jobId, entry] of this.jobs) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= nowMs) this.remove(jobId);
    }
  }

  private clearExpiryTimer(jobId: ProcessJobId): void {
    const timer = this.expiryTimers.get(jobId);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(jobId);
  }

  private remove(jobId: ProcessJobId): void {
    const entry = this.jobs.get(jobId);
    this.clearExpiryTimer(jobId);
    this.jobs.delete(jobId);
    // An unclaimed result is still owned here; a claimed one (no resultPath) belongs to its download.
    if (entry?.kind === "job" && entry.state === "done" && entry.resultPath) this.deleteDirectory(dirname(entry.resultPath));
  }

  private deleteDirectory(directory: string): void {
    const cleanup: Promise<void> = rm(directory, { recursive: true, force: true }).then(
      () => undefined,
      () => {
        this.failedCleanups.add(directory);
        console.error("[process-job-registry] result directory cleanup failed.");
      },
    ).then(() => {
      this.cleanups.delete(cleanup);
    });
    this.cleanups.add(cleanup);
  }
}

export const processJobRegistry = new ProcessJobRegistry();
