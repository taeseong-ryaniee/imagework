import { LocalJobRunner, matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from "@/lib/local-job-runner";
import { CommandExecutionError, ImageworkInputError, JobCancelledError, JobRegistrationError, JobTimeoutError, ProcessingCodeError, QueueCapacityError, ResultContractError, RunnerConfigurationError } from "@/lib/job-errors";
import { maxMultipartRequestBytes, parseProcessFormData } from "@/lib/image-input";
import { parseProcessJobId, processJobRegistry, type ProcessJobRegistry } from "@/lib/process-job-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Runner = Pick<LocalJobRunner, "run">;
type RunnerProvider = () => Runner;
type ConfigProvider = () => Pick<RunnerConfig, "processingCode">;
const apiHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const apiJson = (body: { readonly error: string }, status: number, headers: Readonly<Record<string, string>> = {}): Response => Response.json(body, { status, headers: { ...apiHeaders, ...headers } });

const responseFor = (error: unknown): Response => {
  if (error instanceof ImageworkInputError || error instanceof ProcessingCodeError || error instanceof JobRegistrationError) return apiJson({ error: "입력값을 다시 확인해 주세요." }, 400);
  if (error instanceof RunnerConfigurationError) return apiJson({ error: "서버 작업자가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요." }, 503);
  if (error instanceof QueueCapacityError) return apiJson({ error: "현재 요청이 많습니다. 잠시 후 다시 시도해 주세요." }, 429, { "Retry-After": "60" });
  if (error instanceof JobTimeoutError) return apiJson({ error: "작업 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요." }, 504);
  if (error instanceof JobCancelledError) return apiJson({ error: "요청이 취소되었습니다." }, 499);
  if (error instanceof CommandExecutionError) return apiJson({ error: "현재 작업을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요." }, 503);
  if (error instanceof ResultContractError) return apiJson({ error: "결과 파일을 확인하지 못했습니다. 다시 시도해 주세요." }, 502);
  return apiJson({ error: "처리 중 문제가 발생했습니다. 다시 시도해 주세요." }, 500);
};

// Submission is now fire-and-forget: register the job, hand it to the runner's queue, and
// respond 202 without waiting for processing to finish. The client learns the outcome via
// GET /api/process/status and downloads via GET /api/process/result.
export const createProcessHandler = (runnerProvider: RunnerProvider, registry: ProcessJobRegistry = processJobRegistry, configProvider: ConfigProvider = () => parseRunnerConfig(process.env)) => async (request: Request): Promise<Response> => {
  try {
    const declaredLength = request.headers.get("content-length");
    if (declaredLength && (!/^[0-9]+$/.test(declaredLength) || Number(declaredLength) > maxMultipartRequestBytes)) throw new ImageworkInputError();
    const processingCode = request.headers.get("x-imagework-processing-code");
    if (!processingCode || !matchesProcessingCode(processingCode, configProvider().processingCode)) throw new ProcessingCodeError();
    const formData = await request.formData();
    const jobId = parseProcessJobId(formData.get("jobId"));
    const input = await parseProcessFormData(formData);
    const jobSignal = registry.register(jobId);
    // Queue admission (RunnerConfigurationError/QueueCapacityError/an already-cancelled
    // signal) rejects before the job is ever pushed onto the runner's queue, so the
    // registry entry would otherwise stay "queued" forever — patch that here. Every other
    // rejection path inside LocalJobRunner already transitions the registry itself before
    // rejecting, so this only fires for the genuinely-stuck case (guarded by the state
    // check) and never overwrites a legitimate outcome the runner already recorded.
    void runnerProvider().run(jobId, input, jobSignal).catch((error) => {
      if (registry.read(jobId)?.state !== "queued") return;
      if (error instanceof JobCancelledError) registry.markCancelled(jobId);
      else registry.markFailed(jobId, "runnerConfiguration");
    });
    return Response.json({ jobId }, { status: 202, headers: apiHeaders });
  } catch (error) {
    return responseFor(error);
  }
};

let serverRunner: LocalJobRunner | undefined;

const runnerFromEnvironment = (): LocalJobRunner => {
  if (!serverRunner) serverRunner = new LocalJobRunner(parseRunnerConfig(process.env));
  return serverRunner;
};

export const POST = createProcessHandler(runnerFromEnvironment);
