export const OUTPUT_FORMATS = ["png", "svg", "zip"] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export type DownloadedResult = Readonly<{
  readonly bytes: Buffer;
  readonly contentType: "application/zip" | "image/png" | "image/svg+xml";
  readonly name: "imagework-results.zip" | "result.png" | "result.svg";
}>;

export const outputSupportsMode = (format: OutputFormat, mode: "logo" | "icon" | "photo"): boolean => format !== "svg" || mode !== "photo";

export const resultMetadataFor = (format: OutputFormat): Omit<DownloadedResult, "bytes"> => {
  switch (format) {
    case "png": return { contentType: "image/png", name: "result.png" };
    case "svg": return { contentType: "image/svg+xml", name: "result.svg" };
    case "zip": return { contentType: "application/zip", name: "imagework-results.zip" };
  }
};
