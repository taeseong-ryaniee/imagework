import { readFile, rm } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from "@/lib/local-job-runner";
import { ImageworkInputError, ProcessingCodeError } from "@/lib/job-errors";
import { parseProcessJobId, processJobRegistry, type ProcessJobRegistry } from "@/lib/process-job-registry";
import { OUTPUT_FORMATS, resultMetadataFor } from "@/lib/output-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConfigProvider = () => Pick<RunnerConfig, "processingCode">;
const apiHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const apiJson = (body: { readonly error: string }, status: number): Response => Response.json(body, { status, headers: apiHeaders });

// The runner already extracted the requested format and named the file after
// resultMetadataFor's convention (result.png / result.svg / imagework-results.zip), so the
// content type and download filename can be recovered from the basename alone.
const metadataByFileName = new Map<string, ReturnType<typeof resultMetadataFor>>(
  OUTPUT_FORMATS.map((format) => [resultMetadataFor(format).name, resultMetadataFor(format)]),
);

const resultResponseFor = (error: unknown): Response => {
  if (error instanceof ImageworkInputError || error instanceof ProcessingCodeError) return apiJson({ error: "입력값을 다시 확인해 주세요." }, 400);
  return apiJson({ error: "결과를 확인하지 못했습니다. 다시 시도해 주세요." }, 500);
};

export const createResultHandler = (registry: ProcessJobRegistry = processJobRegistry, configProvider: ConfigProvider = () => parseRunnerConfig(process.env)) => async (request: Request): Promise<Response> => {
  try {
    const processingCode = request.headers.get("x-imagework-processing-code");
    if (!processingCode || !matchesProcessingCode(processingCode, configProvider().processingCode)) throw new ProcessingCodeError();
    const jobId = parseProcessJobId(new URL(request.url).searchParams.get("jobId"));
    const status = registry.read(jobId);
    // Missing, malformed, TTL-expired, not-yet-done, or already-downloaded (resultPath
    // gone) jobIds are all indistinguishable from the caller's perspective: 400.
    if (!status || status.state !== "done" || !status.resultPath) throw new ImageworkInputError();
    const metadata = metadataByFileName.get(basename(status.resultPath));
    if (!metadata) throw new ImageworkInputError();
    const bytes = await readFile(status.resultPath);
    // Delete as soon as the download is served — the earliest of "downloaded" or "TTL
    // elapsed" per spec. TTL-without-download cleanup has no event source in this route
    // (no request ever arrives), so it is not implemented here; see the OW-203 Linear
    // Decisions comment for the accepted gap (same one OW-202 flagged for local-job-runner).
    await rm(dirname(status.resultPath), { recursive: true, force: true });
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Disposition": `attachment; filename="${metadata.name}"`,
        "Content-Type": metadata.contentType,
        ...apiHeaders,
      },
    });
  } catch (error) {
    return resultResponseFor(error);
  }
};

export const GET = createResultHandler();
