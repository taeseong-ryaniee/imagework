import { matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from "@/lib/local-job-runner";
import { ImageworkInputError, ProcessingCodeError } from "@/lib/job-errors";
import { parseProcessJobId, processJobRegistry, type ProcessJobRegistry } from "@/lib/process-job-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConfigProvider = () => Pick<RunnerConfig, "processingCode">;
const apiHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const apiJson = (body: { readonly error: string }, status: number): Response => Response.json(body, { status, headers: apiHeaders });

const statusResponseFor = (error: unknown): Response => {
  if (error instanceof ImageworkInputError || error instanceof ProcessingCodeError) return apiJson({ error: "입력값을 다시 확인해 주세요." }, 400);
  return apiJson({ error: "상태를 확인하지 못했습니다. 다시 시도해 주세요." }, 500);
};

export const createStatusHandler = (registry: ProcessJobRegistry = processJobRegistry, configProvider: ConfigProvider = () => parseRunnerConfig(process.env)) => async (request: Request): Promise<Response> => {
  try {
    const processingCode = request.headers.get("x-imagework-processing-code");
    if (!processingCode || !matchesProcessingCode(processingCode, configProvider().processingCode)) throw new ProcessingCodeError();
    const jobId = parseProcessJobId(new URL(request.url).searchParams.get("jobId"));
    const status = registry.read(jobId);
    if (!status) throw new ImageworkInputError(); // missing, malformed, or TTL-expired jobId all land here
    return Response.json(
      {
        state: status.state,
        ...(status.state === "failed" ? { errorKind: status.errorKind } : {}),
        ...(status.state === "queued" ? { queuePosition: status.queuePosition } : {}),
      },
      { status: 200, headers: apiHeaders },
    );
  } catch (error) {
    return statusResponseFor(error);
  }
};

export const GET = createStatusHandler();
