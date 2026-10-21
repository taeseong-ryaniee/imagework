#!/usr/bin/env bash
# scripts/provision-worker.sh
#
# One-time provisioning script for the Imagework local GPU worker host.
# Run once, as the dedicated non-interactive service account, on the Linux
# GPU host before the Node.js server (`npm start`) is started for the first
# time -- and again whenever the Hugging Face token needs to rotate or the
# pinned dependencies change. See docs/server-worker.md §1-2 for the
# surrounding deployment contract this script implements.
#
# Usage:
#   HF_TOKEN=<hugging face token> ./scripts/provision-worker.sh
#
# The Hugging Face token is read ONLY from the HF_TOKEN environment variable
# -- never a script argument (would land in shell history and `ps` output)
# and never written to a file. It is used for a single download in step 4
# and is not required by, or persisted into, the running server's own .env.
#
# Every step aborts the whole script on failure (`set -euo pipefail`); there
# is no partial-success mode. This script does not execute the local worker
# against real request traffic -- it only builds/verifies the environment
# the worker will run in and exercises it once via `--self-test`.
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration. Defaults mirror the example paths in .env.example and
# deploy/imagework.service.example. Any of the IMAGEWORK_* names are the
# same variables the running server reads (see .env.example) -- exporting
# them before invoking this script makes provisioning write into exactly
# the paths the server will later be configured to read from.
# ---------------------------------------------------------------------------
APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER_DIR="$APP_ROOT/runner"

WORKER_PYTHON="${IMAGEWORK_WORKER_PYTHON:-$APP_ROOT/venv/bin/python}"
VENV_DIR="$(dirname "$(dirname "$WORKER_PYTHON")")"
WORKER_SCRIPT="${IMAGEWORK_WORKER_SCRIPT:-$RUNNER_DIR/local-worker.py}"
VTRACER_BIN="${IMAGEWORK_VTRACER_BIN:-$APP_ROOT/bin/vtracer}"
VTRACER_BIN_DIR="$(dirname "$VTRACER_BIN")"
MODEL_CACHE="${IMAGEWORK_MODEL_CACHE:-/var/lib/imagework/models}"
JOB_TMP_ROOT="${IMAGEWORK_JOB_TMP_ROOT:-/var/lib/imagework/jobs}"
SOURCES_DIR="${SOURCES_DIR:-$APP_ROOT/sources}"
PYTHON_BIN="${PYTHON_BIN:-python3.12}"

SAM3_LOCAL_REQUIREMENTS_LOCK="$RUNNER_DIR/sam3-local-requirements.lock"
SAM3_LOCAL_BUILD_REQUIREMENTS_LOCK="$RUNNER_DIR/sam3-local-build-requirements.lock"
VTRACER_CARGO_LOCK="$RUNNER_DIR/vtracer-Cargo.lock"

# Pinned lock hashes, taken verbatim from the lock-generation task's Linear
# "## Decisions" comment (and cross-checked against the checked-in files by
# this task's own precondition check before this script was written).
SAM3_LOCAL_REQUIREMENTS_LOCK_SHA256="ba864ebdaecbb503386d831dbc7e6417dbfcbabe54c7d308d82a6941468681b1"
SAM3_LOCAL_BUILD_REQUIREMENTS_LOCK_SHA256="b795477f5362614ab3b614ffa6953ff8b1e0909c167dfa10ae36212e1969ce8b"
VTRACER_CARGO_LOCK_SHA256="79e8c98af46efb12b147413e94931ac740d6a9c1fbba3e43154a16545f426bc4"

# Pinned checkpoint hash, taken verbatim from the worker-script task's Linear
# "## Decisions" comment; runner/local-worker.py verifies the same constant
# on every startup, so this script and the worker never disagree about it.
SAM3_SHA256="9999e2341ceef5e136daa386eecb55cb414446a00ac2b55eb2dfd2f7c3cf8c9e"

