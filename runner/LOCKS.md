# Local dependency locks

The local worker consumes these files from the per-job directory. They are
reviewed, hand-curated inputs, not machine-generated at job time.

| File | SHA-256 | Purpose |
| --- | --- | --- |
| `sam3-local-build-requirements.lock` | `b795477f5362614ab3b614ffa6953ff8b1e0909c167dfa10ae36212e1969ce8b` | Exact build tools for the source-only `iopath` release. |
| `sam3-local-requirements.lock` | `ba864ebdaecbb503386d831dbc7e6417dbfcbabe54c7d308d82a6941468681b1` | Python 3.12, Linux x86_64 SAM3 image-inference dependency closure, including local CUDA 12.8 GPU packages. |
| `vtracer-Cargo.lock` | `79e8c98af46efb12b147413e94931ac740d6a9c1fbba3e43154a16545f426bc4` | Cargo resolution for VTracer commit `1080c562cefcc345b668f5e8d5eadb73797383ea`. |

## SAM3 requirements lock

The lock started from the direct image-inference closure of SAM3 commit
`5dd401d1c5c1d5c3eedff06d41b77af824517619` (originally generated with `uv
0.11.19`, targeting CPython 3.12 and `x86_64-manylinux_2_17`), then had
`torch`, `torchvision`, `numpy`, and `pillow` folded in by hand as CUDA 12.8
wheels from `https://download.pytorch.org/whl/cu128/` (an `--extra-index-url`
line at the top of the lock), since the local worker has no preflighted base
runtime that supplies those GPU-coupled packages the way the prior
execution environment did. `torch`'s own
unconditional runtime dependencies that were missing from the SAM3
closure — `jinja2`, `markupsafe`, `mpmath`, `networkx`, `setuptools`, and
`sympy` — are pinned alongside them so the hash gate resolves the full
closure. (`torch`'s `platform_system == "Linux"`-only extras — CUDA/NCCL/
triton packages — are intentionally not pinned here; the local worker's
system CUDA/driver stack is provisioned separately, and the lock installs
with `--no-deps` in production regardless.) All entries use exact versions
and SHA-256 hashes; no comparison operator other than `==` appears anywhere
in the file.

`einops` is included because the pinned SAM3 source imports it from
`sam3/sam/rope.py`, although that import is absent from the upstream project
metadata. `iopath 0.1.10` publishes only a source distribution; its exact
source-distribution hash is present in the lock. Do not add `--only-binary` to
the install command, because that would make the pinned source-only dependency
uninstallable. First install the separately pinned build tools, then disable
build isolation so pip cannot fetch an unpinned build backend:

```sh
python -m pip install --no-deps --require-hashes -r sam3-local-build-requirements.lock
python -m pip install --no-build-isolation --no-deps --require-hashes -r sam3-local-requirements.lock
```

Regenerate only after a reviewed dependency update. The SAM3-only portion
(21 packages) traces back to:

```sh
uv pip compile --no-deps --generate-hashes --no-annotate --no-header \
  --python-version 3.12 --python-platform x86_64-manylinux_2_17 \
  sam3-runtime-closure.in
```

(then re-apply the local CUDA wheel pins and transitive deps described above
before saving the result as `sam3-local-requirements.lock`). The
`torch`/`torchvision`/`numpy`/`pillow` block and their transitive deps
were added by hand against the `cu128` index and PyPI (see `## Hash gate`
below for how they were verified). Verify the resulting SHA-256 and a fresh
Python 3.12 install before changing the worker's matching expected hash.

## Hash gate

`GATE Q2 = (C)`: verify the lock resolves under `--require-hashes` before
trusting it. Run from this machine (macOS, not the Linux GPU host) with
`/Users/taeseongyi/.local/bin/python3.12` (pip 26.1.2):

```sh
LOCKGATE_DEST="$(mktemp -d)"
python3.12 -m pip download \
  --require-hashes --only-binary=:all: \
  --platform manylinux_2_28_x86_64 --python-version 3.12 \
  --dest "$LOCKGATE_DEST" \
  -r sam3-local-requirements.lock
```

As literally specified, this exits **1**: besides the expected `iopath`
failure (source-only, no wheel), `hf-xet==1.5.1` and `safetensors==0.6.2`
also fail with "Could not find a version that satisfies the requirement...
(from versions: none)". Root cause: neither package publishes an x86_64
wheel tagged `manylinux_2_28_x86_64` at any version checked (hf-xet
1.4.0/1.5.0/1.5.1/1.6.0; safetensors 0.6.2) — both only ship
`manylinux2014_x86_64.manylinux_2_17_x86_64`, which is glibc-compatible
(2.17 <= 2.28) but not literally tag-matched. `pip download --platform`
cross-downloads match wheel tags by exact string (confirmed via
`packaging.tags.cpython_tags(platforms=["manylinux_2_28_x86_64"])`,
13 tags, all literally `manylinux_2_28_x86_64`) — it does not expand
manylinux glibc compatibility the way a native install does. No lock
content change (different version/hash) can fix this since the tag is
never published for this package. Coordinator-approved fix: add a second
`--platform manylinux2014_x86_64` to the gate command (pip supports
repeating `--platform` to broaden the acceptable tag set):

```sh
LOCKGATE_DEST="$(mktemp -d)"
python3.12 -m pip download \
  --require-hashes --only-binary=:all: \
  --platform manylinux_2_28_x86_64 --platform manylinux2014_x86_64 \
  --python-version 3.12 \
  --dest "$LOCKGATE_DEST" \
  -r sam3-local-requirements.lock
```

With the corrected command, only `iopath` fails (exit 1, "Could not find a
version... 0.1.10" — expected, source-only). Re-running with a temporary
copy of the lock that excludes the `iopath` line succeeds (exit 0, all 30
remaining packages downloaded and hash-verified). `iopath` is then verified
on its own:

```sh
python3.12 -m pip download --require-hashes --no-binary=:all: --no-deps \
  --dest "$LOCKGATE_DEST" \
  -r <(printf 'iopath==0.1.10 \\\n    --hash=sha256:3311c16a4d9137223e20f141655759933e1eda24f8bff166af834af3c645ef01\n')
```

Exit 0 — the sdist downloads and matches the pinned hash. `--no-deps` is
added here (and was implicitly relied on for `iopath`'s own `tqdm`
dependency, already pinned elsewhere in the full lock) because production
installs this whole lock with `--no-deps` regardless.

`$LOCKGATE_DEST` is deleted (`rm -rf`) after each run; no other path is
touched and nothing downloaded here is committed to the repository.

## VTracer lock

VTracer tag `0.6.0` resolves to commit
`1080c562cefcc345b668f5e8d5eadb73797383ea` and does not publish a lock file.
This lock was generated from that checked-out source using the official Rust
1.80.0 distribution, then verified with:

```sh
cargo build --release --locked --manifest-path cmdapp/Cargo.toml
```

The local worker verifies the official Linux Rust archive hash before use,
copies this file to the cloned VTracer repository root, and must build with
`--locked`. Never run an unlocked Cargo resolution in the local job.
