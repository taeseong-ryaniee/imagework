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
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:imagework-test"),
      revokeObjectURL: vi.fn(),
    });
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
    fireEvent.click(screen.getByRole("button", { name: "투명 ZIP 만들기" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [path, options] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/process");
    expect(options?.headers).toEqual({ "x-imagework-processing-code": "shared-processing-code" });
    expect(options?.method).toBe("POST");
    expect(options?.body).toBeInstanceOf(FormData);
    if (!(options?.body instanceof FormData)) throw new Error("FormData request body was expected.");
    expect(options.body.get("file")).toBeInstanceOf(File);
    expect(options.body.get("mode")).toBe("logo");
    expect(options.body.get("cx")).toBe("0.5");
    expect(options.body.get("cy")).toBe("0.5");
    expect(options.body.get("width")).toBe("1");
    expect(options.body.get("height")).toBe("1");
    expect(options.body.get("jobId")).toBe(processJobId);
    expect(options.body.get("processingCode")).toBe("shared-processing-code");
  });

  it("downloads a valid ZIP response and releases its object URL", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(zipResponse());
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const createObjectUrl = vi.fn(() => "blob:imagework-result");
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl });
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 코드" }), { target: { value: "shared-processing-code" } });
    fireEvent.click(screen.getByRole("button", { name: "투명 ZIP 만들기" }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    expect(createObjectUrl).toHaveBeenLastCalledWith(expect.any(Blob));
    expect(revokeObjectUrl).toHaveBeenLastCalledWith("blob:imagework-result");
  });

  it("blocks a missing processing code before any upload", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    render(<ImageProcessor />);

    await chooseValidImage();
    fireEvent.click(screen.getByRole("button", { name: "투명 ZIP 만들기" }));

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
    fireEvent.click(screen.getByRole("button", { name: "투명 ZIP 만들기" }));

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
    fireEvent.click(screen.getByRole("button", { name: "투명 ZIP 만들기" }));
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
    fireEvent.click(screen.getByRole("button", { name: "투명 ZIP 만들기" }));
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
    fireEvent.click(screen.getByRole("button", { name: "투명 ZIP 만들기" }));
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
    fireEvent.click(screen.getByRole("button", { name: "투명 ZIP 만들기" }));

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
