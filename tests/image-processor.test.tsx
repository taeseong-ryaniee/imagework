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
const processJobId = "9bc368f7-0f53-4ebd-80c2-1d1bdfe94c98";

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

  it("sends the validated image settings as one process FormData request", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(zipResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [path, options] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/process");
    expect(options?.headers).toEqual({ "x-imagework-processing-code": "shared-processing-code" });
    expect(options?.method).toBe("POST");
    expect(options?.body).toBeInstanceOf(FormData);
    if (!(options?.body instanceof FormData)) throw new Error("FormData request body was expected.");
    expect(options.body.get("file")).toBeInstanceOf(File);
    expect(options.body.get("mode")).toBe("logo");
    expect(options.body.get("outputFormat")).toBe("zip");
    expect(options.body.get("cx")).toBe("0.5");
    expect(options.body.get("cy")).toBe("0.5");
    expect(options.body.get("width")).toBe("1");
    expect(options.body.get("height")).toBe("1");
    expect(options.body.get("jobId")).toBe(processJobId);
    expect(options.body.get("processingCode")).toBe("shared-processing-code");
  });

  it("sends a PNG selection and downloads the single transparent PNG response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(pngResponse());
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.click(screen.getByLabelText("PNG"));
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    const options = fetchMock.mock.calls[0]?.[1];
    if (!(options?.body instanceof FormData)) throw new Error("FormData request body was expected.");
    expect(options.body.get("outputFormat")).toBe("png");
  });

  it("surfaces a recoverable error when the server response format doesn't match the selected output format", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(zipResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.click(screen.getByLabelText("PNG"));
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));

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

  it("downloads a valid ZIP response and releases its object URL", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(zipResponse());
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const createObjectUrl = vi.fn(() => "blob:imagework-result");
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ResultUrl = class extends URL {
      static createObjectURL = createObjectUrl;
      static revokeObjectURL = revokeObjectUrl;
    };
    vi.stubGlobal("URL", ResultUrl);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect(createObjectUrl).toHaveBeenCalledTimes(3);
    expect(createObjectUrl).toHaveBeenLastCalledWith(expect.any(Blob));
    expect(revokeObjectUrl).toHaveBeenLastCalledWith("blob:imagework-result");
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

  it("shows a recoverable error for an invalid processing code and lets the visitor retry", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "입력값을 다시 확인해 주세요." }), { status: 400, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(zipResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "invalid-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));

    expect((await screen.findByRole("alert")).textContent).toContain("입력값을 다시 확인해 주세요.");
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "다시 시도하기" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("recovers from an aborted server job without retaining the request", async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      if (input === "/api/process/cancel") return Promise.resolve(new Response(null, { status: 202 }));
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("The request was aborted.", "AbortError")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));
    fireEvent.click(await screen.findByRole("button", { name: "작업 취소" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/process/cancel");
    const cancelOptions = fetchMock.mock.calls[1]?.[1];
    expect(cancelOptions?.method).toBe("POST");
    expect(cancelOptions?.body).toBe(JSON.stringify({ jobId: processJobId, processingCode: "shared-processing-code" }));
    expect((await screen.findByRole("alert")).textContent).toContain("브라우저 요청을 중단했습니다");
    expect(screen.getByRole("button", { name: "다시 시도하기" })).not.toBeNull();
  });

  it("keeps cancellation pending until the original request settles", async () => {
    let resolveProcess: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn<typeof fetch>((input) => {
      if (input === "/api/process/cancel") return Promise.resolve(new Response(null, { status: 202 }));
      return new Promise<Response>((resolve) => { resolveProcess = resolve; });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));
    fireEvent.click(await screen.findByRole("button", { name: "작업 취소" }));

    expect(screen.getByRole("button", { name: "취소 요청을 전송하고 있습니다" }).hasAttribute("disabled")).toBe(true);
    if (!resolveProcess) throw new Error("Process request resolver was expected.");
    resolveProcess(zipResponse());
    expect((await screen.findByRole("alert")).textContent).toContain("브라우저 요청을 중단했습니다");
  });

  it("recovers safely when the best-effort cancel endpoint fails", async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      if (input === "/api/process/cancel") return Promise.reject(new TypeError("Cancel endpoint unavailable."));
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("The request was aborted.", "AbortError")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));
    fireEvent.click(await screen.findByRole("button", { name: "작업 취소" }));

    expect((await screen.findByRole("alert")).textContent).toContain("취소 요청 확인을 받지 못했으므로");
    expect(screen.getByRole("button", { name: "다시 시도하기" })).not.toBeNull();
  });

  it("recovers from a network error and lets the visitor retry", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Network request failed."))
      .mockResolvedValueOnce(zipResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 만들기" }));

    expect((await screen.findByRole("alert")).textContent).toContain("네트워크 또는 작업자 연결");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도하기" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
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
});
