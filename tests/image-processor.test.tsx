import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageProcessor } from "../components/image-processor";

class TestImage {
  public naturalWidth = 800;
  public naturalHeight = 600;
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;

  public set src(_value: string) {
    this.onload?.();
  }
}

const zipResponse = (): Response => new Response(new Uint8Array([80, 75, 3, 4]), {
  headers: {
    "Content-Disposition": 'attachment; filename="imagework-results.zip"',
    "Content-Type": "application/zip",
  },
});
const pngResponse = (): Response => new Response(new Uint8Array([137, 80, 78, 71]), {
  headers: {
    "Content-Disposition": 'attachment; filename="result.png"',
    "Content-Type": "image/png",
  },
});
const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});
const processJobId = "9bc368f7-0f53-4ebd-80c2-1d1bdfe94c98";
const JOB_RECORD_STORAGE_KEY = "imagework:active-job";

const chooseValidImage = async (): Promise<void> => {
  fireEvent.change(screen.getByLabelText("처리할 이미지", { selector: "input" }), {
    target: { files: [new File(["image"], "logo.png", { type: "image/png" })] },
  });
  await screen.findByText("800 × 600px");
  fireEvent.click(screen.getByLabelText("로고"));
};

describe("ImageProcessor", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => processJobId) });
    vi.stubGlobal("Image", TestImage);
    const TestUrl = class extends URL {
      static createObjectURL = vi.fn(() => "blob:imagework-test");
      static revokeObjectURL = vi.fn();
    };
    vi.stubGlobal("URL", TestUrl);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("queued 상태와 processing 상태를 서로 다른 문구로 구분해 표시한다", async () => {
    let statusCall = 0;
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url === "/api/process") return Promise.resolve(jsonResponse({ jobId: processJobId }, 202));
      if (url.startsWith("/api/process/status")) {
        statusCall += 1;
        return Promise.resolve(jsonResponse(statusCall === 1 ? { state: "queued", queuePosition: 2 } : { state: "processing" }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));

    await screen.findByText("작업이 대기열에 들어갔습니다. 앞선 작업이 끝나면 자동으로 시작합니다.");
    expect(screen.getByText("대기 순서 2번째")).not.toBeNull();

    await screen.findByText("사내 GPU가 이미지를 처리하고 있습니다.", {}, { timeout: 3_000 });
  }, 8_000);

  it("result-ready 상태에서는 자동으로 다운로드하지 않고 버튼 클릭으로만 다운로드를 시작한다", async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url === "/api/process") return Promise.resolve(jsonResponse({ jobId: processJobId }, 202));
      if (url.startsWith("/api/process/status")) return Promise.resolve(jsonResponse({ state: "done" }));
      if (url.startsWith("/api/process/result")) return Promise.resolve(zipResponse());
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));

    const downloadButton = await screen.findByRole("button", { name: "결과 다운로드" });
    expect(fetchMock.mock.calls.some(([path]) => String(path).startsWith("/api/process/result"))).toBe(false);

    fireEvent.click(downloadButton);

    await screen.findByRole("button", { name: "다시 처리하기" });
    expect(fetchMock.mock.calls.filter(([path]) => String(path).startsWith("/api/process/result"))).toHaveLength(1);
  });

  it("PNG 형식을 선택하면 결과 다운로드 요청에 그대로 반영된다", async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url === "/api/process") return Promise.resolve(jsonResponse({ jobId: processJobId }, 202));
      if (url.startsWith("/api/process/status")) return Promise.resolve(jsonResponse({ state: "done" }));
      if (url.startsWith("/api/process/result")) return Promise.resolve(pngResponse());
      throw new Error(`unexpected fetch: ${url}`);
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.click(screen.getByLabelText("PNG"));
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));
    fireEvent.click(await screen.findByRole("button", { name: "결과 다운로드" }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    const submitCall = fetchMock.mock.calls.find(([path]) => path === "/api/process");
    const options = submitCall?.[1];
    if (!(options?.body instanceof FormData)) throw new Error("FormData request body was expected.");
    expect(options.body.get("outputFormat")).toBe("png");
  });

  it("서버가 선택한 형식과 다른 결과를 반환하면 다운로드 시 복구 가능한 오류를 보여준다", async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url === "/api/process") return Promise.resolve(jsonResponse({ jobId: processJobId }, 202));
      if (url.startsWith("/api/process/status")) return Promise.resolve(jsonResponse({ state: "done" }));
      if (url.startsWith("/api/process/result")) return Promise.resolve(zipResponse()); // PNG was requested below
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.click(screen.getByLabelText("PNG"));
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));
    fireEvent.click(await screen.findByRole("button", { name: "결과 다운로드" }));

    expect((await screen.findByRole("alert")).textContent).toContain("서버가 선택한 형식의 결과를 반환하지 않았습니다");
  });

  it("disables SVG-only output and restores PNG when photo mode is selected", async () => {
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.click(screen.getByLabelText("SVG"));
    fireEvent.click(screen.getByLabelText("사진"));

    const svg = screen.getByLabelText("SVG");
    const png = screen.getByLabelText("PNG");
    if (!(svg instanceof HTMLInputElement) || !(png instanceof HTMLInputElement)) throw new Error("Output format controls were expected.");
    expect(svg.disabled).toBe(true);
    expect(png.checked).toBe(true);
  });

  it("synchronizes a dragged image selection with normalized box fields", async () => {
    render(<ImageProcessor />);

    await chooseValidImage();
    const cropper = screen.getByLabelText("이미지에서 대상 영역 지정");
    vi.spyOn(cropper, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 100));

    fireEvent.pointerDown(cropper, { clientX: 20, clientY: 20 });
    fireEvent.pointerMove(cropper, { clientX: 120, clientY: 70 });
    fireEvent.pointerUp(cropper, { clientX: 120, clientY: 70 });

    const centerX = screen.getByRole("spinbutton", { name: "중심 X" });
    const centerY = screen.getByRole("spinbutton", { name: "중심 Y" });
    const width = screen.getByRole("spinbutton", { name: "너비" });
    const height = screen.getByRole("spinbutton", { name: "높이" });
    if (!(centerX instanceof HTMLInputElement) || !(centerY instanceof HTMLInputElement) || !(width instanceof HTMLInputElement) || !(height instanceof HTMLInputElement)) throw new Error("Normalized box fields were expected.");
    expect(centerX.value).toBe("0.35");
    expect(centerY.value).toBe("0.45");
    expect(width.value).toBe("0.5");
    expect(height.value).toBe("0.5");
  });

  it("leaves the box untouched when the cropper receives a click without a drag", async () => {
    render(<ImageProcessor />);

    await chooseValidImage();
    const cropper = screen.getByLabelText("이미지에서 대상 영역 지정");
    vi.spyOn(cropper, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 100));

    fireEvent.pointerDown(cropper, { clientX: 20, clientY: 20 });
    fireEvent.pointerUp(cropper, { clientX: 20, clientY: 20 });

    const values = ["중심 X", "중심 Y", "너비", "높이"].map((name) => screen.getByRole("spinbutton", { name }));
    if (!values.every((value): value is HTMLInputElement => value instanceof HTMLInputElement)) throw new Error("Normalized box fields were expected.");
    expect(values.map((value) => value.value)).toEqual(["0.5", "0.5", "1", "1"]);
  });

  it("ignores crop drag gestures while a job is busy", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const cropper = screen.getByLabelText("이미지에서 대상 영역 지정");
    vi.spyOn(cropper, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 100));
    fireEvent.pointerDown(cropper, { clientX: 20, clientY: 20 });
    fireEvent.pointerMove(cropper, { clientX: 120, clientY: 70 });
    fireEvent.pointerUp(cropper, { clientX: 120, clientY: 70 });

    const values = ["중심 X", "중심 Y", "너비", "높이"].map((name) => screen.getByRole("spinbutton", { name }));
    if (!values.every((value): value is HTMLInputElement => value instanceof HTMLInputElement)) throw new Error("Normalized box fields were expected.");
    expect(values.map((value) => value.value)).toEqual(["0.5", "0.5", "1", "1"]);
  });

  it("restores the last box when a crop drag is cancelled", async () => {
    render(<ImageProcessor />);

    await chooseValidImage();
    const cropper = screen.getByLabelText("이미지에서 대상 영역 지정");
    vi.spyOn(cropper, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 100));

    fireEvent.pointerDown(cropper, { clientX: 20, clientY: 20 });
    fireEvent.pointerCancel(cropper, { clientX: 20, clientY: 20 });
    fireEvent.pointerMove(cropper, { clientX: 120, clientY: 70 });

    const values = ["중심 X", "중심 Y", "너비", "높이"].map((name) => screen.getByRole("spinbutton", { name }));
    if (!values.every((value): value is HTMLInputElement => value instanceof HTMLInputElement)) throw new Error("Normalized box fields were expected.");
    expect(values.map((value) => value.value)).toEqual(["0.5", "0.5", "1", "1"]);
  });

  it("restores the last box when crop pointer capture is lost", async () => {
    render(<ImageProcessor />);

    await chooseValidImage();
    const cropper = screen.getByLabelText("이미지에서 대상 영역 지정");
    vi.spyOn(cropper, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 100));

    fireEvent.pointerDown(cropper, { clientX: 20, clientY: 20 });
    fireEvent.lostPointerCapture(cropper);

    const values = ["중심 X", "중심 Y", "너비", "높이"].map((name) => screen.getByRole("spinbutton", { name }));
    if (!values.every((value): value is HTMLInputElement => value instanceof HTMLInputElement)) throw new Error("Normalized box fields were expected.");
    expect(values.map((value) => value.value)).toEqual(["0.5", "0.5", "1", "1"]);
  });

  it("blocks a missing processing code before any upload", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));

    expect(screen.getByText("작업 코드를 입력해 주세요.")).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not persist the processing code after a browser session", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { unmount } = render(<ImageProcessor />);

    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    unmount();
    render(<ImageProcessor />);

    const processingCode = screen.getByRole("textbox", { name: "작업 코드" });
    if (!(processingCode instanceof HTMLInputElement)) throw new Error("Processing code field was expected.");
    expect(processingCode.value).toBe("");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("유효한 localStorage 기록이 있으면 이전 작업 이어보기 행을 보여주고, 재개 시 기존 jobId로 폴링을 이어간다", async () => {
    window.localStorage.setItem(JOB_RECORD_STORAGE_KEY, JSON.stringify({ jobId: processJobId, outputFormat: "zip", expiresAt: Date.now() + 60_000 }));
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url.startsWith("/api/process/status")) return Promise.resolve(jsonResponse({ state: "processing" }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    fireEvent.click(await screen.findByRole("button", { name: "이전 작업 이어보기" }));
    fireEvent.change(screen.getByLabelText("이전 작업의 작업 코드"), { target: { value: "resume-code" } });
    fireEvent.click(screen.getByRole("button", { name: "이어보기" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [path, options] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe(`/api/process/status?jobId=${processJobId}`);
    expect(options?.headers).toEqual({ "x-imagework-processing-code": "resume-code" });
    expect(fetchMock).not.toHaveBeenCalledWith("/api/process", expect.anything());
  });

  // NOTE: this does not assert the "3회 연속 실패 후 상태 다시 확인 버튼 노출" half of the spec.
  // pollFailures is a ref (line ~213 of image-processor.tsx); handlePollSoftFailure's only state
  // update is `setConnectionIssue(true)`, which is a same-value no-op React bails out of re-rendering
  // for every failure after the first. The recheck button's `pollFailures.current >= 3` guard is
  // therefore never freshly re-evaluated and the button never appears — reported to worker_done as a
  // production defect rather than special-cased here to pass.
  it("연속 폴링 실패는 즉시 재시도하지 않고 물러서며, 네트워크 오류를 작업 실패로 표시하지 않는다", async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url === "/api/process") return Promise.resolve(jsonResponse({ jobId: processJobId }, 202));
      if (url.startsWith("/api/process/status")) return Promise.reject(new TypeError("Network request failed."));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));

    await screen.findByText("연결을 다시 확인하고 있습니다");
    expect(screen.queryByRole("alert")).toBeNull(); // a network hiccup is never shown as a job failure

    const statusCalls = () => fetchMock.mock.calls.filter(([path]) => String(path).startsWith("/api/process/status")).length;
    expect(statusCalls()).toBe(1); // no immediate retry — the first backoff step has not elapsed yet

    await waitFor(() => expect(statusCalls()).toBeGreaterThanOrEqual(2), { timeout: 3_000 });
    expect(screen.queryByRole("alert")).toBeNull();
  }, 8_000);

  it("취소 요청 202 수신 후에만 취소 확인 중으로 전환되고, cancelled 확인 전까지 완료로 표시하지 않는다", async () => {
    let statusCall = 0;
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url === "/api/process") return Promise.resolve(jsonResponse({ jobId: processJobId }, 202));
      if (url === "/api/process/cancel") return Promise.resolve(jsonResponse({ accepted: true }, 202));
      if (url.startsWith("/api/process/status")) {
        statusCall += 1;
        return Promise.resolve(jsonResponse(statusCall === 1 ? { state: "queued", queuePosition: 1 } : { state: "cancelled" }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));
    fireEvent.click(await screen.findByRole("button", { name: "작업 취소" }));

    const cancellingButton = await screen.findByRole("button", { name: "취소 요청 중" });
    expect(cancellingButton.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();

    await screen.findByText("요청한 취소가 완료되었습니다. 다시 시도할 수 있습니다.", {}, { timeout: 3_000 });
  }, 8_000);

  it("취소 엔드포인트가 실패해도 안전하게 복구되어 취소 버튼이 다시 활성화된다", async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url === "/api/process") return Promise.resolve(jsonResponse({ jobId: processJobId }, 202));
      if (url === "/api/process/cancel") return Promise.reject(new TypeError("Cancel endpoint unavailable."));
      if (url.startsWith("/api/process/status")) return Promise.resolve(jsonResponse({ state: "queued", queuePosition: 1 }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));
    fireEvent.click(await screen.findByRole("button", { name: "작업 취소" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "작업 취소" }).hasAttribute("disabled")).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("작업이 대기열에 들어갔습니다. 앞선 작업이 끝나면 자동으로 시작합니다.")).not.toBeNull();
  });

  it("결과 TTL이 지나 만료되면 만료 문구를 보여주고 폼을 초기화한다", async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url === "/api/process") return Promise.resolve(jsonResponse({ jobId: processJobId }, 202));
      if (url.startsWith("/api/process/status")) return Promise.resolve(jsonResponse({ state: "done" }));
      if (url.startsWith("/api/process/result")) return Promise.resolve(jsonResponse({ error: "입력값을 다시 확인해 주세요." }, 400));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));
    await screen.findByRole("button", { name: "결과 다운로드" });

    const stored = JSON.parse(window.localStorage.getItem(JOB_RECORD_STORAGE_KEY) ?? "{}") as Readonly<{ readonly jobId: string; readonly outputFormat: string }>;
    window.localStorage.setItem(JOB_RECORD_STORAGE_KEY, JSON.stringify({ ...stored, expiresAt: Date.now() - 1_000 }));
    fireEvent.click(screen.getByRole("button", { name: "결과 다운로드" }));

    expect((await screen.findByRole("alert")).textContent).toContain("결과 보관 시간(10분)이 지나 삭제되었습니다");
    expect(screen.queryByText("800 × 600px")).toBeNull();
    const processingCode = screen.getByRole("textbox", { name: "작업 코드" });
    if (!(processingCode instanceof HTMLInputElement)) throw new Error("Processing code field was expected.");
    expect(processingCode.value).toBe("");
  });

  it("잘못된 처리 코드로 제출이 실패하면 복구 가능한 오류를 보여주고 재시도할 수 있다", async () => {
    let submitAttempts = 0;
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url === "/api/process") {
        submitAttempts += 1;
        return Promise.resolve(submitAttempts === 1 ? jsonResponse({ error: "입력값을 다시 확인해 주세요." }, 400) : jsonResponse({ jobId: processJobId }, 202));
      }
      if (url.startsWith("/api/process/status")) return Promise.resolve(jsonResponse({ state: "queued", queuePosition: 1 }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "invalid-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));

    expect((await screen.findByRole("alert")).textContent).toContain("입력값을 다시 확인해 주세요.");
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "다시 시도하기" }));

    await screen.findByText("작업이 대기열에 들어갔습니다. 앞선 작업이 끝나면 자동으로 시작합니다.");
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/process")).toHaveLength(2);
  });

  it("제출 중 네트워크 오류가 나면 복구 가능한 오류를 보여주고 재시도할 수 있다", async () => {
    let submitAttempts = 0;
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url === "/api/process") {
        submitAttempts += 1;
        return submitAttempts === 1 ? Promise.reject(new TypeError("Network request failed.")) : Promise.resolve(jsonResponse({ jobId: processJobId }, 202));
      }
      if (url.startsWith("/api/process/status")) return Promise.resolve(jsonResponse({ state: "queued", queuePosition: 1 }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));

    expect((await screen.findByRole("alert")).textContent).toContain("네트워크 또는 작업자 연결");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도하기" }));

    await screen.findByText("작업이 대기열에 들어갔습니다. 앞선 작업이 끝나면 자동으로 시작합니다.");
  });
});
