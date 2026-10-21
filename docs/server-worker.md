# Imagework server-worker deployment

Imagework is a server-side worker service running entirely on the deployment
host's own GPU. Its browser form posts an image, asset mode, requested output
format, normalized box, a browser-generated UUID, and deployment-shared
processing code to `/api/process`, which validates the request and responds
`202 {jobId}` immediately instead of waiting for GPU work to finish. The
browser then polls `GET /api/process/status` and, once the job reaches
`done`, downloads the result from `GET /api/process/result`. A single
long-lived local worker process (SAM3 segmentation + VTracer) processes jobs
one at a time and validates its own output before it is served.

This guide deliberately has no authentication values. Provision and run the
local worker only on the worker host; do not commit credentials, model
checkpoints, or provisioning secrets.

## 1. Prepare the worker host

Use a Linux host with:

- Node.js and this application built for production;
- Python 3.12 or newer for the local worker's virtual environment;
- an NVIDIA GPU with a driver/CUDA stack meeting the SAM3 runtime's
  requirement (PyTorch ≥ 2.7 and a compatible CUDA version);
- the Rust 1.80 toolchain, needed once during provisioning to build the
  pinned VTracer binary;
- a dedicated, non-interactive operating-system service account;
- a private writable filesystem for the venv, the shared model cache, and
  per-job temporary data; and
- a secret manager capable of injecting files and environment variables only
  into that operating-system service account.

The Next.js deployment must run as a Node.js server (`npm start`). A static
host cannot execute the request-dependent route or run the local worker
process. Keep the application single-instance: the local worker takes an
exclusive GPU `flock` when it starts (§4) and cannot be horizontally scaled
without a second GPU and a second worker instance.

## 2. Provision the local worker

Run [`scripts/provision-worker.sh`](../scripts/provision-worker.sh) once on
the worker host as the dedicated service account. It verifies the pinned lock
files' SHA-256 hashes, builds the Python 3.12 venv and the VTracer binary,
downloads and verifies the `facebook/sam3` checkpoint into the shared model
cache, applies `0700`/`0600` permissions throughout, and finishes with a GPU
self-test (`local-worker.py --self-test`); a non-zero exit means provisioning
failed and must be fixed before continuing. Provide the Hugging Face token
only as an environment variable for that single invocation — never as a
script argument and never left behind in a runtime `.env` file.

Once provisioning succeeds, install
[`deploy/imagework.service.example`](../deploy/imagework.service.example) as a
systemd unit to supervise `npm start`; the Node.js process spawns the local
worker as its own child (in its own process group), so a single unit covers both. `Restart=on-failure`
respawns the Node process (and with it, the worker) after a crash, and the
unit starts automatically on boot.

## 3. Inject server-only values

Create the values below in the secret manager and inject them into the running
server; [`.env.example`](../.env.example) lists every required variable without
values.

| Variable | Required deployment value |
| --- | --- |
| `IMAGEWORK_PROCESSING_CODE` | A random, deployment-shared request gate (32–512 characters). It is **not** a Hugging Face credential, but is still secret. |
| `IMAGEWORK_WORKER_PYTHON` | Absolute path to the provisioned venv's Python interpreter. |
| `IMAGEWORK_WORKER_SCRIPT` | Absolute path to the reviewed deployed `runner/local-worker.py`. |
| `IMAGEWORK_MODEL_CACHE` | Absolute private parent directory for the shared SAM3 model cache and the GPU single-ownership lock file. |
| `IMAGEWORK_VTRACER_BIN` | Absolute path to the VTracer binary built during provisioning. |
| `IMAGEWORK_JOB_TIMEOUT_SECONDS` | Whole-job deadline, from 30 to 600 seconds. |
| `IMAGEWORK_JOB_TMP_ROOT` | Absolute private parent directory for temporary job files. |
| `IMAGEWORK_RESULT_TTL_SECONDS` | Seconds a finished job's result is retained for its single download before it is deleted. The status endpoint reports the resulting deadline (`expiresAt`) to the browser. |
| `IMAGEWORK_MAX_QUEUE_DEPTH` | Admission cap for active and queued jobs, from 1 to 100. |

Never place any of these in `NEXT_PUBLIC_*`, client JavaScript, HTML, request
URLs, source control, response bodies, logs, or downloadable archives. The
processing code is entered by a trusted user in the form, but the
server compares it in constant time and never echoes it.

