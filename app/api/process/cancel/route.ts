import { matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from "@/lib/colab-job-runner";
import { ImageworkInputError, RunnerConfigurationError } from "@/lib/colab-errors";
import { parseProcessJobId, processJobRegistry, type ProcessJobRegistry } from "@/lib/process-job-registry";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cancelSchema = z.object({
  jobId: z.string().uuid(),
  processingCode: z.string().min(1).max(512),
});

type ConfigProvider = () => Pick<RunnerConfig, "processingCode">;
const apiHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const apiJson = (body: { readonly error: string }, status: number): Response => Response.json(body, { status, headers: apiHeaders });

const cancellationResponse = (error: unknown): Response => {
  if (error instanceof ImageworkInputError) return apiJson({ error: "입력값을 다시 확인해 주세요." }, 400);
  if (error instanceof RunnerConfigurationError) return apiJson({ error: "서버 작업자가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요." }, 503);
  return apiJson({ error: "취소 요청을 처리하지 못했습니다. 다시 시도해 주세요." }, 500);
};

export const createCancelHandler = (configProvider: ConfigProvider, registry: ProcessJobRegistry = processJobRegistry) => async (request: Request): Promise<Response> => {
  try {
    const parsed = cancelSchema.safeParse(await request.json());
    if (!parsed.success) throw new ImageworkInputError();
    const config = configProvider();
    if (!matchesProcessingCode(parsed.data.processingCode, config.processingCode)) throw new ImageworkInputError();
    registry.cancel(parseProcessJobId(parsed.data.jobId));
    return Response.json({ accepted: true }, { status: 202, headers: apiHeaders });
  } catch (error) {
    return cancellationResponse(error);
  }
};

export const POST = createCancelHandler(() => parseRunnerConfig(process.env));
