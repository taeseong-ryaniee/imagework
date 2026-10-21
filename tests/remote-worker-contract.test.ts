import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workerPath = resolve(process.cwd(), "runner/local-worker.py");
const requirementsPath = resolve(process.cwd(), "runner/sam3-local-requirements.lock");
const buildRequirementsPath = resolve(process.cwd(), "runner/sam3-local-build-requirements.lock");
const cargoLockPath = resolve(process.cwd(), "runner/vtracer-Cargo.lock");

const sha256 = (content: Buffer): string => createHash("sha256").update(content).digest("hex");

describe("local worker dependency contract", () => {
  it("uses reviewed, hash-verified Python and Cargo locks", async () => {
    const [worker, requirements, buildRequirements, cargoLock] = await Promise.all([
      readFile(workerPath, "utf8"),
      readFile(requirementsPath),
      readFile(buildRequirementsPath),
      readFile(cargoLockPath),
    ]);

    expect(sha256(requirements)).toBe("ba864ebdaecbb503386d831dbc7e6417dbfcbabe54c7d308d82a6941468681b1");
    expect(sha256(buildRequirements)).toBe("b795477f5362614ab3b614ffa6953ff8b1e0909c167dfa10ae36212e1969ce8b");
    expect(sha256(cargoLock)).toBe("79e8c98af46efb12b147413e94931ac740d6a9c1fbba3e43154a16545f426bc4");
    expect(requirements.toString("utf8")).toContain("iopath==0.1.10");
    expect(requirements.toString("utf8")).not.toMatch(/(^|\n)[^#\n]+(?:>=|~=|!=|<=|<|>)/);
    expect(worker).toContain('SAM3_LOCAL_REQUIREMENTS_LOCK_SHA256 = "ba864ebdaecbb503386d831dbc7e6417dbfcbabe54c7d308d82a6941468681b1"');
    expect(worker).toContain('SAM3_LOCAL_BUILD_REQUIREMENTS_LOCK_SHA256 = "b795477f5362614ab3b614ffa6953ff8b1e0909c167dfa10ae36212e1969ce8b"');
    expect(worker).toContain('VTRACER_CARGO_LOCK_SHA256 = "79e8c98af46efb12b147413e94931ac740d6a9c1fbba3e43154a16545f426bc4"');
    expect(worker).toContain("os.dup2(2, 1)");
    expect(worker).toContain("signal.signal(signal.SIGUSR1,");
    expect(worker).toContain("os.rename(tmp_archive_path, archive_path)");
    expect(worker).toContain('"--self-test"');
  });
  it("OW199 regression F1 mixed logo self-test contract", async () => {
    const worker = await readFile(workerPath, "utf8");
    const start = worker.indexOf("def _self_test()");
    const selfTest = worker.slice(start, worker.indexOf("def main()", start));
    expect(start).toBeGreaterThan(-1);

    const image = /Image\.new\("RGB", \((\d+), (\d+)\), color=\((\d+), (\d+), (\d+)\)\)/.exec(selfTest);
    const shape = /\.paste\(\((\d+), (\d+), (\d+)\), \((\d+), (\d+), (\d+), (\d+)\)\)/.exec(selfTest);
    const box = /"cx": ([0-9.]+), "cy": ([0-9.]+), "width": ([0-9.]+), "height": ([0-9.]+)/.exec(selfTest);
    expect(image).not.toBeNull();
    expect(shape).not.toBeNull();
    expect(box).not.toBeNull();
    const [imageWidth, imageHeight] = [Number(image?.[1]), Number(image?.[2])];
    const background = [3, 4, 5].map((index) => Number(image?.[index]));
    const foreground = [1, 2, 3].map((index) => Number(shape?.[index]));
    const [left, top, right, bottom] = [4, 5, 6, 7].map((index) => Number(shape?.[index]));
    const [cx, cy, width, height] = [1, 2, 3, 4].map((index) => Number(box?.[index]));

    // The correct mask (the shape) must be neither empty nor full: contrasting, non-empty, strictly inside the image.
    const contrast = Math.max(...foreground.map((value, index) => Math.abs(value - background[index])));
    expect(contrast).toBeGreaterThanOrEqual(100);
    expect(right).toBeGreaterThan(left);
    expect(bottom).toBeGreaterThan(top);
    expect(left).toBeGreaterThan(0);
    expect(top).toBeGreaterThan(0);
    expect(right).toBeLessThan(imageWidth);
    expect(bottom).toBeLessThan(imageHeight);
    // The prompt box encloses the shape strictly and stays smaller than the image.
    const boxLeft = (cx - width / 2) * imageWidth;
    const boxRight = (cx + width / 2) * imageWidth;
    const boxTop = (cy - height / 2) * imageHeight;
    const boxBottom = (cy + height / 2) * imageHeight;
    expect(boxLeft).toBeLessThan(left);
    expect(boxTop).toBeLessThan(top);
    expect(boxRight).toBeGreaterThan(right);
    expect(boxBottom).toBeGreaterThan(bottom);
    expect(width).toBeLessThan(1);
    expect(height).toBeLessThan(1);
    // Logo mode makes the vtracer path run, and the archive is inspected after _run_job.
    expect(selfTest).toContain('"mode": "logo"');
    expect(selfTest).toContain('["result.png", "result.svg"]');
    expect(selfTest.indexOf("_verify_locks()")).toBeLessThan(selfTest.indexOf("_load_model()"));
    expect(selfTest.indexOf("_load_model()")).toBeLessThan(selfTest.indexOf("_run_job("));
    expect(selfTest.indexOf("_run_job(")).toBeLessThan(selfTest.indexOf("zipfile.ZipFile"));
  });

  it("OW199 support F5 documentation lifecycle claims", async () => {
    const [claude, serverDoc, resultRoute] = await Promise.all([
      readFile(resolve(process.cwd(), "CLAUDE.md"), "utf8"),
      readFile(resolve(process.cwd(), "docs/server-worker.md"), "utf8"),
      readFile(resolve(process.cwd(), "app/api/process/result/route.ts"), "utf8"),
    ]);

    expect(claude).not.toContain("spawned once at server startup");
    expect(claude).not.toContain("Cleanup always runs");
    expect(claude).toContain("process group");
    expect(serverDoc).toContain("process group");
    expect(resultRoute).not.toContain("accepted gap");
  });
});