Set ownership to the dedicated Imagework operating-system service account that runs the Node
server and worker. The configured parent directories must be accessible only to
that operating-system service account, never to other local accounts or a shared developer
profile. Arrange an external rotation procedure for the processing code, and
re-run provisioning with a fresh Hugging Face token whenever it needs to
rotate.

## 4. Job lifecycle and cleanup

The job runner starts lazily, on the first submission. It takes an exclusive
`flock` on a lock file inside `IMAGEWORK_MODEL_CACHE` (startup fails if another
instance already holds it), sweeps `IMAGEWORK_JOB_TMP_ROOT` for orphaned
per-job directories left behind by an unclean shutdown, and only then spawns
the long-lived local worker process in its own process group. Jobs submitted
while the worker is starting or being replaced are queued and run once it
reports ready. If startup fails (for example the lock is held), every queued
job fails and later submissions are refused with `503`.

For each submitted job:

1. `POST /api/process` validates the actual input bytes, extension,
   dimensions, mode, selected output format, and box geometry, then admits the
   job to the in-process FIFO queue and responds `202 {jobId}` immediately.
   When the runner refuses the job at admission it answers instead: `503`
   (startup failed or circuit open), `429` with `Retry-After: 60` (queue
   full) or `499` (cancelled before submission), and the job is not left
   `queued`;
   the browser may set the box by dragging in its local proportional preview
   or by entering normalized numeric values, but the server remains the
   authority;
2. creates a unique temporary directory for the admitted job (`0700`) and
   stages its files there as `0600`;
3. the worker processes jobs one at a time in queue order, running SAM3
   segmentation and VTracer vectorization directly on the host GPU;
4. `GET /api/process/status?jobId=` reports `queued` (with a 1-based
   `queuePosition`), `processing`, `done` (with the server's `expiresAt`
   deadline), `failed`, or `cancelled`;
5. once `done`, `GET /api/process/result?jobId=` serves back only the
   browser-selected PNG, SVG, or ZIP, checked against its exact expected
   members and size limits before it is served. The result is served once:
   the first request claims it, and a repeated or concurrent request gets
   `400`;
6. the server deletes the job's temporary directory as soon as the claimed
   result is buffered, or deletes an undownloaded result after
   `IMAGEWORK_RESULT_TTL_SECONDS` elapses, whichever happens first. A failed
   or cancelled job's directory is deleted once nothing can still write to it
   (see below).

The worker runs in its own process group, because VTracer is a child of the
Python worker and can outlive it. If the worker process crashes mid-job, or a
job is stopped by the timeout or the cancellation grace period, the Node server
kills the whole process group and waits until the worker has exited **and** no
member of the group remains, and until pending Node file writes for that job
have settled. Only then does it delete the job's directory and spawn a
replacement worker; the queue resumes once the replacement reports ready. A
worker that answers with a failure (`ok: false`) needs no group kill. If the
group cannot be confirmed stopped, the directory and the GPU lock are kept, the
runner stops admitting work and fails the queue with a safe error. The
synchronous process `exit` callback cannot await a stop or observe reaping, so
it uses a narrower rule: any unconfirmed stop keeps the GPU lock; a live worker
(starting, ready or processing) gets one synchronous `SIGKILL` to its whole
process group, and the lock is released only when that signal was sent or the
group was already gone (`ESRCH`) — any other error, such as `EPERM`, keeps it;
with no worker and no unconfirmed stop the lock is released. This relies on
`SIGKILL` delivery, not on observed reaping; systemd's control-group kill stays
the production guarantee when the service stops. A respawn
circuit breaker also stops retrying after more than three crashes within ten
minutes and fails every queued job instead of looping.

The local worker reads the token file once, only during provisioning, and
never at request time; no per-request token file exists to remove, print,
serialize, return, or archive. It validates and decodes the uploaded image
immediately after validating the non-secret job configuration, before
checking the GPU runtime or reading the model checkpoint from the shared
cache.

