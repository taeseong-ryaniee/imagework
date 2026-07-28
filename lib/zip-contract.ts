import { readFile, stat } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import * as yauzl from "yauzl";
import type { AssetMode } from "./colab-input";
import { ResultContractError } from "./colab-errors";
import { resultMetadataFor } from "./output-format";
import type { DownloadedResult, OutputFormat } from "./output-format";

const maxArchiveBytes = 50 * 1024 * 1024;
const maxMemberBytes = 45 * 1024 * 1024;
const maxPngPixels = 20_000_000;
const maxDecodedPngBytes = 100 * 1024 * 1024;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const staticSvgElements = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polygon", "polyline"]);
const staticSvgAttributes = new Set([
  "xmlns", "xmlns:xlink", "version", "width", "height", "viewbox", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-opacity", "opacity", "transform", "d", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "points", "id",
]);

const expectedMembersFor = (mode: AssetMode): ReadonlySet<string> => mode === "photo" ? new Set(["result.png"]) : new Set(["result.png", "result.svg"]);

type ValidatedMembers = Readonly<{ readonly png: Buffer; readonly svg?: Buffer }>;

const validateArchive = async (path: string, mode: AssetMode): Promise<ValidatedMembers> => {
  const info = await stat(path);
  if (info.size <= 0 || info.size > maxArchiveBytes) throw new ResultContractError();
  const expected = expectedMembersFor(mode);
  await new Promise<void>((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, validateEntrySizes: true }, (openError, archive) => {
      if (openError || !archive) {
        reject(new ResultContractError());
        return;
      }
      const members = new Set<string>();
      let complete = false;
      archive.on("entry", (entry) => {
        if (entry.uncompressedSize > maxMemberBytes || !expected.has(entry.fileName) || members.has(entry.fileName)) {
          archive.close();
          reject(new ResultContractError());
          return;
        }
        members.add(entry.fileName);
        archive.readEntry();
      });
      archive.once("error", () => reject(new ResultContractError()));
      archive.once("end", () => {
        complete = members.size === expected.size && [...expected].every((member) => members.has(member));
        if (!complete) {
          reject(new ResultContractError());
          return;
        }
        archive.close();
      });
      archive.once("close", () => {
        if (complete) resolve();
      });
      archive.readEntry();
    });
  });
  const png = await readMember(path, "result.png");
  assertTransparentPng(png);
  if (mode === "photo") return { png };
  const svg = await readMember(path, "result.svg");
  assertSafeStaticSvg(svg);
  return { png, svg };
};

export const assertExpectedArchive = async (path: string, mode: AssetMode): Promise<void> => {
  try {
    await validateArchive(path, mode);
  } catch (error) {
    throw error instanceof ResultContractError ? error : new ResultContractError();
  }
};

export const extractRequestedResult = async (path: string, mode: AssetMode, outputFormat: OutputFormat): Promise<DownloadedResult> => {
  const metadata = resultMetadataFor(outputFormat);
  try {
    const members = await validateArchive(path, mode);
    switch (outputFormat) {
      case "zip": return { ...metadata, bytes: await readFile(path) };
      case "png": return { ...metadata, bytes: members.png };
      case "svg": {
        if (!members.svg) throw new ResultContractError();
        return { ...metadata, bytes: members.svg };
      }
    }
  } catch (error) {
    throw error instanceof ResultContractError ? error : new ResultContractError();
  }
};

const readMember = async (path: string, name: string): Promise<Buffer> => new Promise((resolve, reject) => {
  yauzl.open(path, { lazyEntries: true, validateEntrySizes: true }, (openError, archive) => {
    if (openError || !archive) {
      reject(new ResultContractError());
      return;
    }
    archive.on("entry", (entry) => {
      if (entry.fileName !== name) {
        archive.readEntry();
        return;
      }
      archive.openReadStream(entry, (streamError, stream) => {
        if (streamError || !stream) {
          archive.close();
          reject(new ResultContractError());
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxMemberBytes) {
            stream.destroy();
            archive.close();
            reject(new ResultContractError());
            return;
          }
          chunks.push(chunk);
        });
        stream.once("error", () => reject(new ResultContractError()));
        stream.once("end", () => {
          archive.close();
          resolve(Buffer.concat(chunks));
        });
      });
    });
    archive.once("end", () => reject(new ResultContractError()));
    archive.once("error", () => reject(new ResultContractError()));
    archive.readEntry();
  });
});