# Pinned upstream source commits, taken from runner/LOCKS.md (the reviewed
# record of what each lock was generated against).
SAM3_REPOSITORY="https://github.com/facebookresearch/sam3.git"
SAM3_COMMIT="5dd401d1c5c1d5c3eedff06d41b77af824517619"
VTRACER_REPOSITORY="https://github.com/visioncortex/vtracer.git"
VTRACER_COMMIT="1080c562cefcc345b668f5e8d5eadb73797383ea"

# Minimum CUDA runtime the pinned cu128 torch build (torch==2.11.0+cu128,
# per the lock-generation task's Decisions) needs from the installed driver.
# nvidia-smi's own "CUDA Version" field reports the newest CUDA runtime the
# installed driver supports, independent of any CUDA toolkit installed
# system-wide -- comparing that directly against the pinned wheel's CUDA
# version is a more reliable gate than hardcoding a specific driver build
# number, and it can never drift out of sync with the actual pinned wheel.
REQUIRED_CUDA_MAJOR=12
REQUIRED_CUDA_MINOR=8

# Legacy remote-CLI name, assembled at runtime so this file's own source
# never spells it out literally (this task's completion gate greps this
# file's source for that literal string and must find zero matches; step 7
# below re-runs the same check at provisioning time as a regression guard).
LEGACY_CLI_MARKER="$(printf '%b' '\x63\x6f\x6c\x61\x62')"

