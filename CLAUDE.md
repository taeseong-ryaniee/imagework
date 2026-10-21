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

A single-page Next.js App Router app: the browser submits one raster image, a normalized target box, an asset mode (`logo`/`icon`/`photo`), and a download format (`png`/`svg`/`zip`) to `/api/process`, which queues the job and responds `202 {jobId}` immediately. A **long-lived local worker process** (spawned once at server startup, holding an exclusive GPU `flock`) runs `runner/local-worker.py` (SAM3 segmentation + vtracer) against the host's own GPU, one job at a time. The browser polls `/api/process/status` for `queued`/`processing`/`done`/`failed`/`cancelled`, then downloads the validated result from `/api/process/result`. There is no database and no persistent storage; job state lives only in the in-process registry and per-job temp directories until the result is downloaded or its retention TTL (`IMAGEWORK_RESULT_TTL_SECONDS`) elapses.

## Request flow (the chain to read first)

1. `components/image-processor.tsx` — client form; measures pixel dimensions locally, drag-synchronized normalized box, sends multipart POST to `/api/process` with the processing code in the `x-imagework-processing-code` header and a client-generated `jobId` UUID, then polls status and downloads the result.
2. `lib/image-input.ts` — zod schema plus hand-rolled binary header parsing (PNG/GIF/BMP/WebP/JPEG) to enforce 10 MiB / 20 MP caps server-side; the multipart envelope cap is 11 MiB.
3. `lib/local-job-runner.ts` — the core. Holds an in-process FIFO promise queue (`IMAGEWORK_MAX_QUEUE_DEPTH` cap → 429) in front of a single long-lived local worker process: spawn at startup → take the GPU `flock` → sweep orphaned tmp dirs → process jobs one at a time (scoped `SIGUSR1` cancellation, respawn-with-circuit-breaker on crash) → validate and hold each result until download or TTL expiry.
4. `app/api/process/status/route.ts` — reports the registry's `queued`/`processing`/`done`/`failed`/`cancelled` state (plus `queuePosition` while queued) for a `jobId`.
5. `app/api/process/result/route.ts` — streams back exactly the requested file once a job is `done`, then deletes the job's local state.
6. `lib/zip-contract.ts` — strict result validation: exact expected members per mode, PNG signature and pixel caps, SVG restricted to a static element/attribute whitelist.
7. `lib/output-format.ts` — maps the chosen format to filename/content type; SVG is only valid for logo/icon.
8. `app/api/process/route.ts` — wires it together and maps every error class from `lib/job-errors.ts` to a fixed Korean message with a specific status (400 input, 429 queue, 499 cancelled, 502 bad result, 503 not configured/worker failure, 504 timeout).

## Cancellation

The client can POST `/api/process/cancel` with `{jobId, processingCode}`. `lib/process-job-registry.ts` maps jobId → job state; a cancel arriving **before** the job registers is stored as a TTL'd pre-aborted entry so the race resolves correctly. Cancellation is explicit-API-only: a queued job is removed from the queue without touching the worker, and an active job gets a scoped `SIGUSR1` (30s grace, then `SIGKILL` + respawn) only if its `jobId` matches the worker's `currentJobId`. Closing the browser connection does not by itself cancel a job — the async API has no long-lived request to disconnect from.

## Invariants to preserve

- **Per-job isolation:** every job gets its own tmp dir at `0o700` with files at `0o600`. The worker holds the shared GPU exclusively via a `flock` inside `IMAGEWORK_MODEL_CACHE`, taken once at startup, not per job.
- **Cleanup always runs:** a job's tmp dir and result are removed as soon as the result downloads, or after `IMAGEWORK_RESULT_TTL_SECONDS` elapses. On startup, before accepting jobs, the runner sweeps `IMAGEWORK_JOB_TMP_ROOT` for orphaned directories left by an unclean shutdown; a respawn circuit breaker (>3 crashes/10min) stops retrying and fails every active/queued job instead of looping.
- **Nothing sensitive reaches the browser:** error messages are intentionally generic Korean strings; never add worker output, paths, or env details to a response.
- **Processing code is a server secret** compared with `timingSafeEqual` — never place it in `NEXT_PUBLIC_*`, source, URLs, or logs.
- **Never commit** `.env`, credentials, tokens, or generated results — `check:public-artifacts` gates this in CI-style checks.

## Testing pattern

Route handlers are exported factories (`createProcessHandler(runnerProvider, registry, configProvider)`, `createCancelHandler(...)`), and `LocalJobRunner` accepts `WorkerProcessFactory`/`GpuLock` interfaces — tests inject a fake worker process and fake GPU lock instead of spawning the real Python worker. Follow this DI pattern when extending server code. Tests run under vitest with jsdom (`vitest.config.mts`); the `@/` alias maps to the repo root.

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
