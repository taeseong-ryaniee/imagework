import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const excludedPrefixes = ["node_modules/", ".next/", "out/"];
const artifactPath = /(?:^|\/)(?:colab\/)?(?:output|outputs|results)(?:\/|$)|(?:^|\/)(?:result(?:[-_].*)?|imagework-results(?:[-_].*)?)\.(?:zip|png|jpe?g|webp|gif|bmp|svg)$/i;
const environmentPath = /(?:^|\/)\.env(?:\..+)?$/;
const bytecodePath = /(?:^|\/)(?:__pycache__\/|.*\.py[co]$)/;
const internalStatePath = /^(?:\.omo|\.hermes)(?:\/|$)/;
const googleAdcCredentialKeys = new Set(["client_secret", "refresh_token", "private_key"]);
const secretPatterns = [
  /hf_[A-Za-z0-9]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /(?:AKIA|ASIA)[A-Z0-9]{16}/,
  /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/,
  /(?:^|[\r\n])\s*(?:export\s+)?(?:[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)|apiKey|token|secret|password)\s*[:=]\s*["'](?!test[-_]|example[-_]|placeholder[-_]|replace[-_]|your[-_])[A-Za-z0-9_./+=-]{20,}["']/mi,
  /(?:authorization|x-api-key)\s*[:=]\s*["']?(?:bearer\s+)?[A-Za-z0-9_.~+/=-]{20,}/i,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];

const fail = (message) => {
  throw new Error(message);
};

const gitPaths = async (argumentsList) => {
  try {
    const { stdout } = await execFileAsync("git", argumentsList, {
      encoding: "buffer",
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout
      .toString("utf8")
      .split("\0")
      .filter((path) => path.length > 0);
  } catch {
    fail("Git candidate enumeration failed.");
  }
};

const isPublicCandidate = (path) => !excludedPrefixes.some((prefix) => path.startsWith(prefix));

const indexContentFor = async (path) => {
  try {
    const { stdout } = await execFileAsync("git", ["show", `:${path}`], {
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout.toString("utf8");
  } catch {
    return undefined;
  }
};

const workingContentFor = async (path) => {
  try {
    const stat = await lstat(path);
    return stat.isFile() && !stat.isSymbolicLink() ? await readFile(path, "utf8") : undefined;
  } catch {
    return undefined;
  }
};

const environmentHasValue = (source) =>
  source.split(/\r?\n/u).some((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("#") && !/^export\s+[A-Za-z_][A-Za-z0-9_]*=$/u.test(trimmed) && !/^[A-Za-z_][A-Za-z0-9_]*=$/u.test(trimmed);
  });

const notebookIsClean = (source) => {
  try {
    const notebook = JSON.parse(source);
    return (
      Array.isArray(notebook?.cells) &&
      notebook.cells.every(
        (cell) =>
          (cell?.cell_type !== "code" ||
            ((cell.execution_count === undefined || cell.execution_count === null) &&
              (cell.outputs === undefined || (Array.isArray(cell.outputs) && cell.outputs.length === 0)))) &&
          (!cell.attachments || Object.keys(cell.attachments).length === 0),
      )
    );
  } catch {
    return false;
  }
};

const isPlaceholder = (value) => /^(?:<[^>]+>|\$\{[^}]+\}|(?:example|placeholder|replace|your)(?:[-_ ].*)?)$/iu.test(value.trim());

const hasGoogleAdcCredential = (value) => {
  if (Array.isArray(value)) {
    return value.some(hasGoogleAdcCredential);
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  return Object.entries(value).some(([key, nestedValue]) =>
    (googleAdcCredentialKeys.has(key) && typeof nestedValue === "string" && nestedValue.trim().length > 0 && !isPlaceholder(nestedValue)) ||
    hasGoogleAdcCredential(nestedValue),
  );
};

const containsGoogleAdcCredential = (source) => {
  try {
    return hasGoogleAdcCredential(JSON.parse(source));
  } catch {
    return false;
  }
};

const categoryFor = async (path, content) => {
  if (internalStatePath.test(path)) {
    return "internal agent state is public";
  }
  if (bytecodePath.test(path)) {
    return "Python bytecode is public";
  }
  if (artifactPath.test(path)) {
    return "generated result artifact is public";
  }

  if (content === undefined) {
    return "public candidate cannot be safely read";
  }
  if (environmentPath.test(path) && environmentHasValue(content)) {
    return "environment file contains a value";
  }
  if (path.endsWith(".ipynb") && !notebookIsClean(content)) {
    return "notebook has execution output or attachments";
  }
  if (containsGoogleAdcCredential(content)) {
    return "Google ADC credential is public";
  }
  if (secretPatterns.some((pattern) => pattern.test(content))) {
    return "secret-shaped content is public";
  }
  return undefined;
};

try {
  const [tracked, untracked] = await Promise.all([
    gitPaths(["ls-files", "-z"]),
    gitPaths(["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const trackedCandidates = tracked.filter(isPublicCandidate);
  const untrackedCandidates = untracked.filter((path) => isPublicCandidate(path) && !tracked.includes(path));
  const categories = new Set();

  for (const path of trackedCandidates) {
    const contents = await Promise.all([indexContentFor(path), workingContentFor(path)]);
    for (const content of contents) {
      const category = await categoryFor(path, content);
      if (category) {
        categories.add(category);
      }
    }
  }

  for (const path of untrackedCandidates) {
    const category = await categoryFor(path, await workingContentFor(path));
    if (category) {
      categories.add(category);
    }
  }

  if (categories.size > 0) {
    fail(`Public artifact gate failed: ${[...categories].sort().join("; ")}.`);
  }

  console.log(`Public artifact gate passed: ${trackedCandidates.length + untrackedCandidates.length} Git public candidate(s) checked.`);
} catch (error) {
  const message = error instanceof Error ? error.message : "Public artifact validation failed.";
  console.error(message);
  process.exitCode = 1;
}
