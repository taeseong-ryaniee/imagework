import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workerPath = resolve(process.cwd(), "runner/remote-worker.py");
const requirementsPath = resolve(process.cwd(), "runner/sam3-requirements.lock");
const buildRequirementsPath = resolve(process.cwd(), "runner/sam3-build-requirements.lock");
const cargoLockPath = resolve(process.cwd(), "runner/vtracer-Cargo.lock");

const sha256 = (content: Buffer): string => createHash("sha256").update(content).digest("hex");

describe("remote worker dependency contract", () => {
  it("uses reviewed, hash-verified Python and Cargo locks", async () => {
    const [worker, requirements, buildRequirements, cargoLock] = await Promise.all([
      readFile(workerPath, "utf8"),
      readFile(requirementsPath),
      readFile(buildRequirementsPath),
      readFile(cargoLockPath),
    ]);

    expect(sha256(requirements)).toBe("d8365c76a9da18f79ec12ddcd2bd3e1ed194188f1ef11534f0edab1f46e0aeb3");
    expect(sha256(buildRequirements)).toBe("f9480cd6d9cb60d2e9351510baa8b31c73fbdb747e086f79513818dd634291af");
    expect(sha256(cargoLock)).toBe("79e8c98af46efb12b147413e94931ac740d6a9c1fbba3e43154a16545f426bc4");
    expect(requirements.toString("utf8")).toContain("iopath==0.1.10");
    expect(requirements.toString("utf8")).not.toMatch(/(^|\n)[^#\n]+(?:>=|~=|!=|<=|<|>)/);
    expect(worker).toContain('SAM3_REQUIREMENTS_LOCK_SHA256 = "d8365c76a9da18f79ec12ddcd2bd3e1ed194188f1ef11534f0edab1f46e0aeb3"');
    expect(worker).toContain('SAM3_BUILD_REQUIREMENTS_LOCK_SHA256 = "f9480cd6d9cb60d2e9351510baa8b31c73fbdb747e086f79513818dd634291af"');
    expect(worker).toContain('VTRACER_CARGO_LOCK_SHA256 = "79e8c98af46efb12b147413e94931ac740d6a9c1fbba3e43154a16545f426bc4"');
    expect(worker).toContain('"--no-deps", "--require-hashes", "-r", str(build_requirements_lock)');
    expect(worker).toContain('"--no-build-isolation", "--no-deps", "--require-hashes", "-r", str(requirements_lock)');
    expect(worker).not.toContain('"--only-binary=:all:"');
    expect(worker).toContain('shutil.copyfile(vtracer_cargo_lock, vtracer_root / "Cargo.lock")');
    expect(worker).toContain('[cargo, "build", "--locked", "--release"');
    expect(worker).toContain("def colab_runtime_versions() -> tuple[str, str, str, str]:");
    expect(worker).toContain('major_minor("NumPy", versions[2]) < (2, 0)');
    expect(worker).toContain('major_minor("torchvision", versions[1]) < (0, 20)');
    expect(worker).toContain('major_minor("Pillow", versions[3]) < (10, 0)');
    expect(worker).toContain("if colab_runtime_versions() != base_runtime_versions:");
    expect(worker.indexOf("image = load_input(image_candidates[0])")).toBeLessThan(worker.indexOf("base_runtime_versions = colab_runtime_versions()"));
    expect(worker.indexOf("image = load_input(image_candidates[0])")).toBeLessThan(worker.indexOf("install_sources(job_root / \"sources\""));
    expect(worker.indexOf("image = load_input(image_candidates[0])")).toBeLessThan(worker.indexOf("token = token_path.read_text"));
    expect(worker).toContain('if (job_root / "hf-token").exists():');
    expect(worker).toContain('raise RuntimeError("token must not be present during preparation")');
    expect(worker).toContain('if sys.argv[1:] == ["--prepare"]:');
    expect(worker).toContain('if sys.argv[1:] == ["--run"]:');
  });
});
