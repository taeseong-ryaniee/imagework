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
});
