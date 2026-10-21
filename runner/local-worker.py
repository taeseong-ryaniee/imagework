import hashlib
import json
import os
import signal
import subprocess
import sys
import tempfile
import warnings
import xml.etree.ElementTree as element_tree
import zipfile
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageFile, ImageOps

# Long-lived local worker: the inference core ported from runner/remote-worker.py
# (load_input/load_job/run_inference), split into a one-time startup (model resident
# on the GPU) and a per-job stdio loop. See OW-201's Linear "## Decisions" for the
# stdio protocol this speaks with lib/local-job-runner.ts.

SAM3_SHA256 = "9999e2341ceef5e136daa386eecb55cb414446a00ac2b55eb2dfd2f7c3cf8c9e"
SAM3_LOCAL_REQUIREMENTS_LOCK_SHA256 = "ba864ebdaecbb503386d831dbc7e6417dbfcbabe54c7d308d82a6941468681b1"
SAM3_LOCAL_BUILD_REQUIREMENTS_LOCK_SHA256 = "b795477f5362614ab3b614ffa6953ff8b1e0909c167dfa10ae36212e1969ce8b"
VTRACER_CARGO_LOCK_SHA256 = "79e8c98af46efb12b147413e94931ac740d6a9c1fbba3e43154a16545f426bc4"

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".webp", ".gif"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 20_000_000
RESULT_ARCHIVE_NAME = "imagework-results.zip"

WORKER_DIR = Path(__file__).resolve().parent

_cancel_requested = False
_current_job_dir: Path | None = None


class InvalidInputError(RuntimeError):
    pass


class InferenceError(RuntimeError):
    pass


class VectorizeError(RuntimeError):
    pass


class CancelledError(RuntimeError):
    pass


def _handle_sigusr1(signum, frame) -> None:
    # Flag only — the process stays alive, checkpoints in _run_job observe the flag.
    global _cancel_requested
    _cancel_requested = True


def _handle_sigterm(signum, frame) -> None:
    # No checkpoint wait: clean up whatever the current job left behind, then die now.
    if _current_job_dir is not None:
        _cleanup_partial_output(_current_job_dir)
    os._exit(0)


def _write_protocol(protocol_fd: int, message: dict) -> None:
    os.write(protocol_fd, (json.dumps(message) + "\n").encode("utf8"))


def _cleanup_partial_output(job_dir: Path) -> None:
    (job_dir / f"{RESULT_ARCHIVE_NAME}.tmp").unlink(missing_ok=True)


def _verify_lock(path: Path, expected_sha256: str) -> None:
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected_sha256:
        raise RuntimeError(f"lock hash mismatch: {path.name}")


def _verify_locks() -> None:
    _verify_lock(WORKER_DIR / "sam3-local-requirements.lock", SAM3_LOCAL_REQUIREMENTS_LOCK_SHA256)
    _verify_lock(WORKER_DIR / "sam3-local-build-requirements.lock", SAM3_LOCAL_BUILD_REQUIREMENTS_LOCK_SHA256)
    _verify_lock(WORKER_DIR / "vtracer-Cargo.lock", VTRACER_CARGO_LOCK_SHA256)


def _load_model():
    # Exactly one call site for build_sam3_image_model, outside the job loop below.
    model_cache = Path(os.environ["IMAGEWORK_MODEL_CACHE"])
    vtracer_bin = os.environ["IMAGEWORK_VTRACER_BIN"]
    checkpoint_path = model_cache / "sam3.pt"
    if not checkpoint_path.is_file() or hashlib.sha256(checkpoint_path.read_bytes()).hexdigest() != SAM3_SHA256:
        raise RuntimeError("SAM3 checkpoint hash mismatch")
    import sam3
    from sam3 import build_sam3_image_model
    from sam3.model.sam3_image_processor import Sam3Processor

    bpe_path = Path(sam3.__file__).resolve().parent / "assets" / "bpe_simple_vocab_16e6.txt.gz"
    model = build_sam3_image_model(
        bpe_path=str(bpe_path),
        checkpoint_path=str(checkpoint_path),
        load_from_HF=False,
        device="cuda",
        eval_mode=True,
        enable_inst_interactivity=True,
    )
    processor = Sam3Processor(model, resolution=1008, confidence_threshold=0.5)
    return processor, vtracer_bin


