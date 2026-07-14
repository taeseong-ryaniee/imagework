import { clearTimeout, setTimeout } from "node:timers";
import { z } from "zod";
import { ImageworkInputError, JobRegistrationError } from "./colab-errors";

const processJobIdSchema = z.string().uuid().brand("ProcessJobId");
const defaultPendingCancelTtlMs = 5 * 60 * 1000;
const defaultMaxPendingCancels = 1_024;

export type ProcessJobId = z.infer<typeof processJobIdSchema>;

type RegisteredJob = {
  readonly kind: "registered";
  readonly controller: AbortController;
};

type PendingCancellation = {
  readonly kind: "pending";
  readonly controller: AbortController;
  readonly expiresAt: number;
};

type RegistryEntry = RegisteredJob | PendingCancellation;

type RegistryOptions = {
  readonly now?: () => number;
  readonly pendingCancelTtlMs?: number;
  readonly maxPendingCancels?: number;
};

export const parseProcessJobId = (value: unknown): ProcessJobId => {
  const parsed = processJobIdSchema.safeParse(value);
  if (!parsed.success) throw new ImageworkInputError();
  return parsed.data;
};

export class ProcessJobRegistry {
  private readonly jobs = new Map<ProcessJobId, RegistryEntry>();
  private readonly expiryTimers = new Map<ProcessJobId, NodeJS.Timeout>();
  private readonly now: () => number;
  private readonly pendingCancelTtlMs: number;
  private readonly maxPendingCancels: number;

  constructor(options: RegistryOptions = {}) {
    this.now = options.now ?? Date.now;
    this.pendingCancelTtlMs = options.pendingCancelTtlMs ?? defaultPendingCancelTtlMs;
    this.maxPendingCancels = options.maxPendingCancels ?? defaultMaxPendingCancels;
  }

  register(jobId: ProcessJobId): AbortSignal {
    this.pruneExpiredPendingCancellations();
    const existing = this.jobs.get(jobId);
    switch (existing?.kind) {
      case "registered":
        throw new JobRegistrationError();
      case "pending":
        this.clearExpiryTimer(jobId);
        this.jobs.set(jobId, { kind: "registered", controller: existing.controller });
        return existing.controller.signal;
      default: {
        const controller = new AbortController();
        this.jobs.set(jobId, { kind: "registered", controller });
        return controller.signal;
      }
    }
  }

  cancel(jobId: ProcessJobId): void {
    this.pruneExpiredPendingCancellations();
    const existing = this.jobs.get(jobId);
    switch (existing?.kind) {
      case "registered":
        existing.controller.abort();
        return;
      case "pending":
        return;
      default:
        this.enforcePendingCapacity();
        this.recordPendingCancellation(jobId);
    }
  }

  complete(jobId: ProcessJobId): void {
    this.remove(jobId);
  }

  private recordPendingCancellation(jobId: ProcessJobId): void {
    const controller = new AbortController();
    controller.abort();
    const expiresAt = this.now() + this.pendingCancelTtlMs;
    this.jobs.set(jobId, { kind: "pending", controller, expiresAt });
    const timer = setTimeout(() => {
      const entry = this.jobs.get(jobId);
      switch (entry?.kind) {
        case "pending":
          if (entry.controller === controller && entry.expiresAt <= this.now()) this.remove(jobId);
          return;
        case "registered":
        default:
          return;
      }
    }, this.pendingCancelTtlMs);
    timer.unref();
    this.expiryTimers.set(jobId, timer);
  }

  private enforcePendingCapacity(): void {
    let pendingCount = 0;
    for (const entry of this.jobs.values()) {
      switch (entry.kind) {
        case "pending":
          pendingCount += 1;
          break;
        case "registered":
          break;
      }
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
      switch (entry.kind) {
        case "pending":
          return jobId;
        case "registered":
          break;
      }
    }
    return undefined;
  }

  private pruneExpiredPendingCancellations(): void {
    for (const [jobId, entry] of this.jobs) {
      switch (entry.kind) {
        case "pending":
          if (entry.expiresAt <= this.now()) this.remove(jobId);
          break;
        case "registered":
          break;
      }
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
