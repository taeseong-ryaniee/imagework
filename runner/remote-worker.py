import hashlib
import importlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import warnings
import xml.etree.ElementTree as element_tree
import zipfile
from pathlib import Path

import numpy as np
import torch
import PIL
from PIL import Image, ImageFile, ImageOps

SAM3_REPOSITORY = "https://github.com/facebookresearch/sam3.git"
SAM3_COMMIT = "5dd401d1c5c1d5c3eedff06d41b77af824517619"
SAM3_REVISION = "3c879f39826c281e95690f02c7821c4de09afae7"
SAM3_SHA256 = "9999e2341ceef5e136daa386eecb55cb414446a00ac2b55eb2dfd2f7c3cf8c9e"
VTRACER_REPOSITORY = "https://github.com/visioncortex/vtracer.git"
VTRACER_TAG = "0.6.0"
VTRACER_COMMIT = "1080c562cefcc345b668f5e8d5eadb73797383ea"
SAM3_REQUIREMENTS_LOCK_SHA256 = "d8365c76a9da18f79ec12ddcd2bd3e1ed194188f1ef11534f0edab1f46e0aeb3"
SAM3_BUILD_REQUIREMENTS_LOCK_SHA256 = "f9480cd6d9cb60d2e9351510baa8b31c73fbdb747e086f79513818dd634291af"
VTRACER_CARGO_LOCK_SHA256 = "79e8c98af46efb12b147413e94931ac740d6a9c1fbba3e43154a16545f426bc4"
RUST_ARCHIVE_URL = "https://static.rust-lang.org/dist/2024-07-25/rust-1.80.0-x86_64-unknown-linux-gnu.tar.xz"
RUST_ARCHIVE_SHA256 = "ea59f08e38ca4abed144be38de629c662a8f714548e7c061fca40b4a139f9170"
RUST_ARCHIVE_DIRECTORY = "rust-1.80.0-x86_64-unknown-linux-gnu"
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".webp", ".gif"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 20_000_000


