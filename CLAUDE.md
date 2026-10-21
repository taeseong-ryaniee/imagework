# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev                      # dev server
npm test                         # vitest run (all tests)
npx vitest run tests/zip-contract.test.ts   # single test file
npx tsc --noEmit                 # type check
npm run lint                     # eslint
npm run check:public-artifacts   # no committed .env, tokens, or result artifacts
npm run build                    # production build (also part of the release check set)
```

The full pre-release check set is: `npm test`, `npx tsc --noEmit`, `npm run lint`, both `check:*` scripts, then `npm run build` (see README "Checks").

Production (`npm start`) requires every `IMAGEWORK_*` env var filled per `.env.example` plus a provisioned Python worker environment (see `scripts/provision-worker.sh`); tests do not — they inject fakes.

## What this app is

A single-page Next.js App Router app: the browser submits one raster image, a normalized target box, an asset mode (`logo`/`icon`/`photo`), and a download format (`png`/`svg`/`zip`) to `/api/process`, which queues the job and responds `202 {jobId}` immediately. A **long-lived local worker process** (spawned in its own process group when the runner starts on the first submission, and again after a stop or crash; the runner holds an exclusive GPU `flock`) runs `runner/local-worker.py` (SAM3 segmentation + vtracer) against the host's own GPU, one job at a time. The browser polls `/api/process/status` for `queued`/`processing`/`done`/`failed`/`cancelled`, then downloads the validated result from `/api/process/result`. There is no database and no persistent storage; job state lives only in the in-process registry and per-job temp directories. A result is served once; an undownloaded result is deleted when `IMAGEWORK_RESULT_TTL_SECONDS` elapses, which the status route reports to the client as `expiresAt` for `done` jobs.

## Request flow (the chain to read first)

1. `components/image-processor.tsx` — client form; measures pixel dimensions locally, drag-synchronized normalized box, sends multipart POST to `/api/process` with the processing code in the `x-imagework-processing-code` header and a client-generated `jobId` UUID, then polls status and downloads the result.
2. `lib/image-input.ts` — zod schema plus hand-rolled binary header parsing (PNG/GIF/BMP/WebP/JPEG) to enforce 10 MiB / 20 MP caps server-side; the multipart envelope cap is 11 MiB.
3. `lib/local-job-runner.ts` — the core. Holds an in-process FIFO promise queue (`IMAGEWORK_MAX_QUEUE_DEPTH` cap → 429) in front of a single long-lived local worker process: the first submission constructs it → take the GPU `flock` → sweep orphaned tmp dirs → spawn the worker → process jobs one at a time (scoped `SIGUSR1` cancellation, respawn-with-circuit-breaker on crash). Jobs submitted while the worker is starting or respawning are queued and dispatch once it reports ready; only a failed startup, an open circuit or a full queue refuse a submission. Each job gets its own directory; the validated result is held until its single download or TTL expiry.
4. `app/api/process/status/route.ts` — reports the registry's `queued`/`processing`/`done`/`failed`/`cancelled` state (plus `queuePosition` while queued) for a `jobId`.
5. `app/api/process/result/route.ts` — serves exactly the requested file once a job is `done`: the registry claim is synchronous, the file is buffered, then the job directory is deleted. A repeated or concurrent fetch gets 400.
6. `lib/zip-contract.ts` — strict result validation: exact expected members per mode, PNG signature and pixel caps, SVG restricted to a static element/attribute whitelist.
7. `lib/output-format.ts` — maps the chosen format to filename/content type; SVG is only valid for logo/icon.
8. `app/api/process/route.ts` — wires it together and maps every error class from `lib/job-errors.ts` to a fixed Korean message with a specific status (400 input, 429 queue, 499 cancelled, 502 bad result, 503 not configured/worker failure, 504 timeout). Admission refusals — startup failed or circuit open 503, queue full 429 with `Retry-After: 60`, cancelled before submission 499 — are answered instead of `202`, and leave no `queued` registry entry.

## Cancellation

The client can POST `/api/process/cancel` with `{jobId, processingCode}`. `lib/process-job-registry.ts` maps jobId → job state; a cancel arriving **before** the job registers is stored as a TTL'd pre-aborted entry so the race resolves correctly. Cancellation is explicit-API-only: a queued job is removed from the queue without touching the worker, and an active job gets a scoped `SIGUSR1` to the worker process only (30s grace, then `SIGKILL` to the worker's whole **process group** — vtracer can outlive Python — and a respawn) only if it is the job on the worker. Cancellation is visible immediately. If the worker acknowledges with its own terminal message the live worker is kept and the job directory is deleted once pending Node file writes have settled; only a forced stop (grace expiry, timeout, crash) deletes the directory and spawns the replacement after the group is gone and those writes have settled. A cancellation applies to one attempt (queue entry), not to every attempt with the same `jobId`; an attempt still staging its files is never signalled. Closing the browser connection does not by itself cancel a job — the async API has no long-lived request to disconnect from.

## Invariants to preserve

- **Per-job isolation:** every job gets its own tmp dir at `0o700` with files at `0o600`. The worker holds the shared GPU exclusively via a `flock` inside `IMAGEWORK_MODEL_CACHE`, taken once when the runner starts, not per job.
- **Cleanup waits for every writer:** a downloaded result's directory is deleted by the download; an undownloaded one when `IMAGEWORK_RESULT_TTL_SECONDS` elapses. A failed or cancelled job's directory is deleted once pending Node I/O has settled when the worker ended the job with its own terminal message (the live worker is reused), and once the worker's process group has stopped as well when the job ended by a forced stop or an unplanned worker failure (including an error on the worker's stdin, stdout or stderr pipe). A successful job's input and result stay until download or expiry. If a group cannot be confirmed stopped — during recovery, startup abandonment or disposal — its directory and the GPU lock are kept, the circuit opens and no replacement is spawned. The synchronous process `exit` callback cannot await a stop or observe reaping, so it follows its own rule: any unconfirmed stop keeps the lock; a live worker generation (starting, ready or processing) gets one synchronous `SIGKILL` to its whole process group (`WorkerHandle.killGroupSync`) and the lock is released only when that signal was sent or the group was already gone (`ESRCH`), while any other error (for example `EPERM`) keeps it; with no generation and no unconfirmed stop it releases. That release relies on `SIGKILL` delivery, not on observed reaping — systemd's control-group kill remains the production guarantee. On startup, after the lock and before spawning the worker, the runner sweeps `IMAGEWORK_JOB_TMP_ROOT` for orphaned directories left by an unclean shutdown; a respawn circuit breaker (>3 crashes/10min) stops retrying and fails every queued job instead of looping.
- **Nothing sensitive reaches the browser:** error messages are intentionally generic Korean strings; never add worker output, paths, or env details to a response.
- **Processing code is a server secret** compared with `timingSafeEqual` — never place it in `NEXT_PUBLIC_*`, source, URLs, or logs.
- **Never commit** `.env`, credentials, tokens, or generated results — `check:public-artifacts` gates this in CI-style checks.

## Testing pattern

Route handlers are exported factories (`createProcessHandler(runnerProvider, registry, configProvider)`, `createCancelHandler(...)`), and `LocalJobRunner` accepts `WorkerProcessFactory`/`GpuLock` interfaces — tests inject a fake worker process and fake GPU lock instead of spawning the real Python worker. Follow this DI pattern when extending server code. Tests run under vitest with jsdom (`vitest.config.mts`); the two server test files that wrap `node:fs/promises`, `node:timers` or `node:child_process` opt into `// @vitest-environment node`, because jsdom does not apply those mocks to source modules. The `@/` alias maps to the repo root. Registry/runner tests create every result path and job root under `os.tmpdir()` and dispose what they construct, since expiry cleanup deletes directories.

## Docs that matter

- `docs/server-worker.md` — canonical deployment guide (host setup, ADC auth, job lifecycle, release verification).
- `docs/reverse-proxy.md` + `deploy/nginx.conf.example` — the admission boundary (11 MiB envelope, per-IP limits) that must sit in front of the Node server; deploy as a Node server, never static export.
- `DESIGN.md` — design-system contract for the single form (tokens, component states, accessibility QA set). Consult it before touching UI in `app/page.tsx` / `components/image-processor.tsx`; UI copy and error messages are Korean.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