const assertTransparentPng = (bytes: Buffer): void => {
  if (bytes.length < 57 || !bytes.subarray(0, 8).equals(pngSignature)) throw new ResultContractError();
  const idat: Buffer[] = [];
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) throw new ResultContractError();
    const kind = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const content = bytes.subarray(offset + 8, offset + 8 + length);
    if (!sawHeader) {
      if (kind !== "IHDR" || length !== 13) throw new ResultContractError();
      width = content.readUInt32BE(0);
      height = content.readUInt32BE(4);
      const pixels = width * height;
      if (width === 0 || height === 0 || !Number.isSafeInteger(pixels) || pixels > maxPngPixels || content[8] !== 8 || content[9] !== 6 || content[10] !== 0 || content[11] !== 0 || content[12] !== 0) throw new ResultContractError();
      sawHeader = true;
    } else if (kind === "IDAT") {
      if (sawEnd) throw new ResultContractError();
      idat.push(content);
      sawImageData = true;
    } else if (kind === "IEND") {
      if (length !== 0 || !sawImageData || chunkEnd !== bytes.length) throw new ResultContractError();
      sawEnd = true;
    } else if (kind === "IHDR" || (kind.charCodeAt(0) >= 65 && kind.charCodeAt(0) <= 90)) {
      throw new ResultContractError();
    }
    offset = chunkEnd;
  }
  if (!sawHeader || !sawImageData || !sawEnd || offset !== bytes.length) throw new ResultContractError();
  const rowBytes = width * 4;
  const decodedLength = height * (rowBytes + 1);
  if (!Number.isSafeInteger(decodedLength) || decodedLength > maxDecodedPngBytes) throw new ResultContractError();
  const raw = inflateSync(Buffer.concat(idat), { maxOutputLength: decodedLength });
  if (raw.length !== decodedLength) throw new ResultContractError();
  let transparent = false;
  let opaque = false;
  let previous = Buffer.alloc(rowBytes);
  for (let row = 0; row < height; row += 1) {
    const rowStart = row * (rowBytes + 1);
    const filter = raw[rowStart];
    const current = Buffer.from(raw.subarray(rowStart + 1, rowStart + 1 + rowBytes));
    for (let index = 0; index < rowBytes; index += 1) current[index] = (current[index] + filteredByte(filter, current, previous, index)) & 0xff;
    for (let index = 3; index < rowBytes; index += 4) {
      transparent ||= current[index] === 0;
      opaque ||= current[index] === 255;
    }
    previous = current;
  }
  if (!transparent || !opaque) throw new ResultContractError();
};

const filteredByte = (filter: number, current: Buffer, previous: Buffer, index: number): number => {
  const left = index >= 4 ? current[index - 4] : 0;
  const above = previous[index];
  const upperLeft = index >= 4 ? previous[index - 4] : 0;
  switch (filter) {
    case 0: return 0;
    case 1: return left;
    case 2: return above;
    case 3: return Math.floor((left + above) / 2);
    case 4: {
      const prediction = left + above - upperLeft;
      const leftDistance = Math.abs(prediction - left);
      const aboveDistance = Math.abs(prediction - above);
      const upperLeftDistance = Math.abs(prediction - upperLeft);
      return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left : aboveDistance <= upperLeftDistance ? above : upperLeft;
    }
    default: throw new ResultContractError();
  }
};

const assertSafeStaticSvg = (bytes: Buffer): void => {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let source = decoder.decode(bytes).trim();
  const declaration = source.match(/^<\?xml\s+[^?]*\?>\s*/i);
  if (declaration) source = source.slice(declaration[0].length);
  if (source.length === 0 || source.includes("<?") || source.includes("<!") || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source)) throw new ResultContractError();
  const stack: string[] = [];
  let graphicalElementCount = 0;
  let index = 0;
  while (index < source.length) {
    if (source[index] !== "<") {
      const nextTag = source.indexOf("<", index);
      const text = source.slice(index, nextTag === -1 ? source.length : nextTag);
      if (text.trim().length > 0) throw new ResultContractError();
      index = nextTag === -1 ? source.length : nextTag;
      continue;
    }
    const tagEnd = findTagEnd(source, index + 1);
    if (tagEnd === -1) throw new ResultContractError();
    const rawTag = source.slice(index + 1, tagEnd);
    if (rawTag.startsWith("/")) {
      const name = rawTag.slice(1).trim().toLowerCase();
      if (!/^[a-z][a-z0-9-]*$/.test(name) || stack.pop() !== name) throw new ResultContractError();
    } else {
      const selfClosing = /\/\s*$/.test(rawTag);
      const content = selfClosing ? rawTag.replace(/\/\s*$/, "") : rawTag;
      const match = content.match(/^\s*([A-Za-z][A-Za-z0-9-]*)([\s\S]*)$/);
      if (!match) throw new ResultContractError();
      const name = match[1].toLowerCase();
      if (!staticSvgElements.has(name) || (stack.length === 0 && name !== "svg") || (stack.length > 0 && name === "svg")) throw new ResultContractError();
      assertSafeStaticSvgAttributes(match[2]);
      if (name !== "svg" && name !== "g") graphicalElementCount += 1;
      if (!selfClosing) stack.push(name);
    }
    index = tagEnd + 1;
  }
  if (stack.length !== 0 || graphicalElementCount === 0) throw new ResultContractError();
};

const findTagEnd = (source: string, start: number): number => {
  let quote: "\"" | "'" | undefined;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (character === "\"" || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
};

const assertSafeStaticSvgAttributes = (source: string): void => {
  let index = 0;
  while (index < source.length) {
    const remaining = source.slice(index);
    if (/^\s*$/.test(remaining)) return;
    const match = remaining.match(/^\s*([A-Za-z_:][A-Za-z0-9_:.-]*)\s*=\s*(["'])([\s\S]*?)\2/);
    if (!match) throw new ResultContractError();
    const name = match[1].toLowerCase();
    const value = match[3];
    const namespaceValue = (name === "xmlns" && value === "http://www.w3.org/2000/svg") || (name === "xmlns:xlink" && value === "http://www.w3.org/1999/xlink");
    if (!staticSvgAttributes.has(name) || /^(?:on|href$|src$)/i.test(name) || (!namespaceValue && /(?:url\s*\(|javascript\s*:|data\s*:|https?\s*:)/i.test(value)) || value.includes("<")) throw new ResultContractError();
    index += match[0].length;
  }
};
