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
npm run check:colab-notebook     # archived notebook must stay non-executable, no secrets
npm run check:public-artifacts   # no committed .env, tokens, or result artifacts
npm run build                    # production build (also part of the release check set)
```

The full pre-release check set is: `npm test`, `npx tsc --noEmit`, `npm run lint`, both `check:*` scripts, then `npm run build` (see README "Checks").

Production (`npm start`) requires every `IMAGEWORK_*` env var filled per `.env.example` plus a server-only `colab` CLI install; tests do not — they inject fakes.

## What this app is

A single-page Next.js App Router app: the browser submits one raster image, a normalized target box, an asset mode (`logo`/`icon`/`photo`), and a download format (`png`/`svg`/`zip`). The server spawns a **temporary Google Colab GPU session** through the official `colab` CLI (version pinned, checked at runtime), runs `runner/remote-worker.py` there (SAM3 segmentation + vtracer, with pinned lock files uploaded per job), validates the result archive, streams back exactly the requested file, and deletes all job state. There is no database and no persistent storage; job state lives only in per-job temp directories for the duration of one request.

## Request flow (the chain to read first)

1. `components/image-processor.tsx` — client form; measures pixel dimensions locally, drag-synchronized normalized box, sends multipart POST to `/api/process` with the processing code in the `x-imagework-processing-code` header and a client-generated `jobId` UUID.
2. `lib/colab-input.ts` — zod schema plus hand-rolled binary header parsing (PNG/GIF/BMP/WebP/JPEG) to enforce 10 MiB / 20 MP caps server-side; the multipart envelope cap is 11 MiB.
3. `lib/colab-job-runner.ts` — the core. `ColabJobRunner` holds an in-process FIFO promise queue (`IMAGEWORK_MAX_QUEUE_DEPTH` cap → 429) and drives the full Colab session lifecycle: create session → upload input/config/worker/lockfiles → prepare → upload HF token (local copy deleted immediately after) → run → download zip → cleanup.
4. `lib/zip-contract.ts` — strict result validation: exact expected members per mode, PNG signature and pixel caps, SVG restricted to a static element/attribute whitelist.
5. `lib/output-format.ts` — maps the chosen format to filename/content type; SVG is only valid for logo/icon.
6. `app/api/process/route.ts` — wires it together and maps every error class from `lib/colab-errors.ts` to a fixed Korean message with a specific status (400 input, 429 queue, 499 cancelled, 502 bad result, 503 not configured/CLI failure, 504 timeout).

## Cancellation

The client can POST `/api/process/cancel` with `{jobId, processingCode}`. `lib/process-job-registry.ts` maps jobId → AbortController; a cancel arriving **before** the job registers is stored as a TTL'd pre-aborted entry so the race resolves correctly. The process route combines that signal with `request.signal` (`AbortSignal.any`), so the client closing the connection also cancels the Colab job.

## Invariants to preserve

- **Per-job isolation:** every job gets its own tmp dir and a fabricated `HOME`/`XDG_*` environment (see `isolatedEnvironment`), so the `colab` CLI never reads or writes real user state. Directories are `0o700`, files `0o600`.
- **Cleanup always runs:** the `finally` block in `runOne` removes local state and stops the remote session. If remote cleanup cannot be confirmed, a recovery marker under `IMAGEWORK_RECOVERY_ROOT` remains, and the next job sweeps stale sessions before starting (`recoverStaleJobs`).
- **Nothing sensitive reaches the browser:** error messages are intentionally generic Korean strings; never add CLI output, paths, session names, or env details to a response.
- **Processing code is a server secret** compared with `timingSafeEqual` — never place it in `NEXT_PUBLIC_*`, source, URLs, or logs.
- **Never commit** `.env`, credentials, tokens, or generated results — `check:public-artifacts` gates this in CI-style checks; `colab/imagework.ipynb` is an archived, intentionally non-executable notebook gated by `check:colab-notebook`.

## Testing pattern

Route handlers are exported factories (`createProcessHandler(runnerProvider, registry, configProvider)`, `createCancelHandler(...)`), and `ColabJobRunner` accepts a `CommandRunner` interface — tests inject fake CLI runners and fake registries instead of touching the real `colab` binary. Follow this DI pattern when extending server code. Tests run under vitest with jsdom (`vitest.config.mts`); the `@/` alias maps to the repo root.

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
