import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const notebookPath = resolve(process.argv[2] ?? "colab/imagework.ipynb");
const tokenPattern = /hf_[A-Za-z0-9]{20,}/;
const requiredMarkers = [
  ["archive status", "# Archived Colab workflow"],
  ["non-executable warning", "intentionally non-executable"],
  ["canonical worker guide", "docs/server-worker.md"],
];

const fail = (message) => {
  throw new Error(message);
};

const sourceFor = (cell) => {
  if (typeof cell.source === "string") {
    return cell.source;
  }
  if (Array.isArray(cell.source) && cell.source.every((line) => typeof line === "string")) {
    return cell.source.join("");
  }
  fail("Notebook contains a cell with invalid source.");
};

try {
  const serialized = await readFile(notebookPath, "utf8");
  if (tokenPattern.test(serialized)) {
    fail("Notebook contains a long Hugging Face token literal.");
  }

  const notebook = JSON.parse(serialized);
  if (notebook?.nbformat !== 4 || !Array.isArray(notebook.cells)) {
    fail("Notebook must be an nbformat 4 document with cells.");
  }

  const sources = notebook.cells.map((cell, index) => {
    if (cell?.cell_type !== "markdown") {
      fail(`Archived notebook cell ${index} must be markdown, not executable.`);
    }
    if (cell.execution_count !== undefined && cell.execution_count !== null) {
      fail(`Notebook cell ${index} has an execution count.`);
    }
    if (cell.outputs !== undefined && (!Array.isArray(cell.outputs) || cell.outputs.length !== 0)) {
      fail(`Notebook cell ${index} has saved output.`);
    }
    return sourceFor(cell);
  });

  for (const [name, marker] of requiredMarkers) {
    if (!sources.some((source) => source.includes(marker))) {
      fail(`Notebook is missing required contract marker: ${name}.`);
    }
  }

  console.log(`Archived notebook hygiene check passed: ${notebookPath}`);
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown notebook validation failure.";
  console.error(`Notebook hygiene check failed: ${message}`);
  process.exitCode = 1;
}
