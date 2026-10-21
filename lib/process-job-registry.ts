import { clearTimeout, setTimeout } from "node:timers";
import { z } from "zod";
import { ImageworkInputError, JobRegistrationError } from "./job-errors";

const processJobIdSchema = z.string().uuid().brand("ProcessJobId");
const defaultPendingCancelTtlMs = 5 * 60 * 1000;
const defaultMaxPendingCancels = 1_024;
const defaultResultTtlMs = 600 * 1000;

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

// State machine: queued -> processing -> done | failed | cancelled.
// A `pending` entry is a cancellation that arrived before `register` (see `cancel`'s
// default branch) — it is not yet a job and carries its own TTL, independent of the
// result TTL that terminal job entries get once they reach done/failed/cancelled.
export class ProcessJobRegistry {
  private readonly jobs = new Map<ProcessJobId, RegistryEntry>();
  private readonly expiryTimers = new Map<ProcessJobId, NodeJS.Timeout>();
  private readonly now: () => number;
  private readonly pendingCancelTtlMs: number;
  private readonly maxPendingCancels: number;
  private readonly resultTtlMs: number;

  constructor(options: RegistryOptions = {}) {
    this.now = options.now ?? Date.now;
    this.pendingCancelTtlMs = options.pendingCancelTtlMs ?? defaultPendingCancelTtlMs;
    this.maxPendingCancels = options.maxPendingCancels ?? defaultMaxPendingCancels;
    this.resultTtlMs = options.resultTtlMs ?? defaultResultTtlMs;
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

  markProcessing(jobId: ProcessJobId): void {
    const entry = this.jobs.get(jobId);
    if (entry?.kind !== "job" || entry.state !== "queued") return;
    this.jobs.set(jobId, { ...entry, state: "processing" });
  }

  markDone(jobId: ProcessJobId, resultPath: string): void {
    const entry = this.jobs.get(jobId);
    if (entry?.kind !== "job") return;
    const expiresAt = this.now() + this.resultTtlMs;
    this.jobs.set(jobId, { ...entry, state: "done", resultPath, errorKind: undefined, expiresAt });
    this.armExpiryTimer(jobId, expiresAt);
  }

  markFailed(jobId: ProcessJobId, errorKind: string): void {
    const entry = this.jobs.get(jobId);
    if (entry?.kind !== "job") return;
    const expiresAt = this.now() + this.resultTtlMs;
    this.jobs.set(jobId, { ...entry, state: "failed", resultPath: undefined, errorKind, expiresAt });
    this.armExpiryTimer(jobId, expiresAt);
  }

  markCancelled(jobId: ProcessJobId): void {
    const entry = this.jobs.get(jobId);
    if (entry?.kind !== "job") return;
    const expiresAt = this.now() + this.resultTtlMs;
    this.jobs.set(jobId, { ...entry, state: "cancelled", resultPath: undefined, errorKind: undefined, expiresAt });
    this.armExpiryTimer(jobId, expiresAt);
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
    const timer = setTimeout(() => this.pruneExpired(), delayMs);
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
    this.clearExpiryTimer(jobId);
    this.jobs.delete(jobId);
  }
}

export const processJobRegistry = new ProcessJobRegistry();
