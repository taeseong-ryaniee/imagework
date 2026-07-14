import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { assertExpectedArchive } from "../lib/zip-contract";

const temporaryPaths: string[] = [];

const transparentPng = (compressed = deflateSync(Buffer.from([0, 255, 255, 255, 0, 0, 0, 0, 255]))): Buffer => {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunk = (name: string, content: Buffer): Buffer => {
    const value = Buffer.alloc(12 + content.length);
    value.writeUInt32BE(content.length, 0);
    value.write(name, 4, "ascii");
    content.copy(value, 8);
    return value;
  };
  return Buffer.concat([header, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))]);
};

const archive = (members: Readonly<Record<string, Buffer>>): Buffer => {
  const records: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const [member, content] of Object.entries(members)) {
    const name = Buffer.from(member, "utf8");
    const local = Buffer.alloc(30 + name.length + content.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    content.copy(local, 30 + name.length);
    records.push(local);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    directory.push(central);
    offset += local.length;
  }
  const centralSize = directory.reduce((size, value) => size + value.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(records.length, 8);
  end.writeUInt16LE(records.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...records, ...directory, end]);
};

const writeArchive = async (contents: Buffer): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "imagework-zip-contract-"));
  temporaryPaths.push(root);
  const path = join(root, "imagework-results.zip");
  await writeFile(path, contents);
  return path;
};

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("returned ZIP bytes", () => {
  it("rejects malformed compressed PNG data as a result-contract error", async () => {
    const path = await writeArchive(archive({ "result.png": transparentPng(Buffer.from([1, 2, 3])) }));

    await expect(assertExpectedArchive(path, "photo")).rejects.toMatchObject({ name: "ResultContractError" });
  });

  it("rejects an SVG that contains an executable element", async () => {
    const path = await writeArchive(archive({
      "result.png": transparentPng(),
      "result.svg": Buffer.from("<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>"),
    }));

    await expect(assertExpectedArchive(path, "logo")).rejects.toMatchObject({ name: "ResultContractError" });
  });

  it.each([
    "<svg xmlns=\"http://www.w3.org/2000/svg\"><foreignObject/></svg>",
    "<svg xmlns=\"http://www.w3.org/2000/svg\"><path onload=\"alert(1)\" d=\"M0 0\"/></svg>",
    "<svg xmlns=\"http://www.w3.org/2000/svg\"><path href=\"https://example.test/image.svg\" d=\"M0 0\"/></svg>",
  ])("rejects an SVG with an unsafe static-content escape hatch", async (svg) => {
    const path = await writeArchive(archive({ "result.png": transparentPng(), "result.svg": Buffer.from(svg) }));

    await expect(assertExpectedArchive(path, "logo")).rejects.toMatchObject({ name: "ResultContractError" });
  });

  it("accepts a static SVG with an XML declaration and namespace", async () => {
    const path = await writeArchive(archive({
      "result.png": transparentPng(),
      "result.svg": Buffer.from("<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 2 1\"><path fill=\"#000\" d=\"M0 0h1v1H0z\"/></svg>"),
    }));

    await expect(assertExpectedArchive(path, "logo")).resolves.toBeUndefined();
  });
});
