import { z } from "zod";
import { ImageworkInputError } from "./colab-errors";
import { OUTPUT_FORMATS, outputSupportsMode } from "./output-format";
import type { OutputFormat } from "./output-format";

const assetModes = ["logo", "icon", "photo"] as const;
const extensions = [".png", ".jpg", ".jpeg", ".bmp", ".webp", ".gif"] as const;
const maxFileBytes = 10 * 1024 * 1024;
export const maxMultipartRequestBytes = 11 * 1024 * 1024;
const maxPixels = 20_000_000;

export type AssetMode = (typeof assetModes)[number];
export type ImageExtension = (typeof extensions)[number];
export type NormalizedBox = {
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
};
export type ProcessInput = {
  readonly bytes: Buffer;
  readonly extension: ImageExtension;
  readonly mode: AssetMode;
  readonly outputFormat: OutputFormat;
  readonly box: NormalizedBox;
  readonly processingCode: string;
};

const requestSchema = z.object({
  mode: z.enum(assetModes),
  outputFormat: z.enum(OUTPUT_FORMATS),
  cx: z.coerce.number().finite().min(0).max(1),
  cy: z.coerce.number().finite().min(0).max(1),
  width: z.coerce.number().finite().gt(0).max(1),
  height: z.coerce.number().finite().gt(0).max(1),
  processingCode: z.string().min(1).max(512),
}).superRefine((value, context) => {
  if (!outputSupportsMode(value.outputFormat, value.mode)) context.addIssue({ code: "custom", path: ["outputFormat"], message: "SVG output requires logo or icon mode" });
  if (value.cx - value.width / 2 < 0 || value.cx + value.width / 2 > 1 || value.cy - value.height / 2 < 0 || value.cy + value.height / 2 > 1) {
    context.addIssue({ code: "custom", message: "The normalized box must remain within the image." });
  }
});

const readUInt32BigEndian = (bytes: Buffer, offset: number): number => bytes.readUInt32BE(offset);

const dimensionsFor = (bytes: Buffer, extension: ImageExtension): { readonly width: number; readonly height: number } => {
  switch (extension) {
    case ".png":
      if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new ImageworkInputError();
      return { width: readUInt32BigEndian(bytes, 16), height: readUInt32BigEndian(bytes, 20) };
    case ".gif":
      if (bytes.length < 10 || (bytes.subarray(0, 6).toString("ascii") !== "GIF87a" && bytes.subarray(0, 6).toString("ascii") !== "GIF89a")) throw new ImageworkInputError();
      return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
    case ".bmp":
      if (bytes.length < 26 || bytes.subarray(0, 2).toString("ascii") !== "BM") throw new ImageworkInputError();
      return { width: Math.abs(bytes.readInt32LE(18)), height: Math.abs(bytes.readInt32LE(22)) };
    case ".webp":
      return webpDimensions(bytes);
    case ".jpg":
    case ".jpeg":
      return jpegDimensions(bytes);
  }
};

const webpDimensions = (bytes: Buffer): { readonly width: number; readonly height: number } => {
  if (bytes.length < 30 || bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WEBP") throw new ImageworkInputError();
  const kind = bytes.subarray(12, 16).toString("ascii");
  if (kind === "VP8X" && bytes.length >= 30) return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  if (kind === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const value = bytes.readUInt32LE(21);
    return { width: (value & 0x3fff) + 1, height: ((value >>> 14) & 0x3fff) + 1 };
  }
  throw new ImageworkInputError();
};

const jpegDimensions = (bytes: Buffer): { readonly width: number; readonly height: number } => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new ImageworkInputError();
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new ImageworkInputError();
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > bytes.length) throw new ImageworkInputError();
    if (marker >= 0xc0 && marker <= 0xc3) return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    offset += length + 2;
  }
  throw new ImageworkInputError();
};

const extensionFor = (name: string): ImageExtension => {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!extensions.includes(extension as ImageExtension)) throw new ImageworkInputError();
  return extension as ImageExtension;
};

export const parseProcessFormData = async (formData: FormData): Promise<ProcessInput> => {
  const parsed = requestSchema.safeParse({
    mode: formData.get("mode"),
    outputFormat: formData.get("outputFormat"),
    cx: formData.get("cx"),
    cy: formData.get("cy"),
    width: formData.get("width"),
    height: formData.get("height"),
    processingCode: formData.get("processingCode"),
  });
  if (!parsed.success) throw new ImageworkInputError();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0 || file.size > maxFileBytes) throw new ImageworkInputError();
  const extension = extensionFor(file.name);
  const bytes = Buffer.from(await file.arrayBuffer());
  const dimensions = dimensionsFor(bytes, extension);
  if (dimensions.width <= 0 || dimensions.height <= 0 || dimensions.width * dimensions.height > maxPixels) throw new ImageworkInputError();
  return {
    bytes,
    extension,
    mode: parsed.data.mode,
    outputFormat: parsed.data.outputFormat,
    box: { cx: parsed.data.cx, cy: parsed.data.cy, width: parsed.data.width, height: parsed.data.height },
    processingCode: parsed.data.processingCode,
  };
};