The local worker verifies the SHA-256 of the uploaded
[`sam3-local-build-requirements.lock`](../runner/sam3-local-build-requirements.lock),
[`sam3-local-requirements.lock`](../runner/sam3-local-requirements.lock) and
[`vtracer-Cargo.lock`](../runner/vtracer-Cargo.lock) before use. It installs
the pinned build closure, then the runtime closure with
`pip --no-deps --require-hashes` and disabled build isolation, copies the
VTracer lock into the pinned source checkout, and builds with `cargo --locked`.
The runtime lock contains the source-only `iopath` package, so do not add
`--only-binary=:all:`: it would make the reviewed closure uninstallable. The
local worker also verifies the SHA-256 of the official Rust 1.80.0 archive
before extracting it. Before and after dependency installation, it verifies
that the worker host's CUDA stack has a supported PyTorch version, importable
torchvision, NumPy `>=1.26,<2`, and Pillow `>=10`; these GPU-coupled packages
are intentionally not installed from the lock.

## 5. Browser contract and failures

The browser receives only its selected attachment on success: a transparent
`result.png`, a logo/icon-only `result.svg`, or `imagework-results.zip`.
The server rejects an SVG-only request for photo mode. The browser never
receives raw worker output, command lines, stack traces, token values, or
local file paths. The UI maps failures to safe Korean recovery messages for
invalid input, invalid processing code, queue/job cancellation, timeout,
unavailable GPU/model access, processing failure, and invalid result archive.

Before streaming multipart data, `/api/process` requires the processing code in
the `X-Imagework-Processing-Code` header and rejects an invalid or oversized
declared `Content-Length`; the multipart field is checked again at the request
boundary. Keep the browser-generated UUID (`jobId`) in the multipart body and
use the same `jobId` and processing code for status polling, result download,
and cancellation.

For explicit cancellation, the browser sends the same `jobId` and processing
code to `POST /api/process/cancel`. The server keeps that `jobId` only in its
in-memory single-instance job registry: a cancellation received before
registration is remembered until the matching request reaches the queue; a
queued cancellation removes the job from the queue without touching the
worker process; an active cancellation (the job currently running on the
worker) sends `SIGUSR1` to the worker process only and waits up to a
30-second grace period. If the worker acknowledges with its own terminal
message, the same worker keeps running and the job directory is deleted once
pending file writes have settled. Otherwise, after the grace period, the server
sends `SIGKILL` to the worker's whole process group, and the job directory is
deleted and the worker respawned only once the group has stopped and pending
file writes have settled; if the group cannot be confirmed stopped, the
directory and the GPU lock are kept and no replacement starts. A cancellation
applies to that one request, even if the same `jobId` is registered again
later. The cancelled state is visible at once.
Registry entries expire after `IMAGEWORK_RESULT_TTL_SECONDS`. Unknown-`jobId` cancellation markers are
retained only for a short bounded TTL and an upper capacity limit, then
evicted; this bounds in-memory state while preserving normal request/cancel
races. The cancellation response does not reveal whether a `jobId` was
active, unknown, or already finished.

Deploy the [Nginx admission boundary](reverse-proxy.md), or an equivalent
trusted edge configuration, so the proxy allows the 11 MiB multipart envelope
on the submission endpoint while it enforces the per-IP rate limit. The
application independently enforces the 10 MiB file cap and performs only
early header, declared-content-length, and request-envelope checks before
multipart parsing; file validation and queue admission happen afterward. Use
HTTPS, preserve request abort signals to the Node process as a supplemental
signal, and redact tokens, processing codes, uploaded filenames, and job IDs
from operational logs.

## 6. Release verification

Before accepting traffic:

1. Run the automated checks listed in the README.
2. Use a disposable image and a non-production processing code to confirm a
   valid submission returns `202 {jobId}`, `GET /api/process/status` reports
   `queued` → `processing` → `done`, and `GET /api/process/result` yields
   each selectable attachment: transparent PNG, logo/icon SVG, and ZIP with
   exactly the expected members. Confirm photo mode cannot request SVG.
3. Independently verify bad code, invalid image bytes, worker failure, and
   client cancellation all return only safe messages/statuses and leave no
   job files behind once their writers have stopped (failed and cancelled
   jobs) or their retention window passes (unclaimed results).
4. Confirm the worker's self-test (`local-worker.py --self-test`, run during
   provisioning) and any GPU-dependent benchmark are executed manually on the
   worker host — they need the real GPU and do not run in CI — then revoke
   any test credentials used for the exercise.

Do not store input images, result archives, raw worker transcripts, secret
values, or user request payloads in repository evidence.
