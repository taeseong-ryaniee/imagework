import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryRoots: string[] = [];
const gatePath = resolve(process.cwd(), "scripts/check-public-artifacts.mjs");
const subprocessTimeoutMs = 15_000;

const createRepository = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "imagework-public-gate-"));
  temporaryRoots.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "user.email", "gate@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Gate Fixture"], { cwd: root });
  await writeFile(join(root, "README.md"), "# clean\n");
  execFileSync("git", ["add", "README.md"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "clean"], { cwd: root });
  return root;
};

const gateResult = (root: string) => spawnSync(process.execPath, [gatePath], { cwd: root, encoding: "utf8" });

const expectCategory = (root: string, category: string): void => {
  const result = gateResult(root);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(category);
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("public artifact gate", () => {
  it("accepts an archival Markdown-only notebook without execution fields", async () => {
    const root = await createRepository();
    await mkdir(join(root, "legacy"));
    await writeFile(join(root, "legacy", "archive.ipynb"), JSON.stringify({
      nbformat: 4,
      cells: [{ cell_type: "markdown", metadata: {}, source: ["Archived instructions."] }],
    }));
    await writeFile(join(root, "credentials.example.json"), JSON.stringify({
      client_secret: "<replace-with-secret>",
      refresh_token: "${REFRESH_TOKEN}",
      private_key: "example-private-key",
    }));
    execFileSync("git", ["add", "legacy/archive.ipynb", "credentials.example.json"], { cwd: root });

    expect(gateResult(root).status).toBe(0);
  }, subprocessTimeoutMs);

  it("rejects notebook execution output and attachments", async () => {
    const root = await createRepository();
    await writeFile(join(root, "evidence.ipynb"), JSON.stringify({
      nbformat: 4,
      cells: [{ cell_type: "code", execution_count: 1, outputs: [{ output_type: "stream" }], attachments: { "image.png": {} } }],
    }));
    execFileSync("git", ["add", "evidence.ipynb"], { cwd: root });

    expectCategory(root, "notebook has execution output or attachments");
  }, subprocessTimeoutMs);

  it("rejects ADC credentials staged before a harmless working-tree replacement", async () => {
    const root = await createRepository();
    const credentialPath = join(root, "adc.json");
    const stagedCredential = JSON.stringify({
      type: "authorized_user",
      client_secret: "test-client-secret-value",
      refresh_token: "test-refresh-token-value",
      private_key: "test-private-key-value",
    });
    await writeFile(credentialPath, stagedCredential);
    execFileSync("git", ["add", "adc.json"], { cwd: root });
    await writeFile(credentialPath, "{\"status\":\"harmless\"}\n");

    expectCategory(root, "Google ADC credential is public");
    const result = gateResult(root);
    expect(result.stderr).not.toContain("adc.json");
    expect(result.stderr).not.toContain("test-client-secret-value");
  }, subprocessTimeoutMs);

  it("rejects an unstaged secret in a tracked clean-index file", async () => {
    const root = await createRepository();
    const workingSecret = ["hf", "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"].join("_");
    await writeFile(join(root, "README.md"), `${workingSecret}\n`);

    expectCategory(root, "secret-shaped content is public");
    const result = gateResult(root);
    expect(result.stderr).not.toContain("README.md");
    expect(result.stderr).not.toContain(workingSecret);
  }, subprocessTimeoutMs);
});