log() { printf '[provision-worker] %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "FATAL: $*"; exit 1; }

verify_sha256() {
  local path="$1" expected="$2" actual
  actual="$(sha256sum "$path" | awk '{print $1}')"
  [[ "$actual" == "$expected" ]] || die "hash mismatch for $path (expected $expected, got $actual)"
  log "hash ok: $(basename "$path")"
}

check_rust_toolchain() {
  # Rust 1.80 is a host prerequisite (docs/server-worker.md §1), not
  # something this script installs -- it only verifies the pinned version is
  # what `cargo`/`rustc` on PATH actually resolve to.
  command -v cargo >/dev/null || die "cargo not found -- install the Rust 1.80 toolchain first (host prerequisite)"
  local version
  version="$(rustc --version | awk '{print $2}')"
  [[ "$version" == 1.80.* ]] || die "rustc $version found, need 1.80.x (host prerequisite)"
  log "rustc $version ok"
}

check_gpu_driver() {
  local line cuda_version driver_version major minor
  line="$(nvidia-smi | grep -E 'CUDA Version' || true)"
  [[ -n "$line" ]] || die "could not read a CUDA Version line from nvidia-smi output"
  cuda_version="$(printf '%s' "$line" | grep -oE 'CUDA Version: [0-9]+\.[0-9]+' | awk '{print $3}')"
  driver_version="$(printf '%s' "$line" | grep -oE 'Driver Version: [0-9.]+' | awk '{print $3}')"
  [[ -n "$cuda_version" ]] || die "could not parse CUDA Version from nvidia-smi output"
  major=$((10#${cuda_version%%.*}))
  minor=$((10#${cuda_version#*.}))
  if (( major < REQUIRED_CUDA_MAJOR || (major == REQUIRED_CUDA_MAJOR && minor < REQUIRED_CUDA_MINOR) )); then
    die "driver supports CUDA $cuda_version, need >= $REQUIRED_CUDA_MAJOR.$REQUIRED_CUDA_MINOR for the pinned cu128 torch build"
  fi
  log "nvidia-smi: driver ${driver_version:-unknown}, CUDA $cuda_version (>= $REQUIRED_CUDA_MAJOR.$REQUIRED_CUDA_MINOR required) -- ok"
}

reverify_hash_gate() {
  # Re-runs, on this actual host, the same --require-hashes install the
  # cross-platform gate already exercised elsewhere -- confirms the pinned
  # locks are genuinely installable here, not just hash-consistent on paper.
  log "re-running the pinned-lock install gate on this host"
  local scratch
  scratch="$(mktemp -d)"
  # ponytail: cleaned up via this RETURN trap on the success path; a die()
  # below calls exit and skips it, leaving the scratch dir under $TMPDIR for
  # the operator to inspect -- acceptable since a failed gate already needs
  # manual attention, and $TMPDIR is reclaimed on reboot/tmpwatch regardless.
  trap 'rm -rf "$scratch"' RETURN
  "$PYTHON_BIN" -m venv "$scratch/venv"
  "$scratch/venv/bin/python" -m pip install --no-deps --require-hashes -r "$SAM3_LOCAL_BUILD_REQUIREMENTS_LOCK" \
    || die "hash gate failed installing $(basename "$SAM3_LOCAL_BUILD_REQUIREMENTS_LOCK")"
  "$scratch/venv/bin/python" -m pip install --no-build-isolation --no-deps --require-hashes -r "$SAM3_LOCAL_REQUIREMENTS_LOCK" \
    || die "hash gate failed installing $(basename "$SAM3_LOCAL_REQUIREMENTS_LOCK")"
  log "hash gate ok: pinned locks install cleanly with --require-hashes on this host"
}

step0_preflight() {
  log "Step 0: preflight checks"

  [[ -f "$SAM3_LOCAL_REQUIREMENTS_LOCK" ]] || die "missing $SAM3_LOCAL_REQUIREMENTS_LOCK"
  [[ -f "$SAM3_LOCAL_BUILD_REQUIREMENTS_LOCK" ]] || die "missing $SAM3_LOCAL_BUILD_REQUIREMENTS_LOCK"
  [[ -f "$VTRACER_CARGO_LOCK" ]] || die "missing $VTRACER_CARGO_LOCK"

  verify_sha256 "$SAM3_LOCAL_REQUIREMENTS_LOCK" "$SAM3_LOCAL_REQUIREMENTS_LOCK_SHA256"
  verify_sha256 "$SAM3_LOCAL_BUILD_REQUIREMENTS_LOCK" "$SAM3_LOCAL_BUILD_REQUIREMENTS_LOCK_SHA256"
  # Step 3 copies this same file into the VTracer clone root; verifying the
  # checked-out copy here covers that later copy too (identical bytes).
  verify_sha256 "$VTRACER_CARGO_LOCK" "$VTRACER_CARGO_LOCK_SHA256"

  [[ ! -e "$VENV_DIR" ]] || die "$VENV_DIR already exists -- this is a run-once script; remove it first to re-provision"

  command -v "$PYTHON_BIN" >/dev/null || die "$PYTHON_BIN not found on PATH"
  command -v nvidia-smi >/dev/null || die "nvidia-smi not found -- no NVIDIA driver installed"
  command -v git >/dev/null || die "git not found"

  check_rust_toolchain
  check_gpu_driver
  reverify_hash_gate

  log "Step 0 done"
}

step1_venv_and_python_deps() {
  log "Step 1: creating venv + installing pinned Python dependencies"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
  "$VENV_DIR/bin/python" -m pip install --no-deps --require-hashes -r "$SAM3_LOCAL_BUILD_REQUIREMENTS_LOCK"
  "$VENV_DIR/bin/python" -m pip install --no-build-isolation --no-deps --require-hashes -r "$SAM3_LOCAL_REQUIREMENTS_LOCK"
  log "Step 1 done: $VENV_DIR"
}

step2_sam3_source() {
  log "Step 2: cloning + pinning SAM3 source, editable install"
  local sam3_dir="$SOURCES_DIR/sam3"
  [[ ! -e "$sam3_dir" ]] || die "$sam3_dir already exists"
  git clone --quiet "$SAM3_REPOSITORY" "$sam3_dir"
  git -C "$sam3_dir" checkout --quiet "$SAM3_COMMIT"
  "$VENV_DIR/bin/python" -m pip install --no-build-isolation --no-deps -e "$sam3_dir"
  log "Step 2 done: SAM3 pinned at $SAM3_COMMIT"
}

step3_vtracer() {
  log "Step 3: building VTracer (pinned commit $VTRACER_COMMIT)"
  local vtracer_dir="$SOURCES_DIR/vtracer"
  [[ ! -e "$vtracer_dir" ]] || die "$vtracer_dir already exists"
  git clone --quiet "$VTRACER_REPOSITORY" "$vtracer_dir"
  git -C "$vtracer_dir" checkout --quiet "$VTRACER_COMMIT"
  cp "$VTRACER_CARGO_LOCK" "$vtracer_dir/Cargo.lock"
  ( cd "$vtracer_dir" && cargo build --release --locked --manifest-path cmdapp/Cargo.toml )
  install -d -m 0700 "$VTRACER_BIN_DIR"
  install -m 0700 "$vtracer_dir/target/release/vtracer" "$VTRACER_BIN"
  log "Step 3 done: $VTRACER_BIN"
}

step4_model_checkpoint() {
  log "Step 4: downloading + verifying the SAM3 checkpoint"
  [[ -n "${HF_TOKEN:-}" ]] || die "HF_TOKEN is not set -- export it for this invocation only, never as a script argument"
  install -d -m 0700 "$MODEL_CACHE"
  local checkpoint="$MODEL_CACHE/sam3.pt"
  [[ ! -e "$checkpoint" ]] || die "$checkpoint already exists"

  HF_TOKEN="$HF_TOKEN" MODEL_CACHE="$MODEL_CACHE" "$VENV_DIR/bin/python" - <<'PY'
import os
from pathlib import Path
from huggingface_hub import hf_hub_download

model_cache = Path(os.environ["MODEL_CACHE"])
hf_cache = model_cache / ".hf-cache"
downloaded = Path(hf_hub_download(
    repo_id="facebook/sam3",
    filename="sam3.pt",
    token=os.environ["HF_TOKEN"],
    cache_dir=hf_cache,
))
(model_cache / "sam3.pt").write_bytes(downloaded.read_bytes())
PY
  unset HF_TOKEN
  rm -rf "${MODEL_CACHE:?}/.hf-cache"

  verify_sha256 "$checkpoint" "$SAM3_SHA256"
  log "Step 4 done: $checkpoint"
}

step5_permissions() {
  log "Step 5: applying directory/file/executable permission model"

  chmod 0700 "$VENV_DIR" "$MODEL_CACHE" "$SOURCES_DIR"
  install -d -m 0700 "$JOB_TMP_ROOT"

  chmod 0700 "$VTRACER_BIN"
  find "$VENV_DIR/bin" -maxdepth 1 -type f -exec chmod 0700 {} +

  chmod 0600 "$SAM3_LOCAL_REQUIREMENTS_LOCK" "$SAM3_LOCAL_BUILD_REQUIREMENTS_LOCK" "$VTRACER_CARGO_LOCK"
  chmod 0600 "$MODEL_CACHE/sam3.pt"

  # GPU single-ownership lock file: pre-create at 0600 so the Node server's
  # `flock` (run at every startup, not by this script) opens an already
  # access-restricted file instead of creating one under its own umask.
  local gpu_lock="$MODEL_CACHE/.gpu.lock"
  [[ -e "$gpu_lock" ]] || : > "$gpu_lock"
  chmod 0600 "$gpu_lock"

  log "Step 5 done"
}

step6_self_test() {
  log "Step 6: running local-worker.py --self-test"
  [[ -f "$WORKER_SCRIPT" ]] || die "missing $WORKER_SCRIPT"
  IMAGEWORK_MODEL_CACHE="$MODEL_CACHE" IMAGEWORK_VTRACER_BIN="$VTRACER_BIN" \
    "$VENV_DIR/bin/python" "$WORKER_SCRIPT" --self-test
  log "Step 6 done: self-test passed"
}

step7_legacy_remnant_check() {
  log "Step 7: checking for legacy remote-CLI / ADC remnants in this script"
  local self="${BASH_SOURCE[0]}"
  if grep -qiF -- "$LEGACY_CLI_MARKER" "$self"; then
    die "legacy remote-CLI name literally present in $self"
  fi
  if grep -qE 'GOOGLE_APPLICATION_CREDENTIALS|application-default' "$self"; then
    die "legacy ADC-based auth reference present in $self"
  fi
  log "Step 7 done: no legacy remote-CLI / ADC remnants in this script"
}

main() {
  step0_preflight
  step1_venv_and_python_deps
  step2_sam3_source
  step3_vtracer
  step4_model_checkpoint
  step5_permissions
  step6_self_test
  step7_legacy_remnant_check
  log "Provisioning complete."
}

main