def load_input(path: Path) -> Image.Image:
    if path.suffix.lower() not in ALLOWED_EXTENSIONS or path.stat().st_size > MAX_UPLOAD_BYTES:
        raise RuntimeError("invalid input")
    ImageFile.LOAD_TRUNCATED_IMAGES = False
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(path) as probe:
            if probe.width * probe.height > MAX_PIXELS:
                raise RuntimeError("input exceeds pixel limit")
            probe.verify()
        with Image.open(path) as source:
            if getattr(source, "is_animated", False):
                source.seek(0)
            image = ImageOps.exif_transpose(source).convert("RGB")
    return image


def load_job(job_dir: Path) -> tuple[str, dict[str, float], Image.Image]:
    configuration = json.loads((job_dir / "job.json").read_text(encoding="utf8"))
    mode = configuration.get("mode")
    box = configuration.get("box")
    if mode not in {"logo", "icon", "photo"} or not isinstance(box, dict):
        raise RuntimeError("invalid job configuration")
    image_candidates = [path for path in job_dir.glob("input.*") if path.suffix.lower() in ALLOWED_EXTENSIONS]
    if len(image_candidates) != 1:
        raise RuntimeError("exactly one input is required")
    image = load_input(image_candidates[0])
    return mode, box, image


def _run_job(job_dir: Path, processor, vtracer_bin: str) -> None:
    try:
        mode, box, image = load_job(job_dir)
    except Exception as error:
        raise InvalidInputError(str(error)) from error

    try:
        normalized_box = [box[key] for key in ("cx", "cy", "width", "height")]
    except KeyError as error:
        raise InvalidInputError("invalid target box") from error

    if _cancel_requested:  # checkpoint 1/2: image loaded, before forward
        raise CancelledError()

    try:
        with torch.inference_mode(), torch.autocast(device_type="cuda", dtype=torch.float16):
            state = processor.set_image(image)
            output = processor.add_geometric_prompt(box=normalized_box, label=True, state=state)
        masks, scores = output["masks"], output["scores"]
        best = int(torch.argmax(scores.detach().float().reshape(-1).cpu()).item())
        mask = masks[best].detach().to(device="cpu").squeeze().numpy().astype(bool)
        if mask.shape != (image.height, image.width) or not mask.any() or mask.all():
            raise RuntimeError("invalid segmentation mask")
    except torch.cuda.OutOfMemoryError:
        raise
    except Exception as error:
        raise InferenceError(str(error)) from error

    if _cancel_requested:  # checkpoint 2/2: forward done, before vtracer
        raise CancelledError()

    archive_path = job_dir / RESULT_ARCHIVE_NAME
    tmp_archive_path = job_dir / f"{RESULT_ARCHIVE_NAME}.tmp"
    try:
        with tempfile.TemporaryDirectory(dir=job_dir) as output_directory:
            output_root = Path(output_directory)
            png_path = output_root / "result.png"
            rgba = image.convert("RGBA")
            rgba.putalpha(Image.fromarray(mask.astype(np.uint8) * 255, mode="L"))
            rgba.save(png_path, format="PNG")
            members = [png_path]
            if mode in {"logo", "icon"}:
                svg_path = output_root / "result.svg"
                subprocess.run(
                    [vtracer_bin, "--input", str(png_path), "--output", str(svg_path), "--colormode", "color", "--filter_speckle", "4"],
                    check=True, capture_output=True, timeout=120,
                )
                if element_tree.parse(svg_path).getroot().tag.rsplit("}", 1)[-1] != "svg":
                    raise RuntimeError("invalid SVG")
                members.append(svg_path)
            with zipfile.ZipFile(tmp_archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for member in members:
                    archive.write(member, arcname=member.name)
        os.rename(tmp_archive_path, archive_path)  # atomic: readers never see a partial ZIP
    except Exception as error:
        tmp_archive_path.unlink(missing_ok=True)
        raise VectorizeError(str(error)) from error


def _process_job(job_id: str, job_dir: Path, processor, vtracer_bin: str) -> tuple[dict, bool]:
    try:
        _run_job(job_dir, processor, vtracer_bin)
        return {"jobId": job_id, "ok": True}, False
    except CancelledError:
        _cleanup_partial_output(job_dir)
        return {"jobId": job_id, "ok": False, "errorKind": "cancelled"}, False
    except InvalidInputError:
        _cleanup_partial_output(job_dir)
        return {"jobId": job_id, "ok": False, "errorKind": "invalidInput"}, False
    except VectorizeError:
        _cleanup_partial_output(job_dir)
        return {"jobId": job_id, "ok": False, "errorKind": "vectorize"}, False
    except torch.cuda.OutOfMemoryError:
        # ponytail: only the named OOM case triggers self-exit; broaden if other
        # CUDA-context-poisoning exceptions show up in practice.
        _cleanup_partial_output(job_dir)
        return {"jobId": job_id, "ok": False, "errorKind": "inference"}, True
    except InferenceError:
        _cleanup_partial_output(job_dir)
        return {"jobId": job_id, "ok": False, "errorKind": "inference"}, False
    finally:
        torch.cuda.empty_cache()


def _run_worker() -> None:
    global _current_job_dir, _cancel_requested
    _verify_locks()
    # fd isolation (D19): protocol_fd keeps the original stdout target; fd 1 itself
    # is repointed to stderr so no C extension / subprocess can corrupt the protocol
    # stream by writing to fd 1 directly. Only sys.stdout would be caught by that —
    # dup2 on the fd itself is what actually closes the hole.
    protocol_fd = os.dup(1)
    os.dup2(2, 1)
    processor, vtracer_bin = _load_model()
    signal.signal(signal.SIGUSR1, _handle_sigusr1)
    signal.signal(signal.SIGTERM, _handle_sigterm)
    _write_protocol(protocol_fd, {"ready": True})
    # ponytail: request lines come from lib/local-job-runner.ts in the same trust
    # boundary (not untrusted network input) — no defensive parsing beyond this.
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        request = json.loads(line)
        job_id = request["jobId"]
        job_dir = Path(request["jobDir"])
        _cancel_requested = False
        _current_job_dir = job_dir
        response, should_exit = _process_job(job_id, job_dir, processor, vtracer_bin)
        _current_job_dir = None
        _write_protocol(protocol_fd, response)
        if should_exit:
            os._exit(1)  # parent respawns; CUDA context may be poisoned


def _self_test() -> None:
    _verify_locks()
    processor, vtracer_bin = _load_model()
    with tempfile.TemporaryDirectory() as tmp:
        job_dir = Path(tmp)
        # A solid shape on a contrasting background, so the correct mask is neither empty nor full
        # (_run_job rejects both). The box encloses the shape and is smaller than the image; logo mode
        # also runs the vtracer branch.
        image = Image.new("RGB", (256, 256), color=(255, 255, 255))
        image.paste((200, 30, 30), (80, 80, 176, 176))
        image.save(job_dir / "input.png", format="PNG")
        (job_dir / "job.json").write_text(
            json.dumps({"mode": "logo", "box": {"cx": 0.5, "cy": 0.5, "width": 0.625, "height": 0.625}}),
            encoding="utf8",
        )
        _run_job(job_dir, processor, vtracer_bin)
        with zipfile.ZipFile(job_dir / RESULT_ARCHIVE_NAME) as archive:
            assert sorted(archive.namelist()) == ["result.png", "result.svg"]
            assert all(archive.getinfo(name).file_size > 0 for name in archive.namelist())
    print("self-test ok", file=sys.stderr)


def main() -> None:
    if sys.argv[1:] == ["--self-test"]:
        _self_test()
        return
    if sys.argv[1:]:
        raise RuntimeError("expected no arguments or --self-test")
    _run_worker()


if __name__ == "__main__":
    main()
