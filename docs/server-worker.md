# Imagework server-worker deployment

Imagework is a server-side worker service. Its browser form posts an image,
asset mode, requested output format, normalized box, a browser-generated UUID,
and deployment-shared processing code to the same-origin `/api/process` route.
The server serializes jobs, runs the official Google Colab CLI in an isolated
temporary context, validates the returned ZIP, extracts only the requested PNG
or SVG when selected (or returns the ZIP), then deletes local and remote job
state.

This guide deliberately has no authentication values. Configure and run the
official CLI only on the worker host; do not automate an interactive browser
tab and do not commit credentials or CLI configuration files.

## 1. Prepare the worker host

Use a Linux or macOS host with:

- Node.js and this application built for production;
- Python 3.12 or newer for the official CLI package;
- the official [`google-colab-cli`](https://github.com/googlecolab/google-colab-cli)
  `0.6.0` executable on the operating-system service account's `PATH`;
- a dedicated, non-interactive operating-system service account;
- a private writable filesystem for per-job temporary data and CLI state; and
- a secret manager capable of injecting files and environment variables only
  into that operating-system service account.

The Next.js deployment must run as a Node.js server (`npm start`). A static
host cannot execute the request-dependent route or launch the worker CLI.
Keep the application single-instance unless the serialized queue is moved to a
shared, authenticated queue with equivalent isolation guarantees.

## 2. Configure Google Colab CLI authentication

Install the tested release with `python -m pip install google-colab-cli==0.6.0`
and confirm `colab version` reports `Version: 0.6.0` before deployment. Configure it
according to its official documentation.
Set `IMAGEWORK_COLAB_AUTH_MODE` to `adc` only. Configure a server-only
Application Default Credentials JSON file for an authorized-user identity that
is entitled to allocate a Colab GPU, and set its absolute path in
`IMAGEWORK_GOOGLE_APPLICATION_CREDENTIALS`; the runner copies it at `0600` into
each isolated job context. OAuth2 is deliberately rejected because this worker
must remain noninteractive. Do not commit ADC material, browser cookies, CLI
session files, or a personal user home directory. The runner creates a new
`--config` file and HOME/XDG tree for each job, so long-lived CLI state never
crosses jobs. Provision that authorized-user ADC identity with `openid`,
`cloud-platform`, `userinfo.email`, `userinfo.profile`, `drive.file`, and
`colaboratory` scopes; missing any of these scopes prevents
the official CLI from allocating and maintaining the Colab session.

## 3. Inject server-only values

Create the values below in the secret manager and inject them into the running
server; [`.env.example`](../.env.example) lists every required variable without
values.

| Variable | Required deployment value |
| --- | --- |
| `IMAGEWORK_HF_TOKEN` | A server-only Hugging Face token from an account approved for `facebook/sam3`. |
| `IMAGEWORK_PROCESSING_CODE` | A random, deployment-shared request gate (32–512 characters). It is **not** a Google or Hugging Face credential, but is still secret. |
| `IMAGEWORK_COLAB_AUTH_MODE` | `adc` only. The runner requires `colab version` to return exactly `Version: 0.6.0` before a session is created. |
| `IMAGEWORK_GOOGLE_APPLICATION_CREDENTIALS` | Absolute server-only ADC credential JSON file. |
| `IMAGEWORK_COLAB_CONFIG` | Absolute private parent directory for per-job CLI config/state. |
| `IMAGEWORK_COLAB_ACCELERATOR` | `T4`. |
| `IMAGEWORK_JOB_TIMEOUT_SECONDS` | Whole-job deadline, from 30 to 7200 seconds. |
| `IMAGEWORK_JOB_SCRIPT` | Absolute path to the reviewed deployed `runner/remote-worker.py`. |
| `IMAGEWORK_JOB_TMP_ROOT` | Absolute private parent directory for temporary job files. |
| `IMAGEWORK_RECOVERY_ROOT` | Absolute private root for no-payload crash-recovery markers. |
| `IMAGEWORK_MAX_QUEUE_DEPTH` | Admission cap for active and queued jobs, from 1 to 100. |

Never place any of these in `NEXT_PUBLIC_*`, client JavaScript, HTML, request
URLs, source control, response bodies, logs, or downloadable archives. The
processing code is entered by a trusted user in the form, but the
server compares it in constant time and never echoes it.

Set ownership to the dedicated Imagework operating-system service account that runs the Node
server and worker. The configured parent directories must be accessible only to
that operating-system service account, never to other local accounts or a shared developer
profile. Arrange an external rotation procedure for both the Hugging Face token
and processing code.

## 4. Job lifecycle and cleanup

For each request the service:

1. validates the actual input bytes, extension, dimensions, mode, selected
   output format, and box geometry before queuing; the browser may set the box
   by dragging in its local proportional preview or by entering normalized
   numeric values, but the server remains the authority;
2. explicitly sets fresh local and CLI-state directories to `0700` and staged
   files to `0600`;
3. creates one fresh T4 session via `colab new`, uploads only the input,
   non-secret configuration, reviewed worker script, and reviewed SAM3
   build/runtime Python and VTracer/Cargo lock files;
4. executes the worker's preparation stage, which validates the base runtime
   and installs/verifies the pinned sources before the token exists remotely;
5. uploads the token file only after preparation succeeds, executes inference,
   downloads only `imagework-results.zip`, checks its exact expected members
   and size limits, then returns only the browser-selected PNG, SVG, or ZIP;
6. deletes the local token file, removes the remote job directory, stops the
   session, and deletes every local job/config/cache/state directory in a
   `finally` path.

After an unexpected server crash, recovery queries the reviewed `colab sessions`
output before deleting a marker. It removes state only when the CLI positively
confirms absence; otherwise it best-effort stops the named session and confirms
absence again. Network failures or unrecognized output retain the marker for a
later retry.

Keep the proxy read timeout above the 7200-second job limit plus the two
sequential 30-second remote cleanup calls; the supplied Nginx configuration
uses 7350 seconds.

The remote script reads the token file once and removes it before inference.
It never prints, serializes, returns, or archives the token. Do not modify that
contract by passing credentials as command-line arguments or writing them into
generated code.
It also validates and decodes the uploaded image immediately after validating
the non-secret job configuration, before checking the GPU runtime, installing
dependencies, reading the token, or downloading the model checkpoint.

The remote worker verifies the SHA-256 of the uploaded
[`sam3-build-requirements.lock`](../runner/sam3-build-requirements.lock),
[`sam3-requirements.lock`](../runner/sam3-requirements.lock) and
[`vtracer-Cargo.lock`](../runner/vtracer-Cargo.lock) before use. It installs
the pinned build closure, then the runtime closure with
`pip --no-deps --require-hashes` and disabled build isolation, copies the
VTracer lock into the pinned source checkout, and builds with `cargo --locked`.
The runtime lock contains the source-only `iopath` package, so do not add
`--only-binary=:all:`: it would make the reviewed closure uninstallable. The
remote worker also verifies the SHA-256 of the official Rust 1.80.0 archive
before extracting it. Before and after dependency installation, it verifies
that the Colab-provided CUDA stack has a supported PyTorch version, importable
torchvision, NumPy `>=1.26,<2`, and Pillow `>=10`; these GPU-coupled packages
are intentionally not installed from the lock.

## 5. Browser contract and failures

The browser receives only its selected attachment on success: a transparent
`result.png`, a logo/icon-only `result.svg`, or `imagework-results.zip`.
The server rejects an SVG-only request for photo mode. The browser never
receives raw CLI output, command lines, stack traces, token values, OAuth paths,
remote paths, session identifiers, or provider diagnostics. The UI maps failures
to safe Korean recovery messages for invalid input, invalid processing code,
queue/job cancellation, timeout, unavailable accelerator/model access,
processing failure, and invalid result archive.

Before streaming multipart data, `/api/process` requires the processing code in
the `X-Imagework-Processing-Code` header and rejects an invalid or oversized
declared `Content-Length`; the multipart field is checked again at the request
boundary. Keep the browser-generated UUID in the multipart body and use the
same code in the cancellation JSON body.

For explicit cancellation, the browser sends the same UUID and processing code
to `POST /api/process/cancel`. The server keeps that UUID only in its in-memory
single-instance job registry: a cancellation received before registration is
remembered until the matching request reaches the queue; a queued cancellation
does not allocate a Colab session; an active cancellation terminates the local
CLI command and follows the normal remote cleanup and `stop` lifecycle. The
registry entry is deleted when the request completes. Unknown-UUID cancellation
markers are retained only for a short bounded TTL and an upper capacity limit,
then evicted; this bounds in-memory state while preserving normal request/cancel
races. The cancellation response does not reveal whether a UUID was active,
unknown, or already finished.

Deploy the [Nginx admission boundary](reverse-proxy.md), or an equivalent
trusted edge configuration, so the proxy allows the 11 MiB multipart envelope
while it enforces the per-IP rate limit. The application independently enforces
the 10 MiB file cap and performs only early header, declared-content-length,
and request-envelope checks before multipart parsing; file validation and queue
admission happen afterward. Use HTTPS, preserve request abort signals to the Node
process as a supplemental signal, and redact tokens, processing codes, uploaded
filenames, UUIDs, and remote paths from operational logs.

## 6. Release verification

Before accepting traffic:

1. Run the automated checks listed in the README.
2. Use a disposable image and a non-production processing code to confirm a
   valid multipart request yields each selectable attachment: transparent PNG,
   logo/icon SVG, and ZIP with exactly the expected members. Confirm photo mode
   cannot request SVG.
3. Independently verify bad code, invalid image bytes, CLI failure, and client
   cancellation all return only safe messages/statuses and leave no job files
   or per-job CLI state behind.
4. Confirm the remote session is removed after both a successful and failed
   job, then revoke any test credentials used for the exercise.

Do not store input images, result archives, raw CLI transcripts, secret values,
or user request payloads in repository evidence.