def run(stage: str, command: list[str], *, timeout: int, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, check=True, text=True, capture_output=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(f"{stage} timed out") from error
    except subprocess.CalledProcessError as error:
        raise RuntimeError(f"{stage} failed") from error


def major_minor(name: str, version: str) -> tuple[int, int]:
    parts = version.split("+", 1)[0].split(".")
    try:
        return int(parts[0]), int(parts[1])
    except (IndexError, ValueError) as error:
        raise RuntimeError(f"unsupported {name} version") from error


def colab_runtime_versions() -> tuple[str, str, str, str]:
    try:
        import torchvision
    except ImportError as error:
        raise RuntimeError("missing Colab torchvision runtime") from error
    versions = (torch.__version__, torchvision.__version__, np.__version__, PIL.__version__)
    if not torch.cuda.is_available() or major_minor("PyTorch", versions[0]) < (2, 7):
        raise RuntimeError("unsupported Colab GPU runtime")
    if not (1, 26) <= major_minor("NumPy", versions[2]) < (2, 0):
        raise RuntimeError("unsupported Colab NumPy runtime")
    if major_minor("torchvision", versions[1]) < (0, 20):
        raise RuntimeError("unsupported Colab torchvision runtime")
    if major_minor("Pillow", versions[3]) < (10, 0):
        raise RuntimeError("unsupported Colab Pillow runtime")
    return versions


def install_sources(root: Path, build_requirements_lock: Path, requirements_lock: Path, vtracer_cargo_lock: Path) -> tuple[Path, Path]:
    root.mkdir(parents=True, exist_ok=True)
    if not build_requirements_lock.is_file() or hashlib.sha256(build_requirements_lock.read_bytes()).hexdigest() != SAM3_BUILD_REQUIREMENTS_LOCK_SHA256:
        raise RuntimeError("SAM3 build requirements lock mismatch")
    if not requirements_lock.is_file() or hashlib.sha256(requirements_lock.read_bytes()).hexdigest() != SAM3_REQUIREMENTS_LOCK_SHA256:
        raise RuntimeError("SAM3 requirements lock mismatch")
    if not vtracer_cargo_lock.is_file() or hashlib.sha256(vtracer_cargo_lock.read_bytes()).hexdigest() != VTRACER_CARGO_LOCK_SHA256:
        raise RuntimeError("VTracer Cargo lock mismatch")
    sam_root = root / "sam3"
    vtracer_root = root / "vtracer"
    cargo_home = root / "cargo"
    rust_root = root / "rust"
    rust_archive = root / "rust-1.80.0-x86_64-unknown-linux-gnu.tar.xz"
    run("download Rust", ["curl", "--proto", "=https", "--tlsv1.2", "--fail", "--silent", "--show-error", RUST_ARCHIVE_URL, "--output", str(rust_archive)], timeout=120)
    if hashlib.sha256(rust_archive.read_bytes()).hexdigest() != RUST_ARCHIVE_SHA256:
        raise RuntimeError("Rust archive hash mismatch")
    run("extract Rust", ["tar", "-xJf", str(rust_archive), "-C", str(root)], timeout=120)
    installer = root / RUST_ARCHIVE_DIRECTORY / "install.sh"
    run("install Rust", ["sh", str(installer), f"--prefix={rust_root}", "--disable-ldconfig"], timeout=600)
    rust_archive.unlink(missing_ok=True)
    environment = {**os.environ, "CARGO_HOME": str(cargo_home), "PATH": f"{rust_root / 'bin'}:{os.environ.get('PATH', '')}"}
    cargo = str(rust_root / "bin" / "cargo")
    run("clone SAM3", ["git", "clone", "--filter=blob:none", "--no-checkout", SAM3_REPOSITORY, str(sam_root)], timeout=300)
    run("checkout SAM3", ["git", "-C", str(sam_root), "checkout", "--detach", SAM3_COMMIT], timeout=120)
    run("install SAM3 build dependencies", [sys.executable, "-m", "pip", "install", "--quiet", "--no-deps", "--require-hashes", "-r", str(build_requirements_lock)], timeout=600)
    run("install SAM3 dependencies", [sys.executable, "-m", "pip", "install", "--quiet", "--no-build-isolation", "--no-deps", "--require-hashes", "-r", str(requirements_lock)], timeout=600)
    run("install SAM3", [sys.executable, "-m", "pip", "install", "--quiet", "--no-deps", "--force-reinstall", "--editable", str(sam_root)], timeout=600)
    run("clone VTracer", ["git", "clone", "--depth", "1", "--branch", VTRACER_TAG, VTRACER_REPOSITORY, str(vtracer_root)], timeout=300)
    if run("verify VTracer", ["git", "-C", str(vtracer_root), "rev-parse", "HEAD"], timeout=60).stdout.strip() != VTRACER_COMMIT:
        raise RuntimeError("VTracer source pin mismatch")
    shutil.copyfile(vtracer_cargo_lock, vtracer_root / "Cargo.lock")
    run("build VTracer", [cargo, "build", "--locked", "--release", "--manifest-path", str(vtracer_root / "cmdapp" / "Cargo.toml")], timeout=900, env=environment)
    return sam_root, vtracer_root / "target" / "release" / "vtracer"


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


def load_job(job_root: Path) -> tuple[str, dict[str, float], Image.Image]:
    configuration = json.loads((job_root / "job.json").read_text(encoding="utf8"))
    mode = configuration.get("mode")
    box = configuration.get("box")
    if mode not in {"logo", "icon", "photo"} or not isinstance(box, dict):
        raise RuntimeError("invalid job configuration")
    image_candidates = [path for path in job_root.glob("input.*") if path.suffix.lower() in ALLOWED_EXTENSIONS]
    if len(image_candidates) != 1:
        raise RuntimeError("exactly one input is required")
    image = load_input(image_candidates[0])
    return mode, box, image


def prepare(job_root: Path) -> None:
    if (job_root / "hf-token").exists():
        raise RuntimeError("token must not be present during preparation")
    load_job(job_root)
    base_runtime_versions = colab_runtime_versions()
    install_sources(job_root / "sources", job_root / "sam3-build-requirements.lock", job_root / "sam3-requirements.lock", job_root / "vtracer-Cargo.lock")
    if colab_runtime_versions() != base_runtime_versions:
        raise RuntimeError("Colab base runtime changed during dependency installation")
    (job_root / "prepared.json").write_text(json.dumps({"runtime_versions": base_runtime_versions}), encoding="utf8")


def run_inference(job_root: Path) -> None:
    try:
        prepared = json.loads((job_root / "prepared.json").read_text(encoding="utf8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("missing preparation state") from error
    if prepared.get("runtime_versions") != list(colab_runtime_versions()):
        raise RuntimeError("Colab base runtime changed after preparation")
    mode, box, image = load_job(job_root)
    sam_root = job_root / "sources" / "sam3"
    vtracer = job_root / "sources" / "vtracer" / "target" / "release" / "vtracer"
    if not sam_root.is_dir() or not vtracer.is_file():
        raise RuntimeError("missing prepared sources")
    token_path = job_root / "hf-token"
    token = token_path.read_text(encoding="utf8").strip()
    token_path.unlink(missing_ok=True)
    if not token:
        raise RuntimeError("missing model credential")
    sys.path.insert(0, str(sam_root))
    importlib.invalidate_caches()
    sam_spec = importlib.util.find_spec("sam3")
    if sam_spec is None or sam_spec.origin is None or not Path(sam_spec.origin).resolve().is_relative_to(sam_root.resolve()):
        raise RuntimeError("pinned SAM3 source is not importable")
    sam_module = importlib.import_module("sam3")
    sam_builder = importlib.import_module("sam3.model_builder")
    if sam_module.__file__ is None or not Path(sam_module.__file__).resolve().is_relative_to(sam_root.resolve()) or not hasattr(sam_builder, "build_sam3_image_model"):
        raise RuntimeError("pinned SAM3 import preflight failed")
    from sam3 import build_sam3_image_model
    from sam3.model.sam3_image_processor import Sam3Processor
    from huggingface_hub import hf_hub_download

    checkpoint = Path(hf_hub_download(repo_id="facebook/sam3", filename="sam3.pt", revision=SAM3_REVISION, token=token, cache_dir=job_root / "hf-cache"))
    token = ""
    if hashlib.sha256(checkpoint.read_bytes()).hexdigest() != SAM3_SHA256:
        raise RuntimeError("model checkpoint hash mismatch")
    model = build_sam3_image_model(bpe_path=str(sam_root / "sam3" / "assets" / "bpe_simple_vocab_16e6.txt.gz"), checkpoint_path=str(checkpoint), load_from_HF=False, device="cuda", eval_mode=True, enable_inst_interactivity=True)
    processor = Sam3Processor(model, resolution=1008, confidence_threshold=0.5)
    normalized_box = [box[key] for key in ("cx", "cy", "width", "height")]
    with torch.inference_mode(), torch.autocast(device_type="cuda", dtype=torch.float16):
        state = processor.set_image(image)
        output = processor.add_geometric_prompt(box=normalized_box, label=True, state=state)
    masks, scores = output["masks"], output["scores"]
    best = int(torch.argmax(scores.detach().float().reshape(-1).cpu()).item())
    mask = masks[best].detach().to(device="cpu").squeeze().numpy().astype(bool)
    if mask.shape != (image.height, image.width) or not mask.any() or mask.all():
        raise RuntimeError("invalid segmentation mask")
    with tempfile.TemporaryDirectory(dir=job_root) as output_directory:
        output_root = Path(output_directory)
        png_path = output_root / "result.png"
        rgba = image.convert("RGBA")
        rgba.putalpha(Image.fromarray(mask.astype(np.uint8) * 255, mode="L"))
        rgba.save(png_path, format="PNG")
        members = [png_path]
        if mode in {"logo", "icon"}:
            svg_path = output_root / "result.svg"
            run("vectorize result", [str(vtracer), "--input", str(png_path), "--output", str(svg_path), "--colormode", "color", "--filter_speckle", "4"], timeout=120)
            if element_tree.parse(svg_path).getroot().tag.rsplit("}", 1)[-1] != "svg":
                raise RuntimeError("invalid SVG")
            members.append(svg_path)
        archive_path = job_root / "imagework-results.zip"
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for member in members:
                archive.write(member, arcname=member.name)


def main() -> None:
    job_root = Path(__file__).resolve().parent
    if sys.argv[1:] == ["--prepare"]:
        prepare(job_root)
        return
    if sys.argv[1:] == ["--run"]:
        run_inference(job_root)
        return
    raise RuntimeError("expected --prepare or --run")


if __name__ == "__main__":
    main()
