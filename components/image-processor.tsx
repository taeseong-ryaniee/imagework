"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ASSET_MODES,
  BOX_FIELDS,
  INITIAL_BOX,
  MAX_IMAGE_PIXELS,
  boxError,
  fileError,
  formatBytes,
  readDimensions,
} from "./image-processor-helpers";
import type { AssetMode, BoxField, BoxValues, SelectedImage } from "./image-processor-helpers";
import { OUTPUT_FORMATS, resultMetadataFor } from "@/lib/output-format";
import type { OutputFormat } from "@/lib/output-format";

const MODE_COPY: Readonly<Record<AssetMode, string>> = { logo: "로고", icon: "아이콘", photo: "사진" };
const BOX_LABELS: Readonly<Record<BoxField, string>> = { cx: "중심 X", cy: "중심 Y", width: "너비", height: "높이" };
const OUTPUT_COPY: Readonly<Record<OutputFormat, string>> = { png: "PNG", svg: "SVG", zip: "ZIP" };

type JobState =
  | Readonly<{ readonly kind: "ready" }>
  | Readonly<{ readonly kind: "preparing" }>
  | Readonly<{ readonly kind: "running" }>
  | Readonly<{ readonly kind: "cancelling" }>
  | Readonly<{ readonly kind: "downloading" }>
  | Readonly<{ readonly kind: "completed" }>
  | Readonly<{ readonly kind: "failed"; readonly message: string }>;

type NormalizedPoint = Readonly<{ readonly x: number; readonly y: number }>;

class ClientJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientJobError";
  }
}

const actionLabelFor = (state: JobState): string => {
  switch (state.kind) {
    case "ready": return "결과 만들기";
    case "preparing": return "요청을 준비하고 있습니다";
    case "running": return "Colab GPU에서 처리 중입니다";
    case "cancelling": return "취소 요청을 전송하고 있습니다";
    case "downloading": return "선택한 결과를 다운로드하고 있습니다";
    case "completed": return "다시 처리하기";
    case "failed": return "다시 시도하기";
  }
};

const statusCopyFor = (state: JobState): string => {
  switch (state.kind) {
    case "ready": return "파일, 이미지 유형, 대상 영역, 작업 코드를 준비하면 서버 작업을 시작할 수 있습니다.";
    case "preparing": return "이미지와 설정을 안전하게 전송할 요청을 준비하고 있습니다.";
    case "running": return "전용 Colab GPU 작업자가 이미지를 처리하고 있습니다. 이 창을 닫지 마세요.";
    case "cancelling": return "취소 요청을 전송했고, 현재 요청이 끝날 때까지 기다리고 있습니다. 원격 GPU가 중단됐다고 단정하지 않습니다.";
    case "downloading": return "검증된 선택 결과를 브라우저로 다운로드하고 있습니다.";
    case "completed": return "선택한 결과의 다운로드를 시작했습니다. 다시 처리하려면 같은 설정으로 요청할 수 있습니다.";
    case "failed": return state.message;
  }
};

const errorMessageFrom = (responseText: string): string => {
  try {
    const payload: unknown = JSON.parse(responseText);
    if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") return payload.error;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return "작업을 시작하지 못했습니다. 설정을 확인한 뒤 다시 시도해 주세요.";
};

const downloadResult = async (response: Response, outputFormat: OutputFormat): Promise<void> => {
  const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
  const disposition = response.headers.get("Content-Disposition")?.toLowerCase() ?? "";
  const expected = resultMetadataFor(outputFormat);
  if (!contentType.includes(expected.contentType) || !disposition.includes(expected.name)) throw new ClientJobError("서버가 선택한 형식의 결과를 반환하지 않았습니다. 다시 시도해 주세요.");
  const file = await response.blob();
  if (file.size === 0) throw new ClientJobError("빈 결과 파일을 받았습니다. 다시 시도해 주세요.");
  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = expected.name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
};

const isAborted = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";

const cancellationMessage = (cancelEndpointUnconfirmed: boolean): string => cancelEndpointUnconfirmed
  ? "브라우저 요청을 중단했습니다. 취소 요청 확인을 받지 못했으므로 원격 GPU 정리 상태는 보장할 수 없습니다. 다시 시도할 수 있습니다."
  : "브라우저 요청을 중단했습니다. 원격 GPU 작업의 정리 여부를 확인할 수 없습니다. 다시 시도할 수 있습니다.";

const clamp = (value: number): number => Math.min(1, Math.max(0, value));
const normalizedPointFor = (event: React.PointerEvent<HTMLDivElement>): NormalizedPoint | undefined => {
  const bounds = event.currentTarget.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return undefined;
  return { x: clamp((event.clientX - bounds.left) / bounds.width), y: clamp((event.clientY - bounds.top) / bounds.height) };
};
const coordinate = (value: number): string => String(Number(value.toFixed(4)));
const boxForDrag = (origin: NormalizedPoint, current: NormalizedPoint): BoxValues => {
  const left = Math.min(origin.x, current.x);
  const top = Math.min(origin.y, current.y);
  const width = Math.abs(current.x - origin.x);
  const height = Math.abs(current.y - origin.y);
  return { cx: coordinate(left + width / 2), cy: coordinate(top + height / 2), width: coordinate(width), height: coordinate(height) };
};
const previewStyleFor = (box: BoxValues): Readonly<{ readonly height: string; readonly left: string; readonly top: string; readonly width: string }> => {
  const cx = Number(box.cx);
  const cy = Number(box.cy);
  const width = Number(box.width);
  const height = Number(box.height);
  if (![cx, cy, width, height].every(Number.isFinite)) return { height: "100%", left: "0%", top: "0%", width: "100%" };
  return { height: `${clamp(height) * 100}%`, left: `${clamp(cx - width / 2) * 100}%`, top: `${clamp(cy - height / 2) * 100}%`, width: `${clamp(width) * 100}%` };
};

export function ImageProcessor() {
  const [selectedImage, setSelectedImage] = useState<SelectedImage>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [imageError, setImageError] = useState<string>();
  const [assetMode, setAssetMode] = useState<AssetMode>();
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("zip");
  const [box, setBox] = useState<BoxValues>(INITIAL_BOX);
  const [processingCode, setProcessingCode] = useState("");
  const [modeTouched, setModeTouched] = useState(false);
  const [boxTouched, setBoxTouched] = useState(false);
  const [codeTouched, setCodeTouched] = useState(false);
  const [jobState, setJobState] = useState<JobState>({ kind: "ready" });
  const selectionVersion = useRef(0);
  const controller = useRef<AbortController | undefined>(undefined);
  const activeJobId = useRef<string | undefined>(undefined);
  const cancellationRequested = useRef(false);
  const cancelEndpointUnconfirmed = useRef(false);
  const dragState = useRef<Map<number, Readonly<{ readonly origin: NormalizedPoint; readonly startBox: BoxValues }>>>(new Map());
  const currentBoxError = boxError(box);
  const isBusy = jobState.kind === "preparing" || jobState.kind === "running" || jobState.kind === "cancelling" || jobState.kind === "downloading";

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function handleFileChange(file: File | undefined): Promise<void> {
    const version = selectionVersion.current + 1;
    selectionVersion.current = version;
    setSelectedImage(undefined);
    setPreviewUrl(undefined);
    if (!file) {
      setImageError(undefined);
      return;
    }
    const validationError = fileError(file);
    if (validationError) {
      setImageError(validationError);
      return;
    }
    setImageError("이미지의 픽셀 크기를 확인하고 있습니다.");
    try {
      const dimensions = await readDimensions(file);
      if (selectionVersion.current !== version) return;
      if (dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
        setImageError("이미지는 2,000만 픽셀 이하여야 합니다.");
        return;
      }
      setSelectedImage({ file, name: file.name, size: file.size, ...dimensions });
      setPreviewUrl(URL.createObjectURL(file));
      setImageError(undefined);
    } catch (error) {
      if (selectionVersion.current !== version) return;
      setImageError(error instanceof Error ? error.message : "이미지 픽셀 크기를 읽을 수 없습니다.");
    }
  }

  function updateBoxFromPointer(event: React.PointerEvent<HTMLDivElement>): void {
    const entry = dragState.current.get(event.pointerId);
    const point = normalizedPointFor(event);
    if (!entry || !point) return;
    setBox(boxForDrag(entry.origin, point));
    setBoxTouched(true);
  }

  function handleCropPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    const point = normalizedPointFor(event);
    if (!point) return;
    dragState.current.set(event.pointerId, { origin: point, startBox: box });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setBox(boxForDrag(point, point));
    setBoxTouched(true);
  }

  function clearCropDrag(event: React.PointerEvent<HTMLDivElement>): void {
    dragState.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleCropPointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    updateBoxFromPointer(event);
    clearCropDrag(event);
  }

  function handleCropPointerCancel(event: React.PointerEvent<HTMLDivElement>): void {
    const entry = dragState.current.get(event.pointerId);
    if (entry) setBox(entry.startBox);
    clearCropDrag(event);
  }

  function validateRequest(): boolean {
    if (!selectedImage || imageError) {
      setImageError(imageError ?? "처리할 이미지 파일을 선택해 주세요.");
      return false;
    }
    if (!assetMode) {
      setModeTouched(true);
      return false;
    }
    if (currentBoxError) {
      setBoxTouched(true);
      return false;
    }
    if (processingCode.trim() === "") {
      setCodeTouched(true);
      return false;
    }
    return true;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isBusy || !validateRequest() || !selectedImage || !assetMode) return;
    const requestController = new AbortController();
    const jobId = globalThis.crypto.randomUUID();
    controller.current = requestController;
    activeJobId.current = jobId;
    cancellationRequested.current = false;
    cancelEndpointUnconfirmed.current = false;
    setJobState({ kind: "preparing" });
    const formData = new FormData();
    formData.append("file", selectedImage.file);
    formData.append("mode", assetMode);
    formData.append("outputFormat", outputFormat);
    BOX_FIELDS.forEach((field) => formData.append(field, box[field]));
    formData.append("jobId", jobId);
    formData.append("processingCode", processingCode);
    try {
      const responseRequest = fetch("/api/process", {
        body: formData,
        headers: { "x-imagework-processing-code": processingCode },
        method: "POST",
        signal: requestController.signal,
      });
      setJobState({ kind: "running" });
      const response = await responseRequest;
      if (cancellationRequested.current) {
        setJobState({ kind: "failed", message: cancellationMessage(cancelEndpointUnconfirmed.current) });
        return;
      }
      if (!response.ok) {
        setJobState({ kind: "failed", message: errorMessageFrom(await response.text()) });
        return;
      }
      setJobState({ kind: "downloading" });
      await downloadResult(response, outputFormat);
      setJobState({ kind: "completed" });
    } catch (error) {
      if (isAborted(error)) {
        setJobState({ kind: "failed", message: cancellationMessage(cancelEndpointUnconfirmed.current) });
      } else if (error instanceof ClientJobError) {
        setJobState({ kind: "failed", message: error.message });
      } else {
        setJobState({ kind: "failed", message: "네트워크 또는 작업자 연결에 문제가 생겼습니다. 잠시 후 다시 시도해 주세요." });
      }
    } finally {
      if (activeJobId.current === jobId) {
        controller.current = undefined;
        activeJobId.current = undefined;
        cancellationRequested.current = false;
        cancelEndpointUnconfirmed.current = false;
      }
    }
  }

  async function handleCancel(): Promise<void> {
    const jobId = activeJobId.current;
    const requestController = controller.current;
    if (!jobId || !requestController || jobState.kind === "cancelling") return;
    cancellationRequested.current = true;
    setJobState({ kind: "cancelling" });
    try {
      const response = await fetch("/api/process/cancel", {
        body: JSON.stringify({ jobId, processingCode }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      cancelEndpointUnconfirmed.current = !response.ok;
    } catch (error) {
      cancelEndpointUnconfirmed.current = true;
      if (error instanceof DOMException || error instanceof TypeError) return;
    } finally {
      requestController.abort();
    }
  }

  return (
    <form aria-describedby="privacy-note" className="helper-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
      <aside className="boundary-note" id="privacy-note"><span className="notice-mark" aria-hidden="true">01</span><div><strong>서버 작업으로 결과를 만듭니다.</strong><p>선택한 파일과 설정은 결과를 만드는 동안에만 서버 작업자로 전송되고, 작업이 끝나면 정리됩니다. Hugging Face 토큰은 이 브라우저에 입력하거나 저장하지 않습니다.</p></div></aside>

      <section className="form-section" aria-labelledby="file-label">
        <div className="field-heading"><div><p className="section-kicker">FILE</p><h2 id="file-label">처리할 이미지</h2></div><span className="quiet-badge">로컬 측정</span></div>
        <label className="file-control" htmlFor="image-file"><span>파일 선택</span><span className="file-control-hint">PNG, JPG, BMP, WebP, GIF</span><input aria-describedby="file-help file-status" aria-labelledby="file-label" disabled={isBusy} id="image-file" name="file" type="file" accept="image/png,image/jpeg,image/bmp,image/webp,image/gif" onChange={(event) => void handleFileChange(event.currentTarget.files?.[0])} /></label>
        <p className="field-help" id="file-help">최대 10 MiB · 최대 2,000만 픽셀 · GIF는 첫 프레임만 사용합니다. 픽셀은 브라우저에서 자동 측정됩니다.</p>
        <p aria-live="polite" className={imageError ? "field-status is-error" : "sr-only"} id="file-status">{imageError}</p>
        {selectedImage && <dl className="file-metadata" aria-label="선택한 파일 정보"><div><dt>파일</dt><dd>{selectedImage.name}</dd></div><div><dt>용량</dt><dd>{formatBytes(selectedImage.size)}</dd></div><div><dt>픽셀 크기</dt><dd>{selectedImage.width} × {selectedImage.height}px</dd></div></dl>}
      </section>

      <fieldset className="form-section" disabled={isBusy} aria-describedby={modeTouched && !assetMode ? "mode-status" : undefined}>
        <div className="field-heading"><div><p className="section-kicker">TYPE</p><legend>이미지 유형</legend></div><span className="quiet-badge">SVG 조건</span></div>
        <p className="field-help">로고와 아이콘은 투명 PNG와 색상 SVG를 함께 만듭니다. 사진은 PNG만 만듭니다.</p>
        <div className="mode-list" onBlur={() => setModeTouched(true)}>{ASSET_MODES.map((mode) => <label className="mode-option" key={mode}><input aria-label={MODE_COPY[mode]} checked={assetMode === mode} name="mode" type="radio" value={mode} onChange={() => { setAssetMode(mode); if (mode === "photo" && outputFormat === "svg") setOutputFormat("png"); }} /><span>{MODE_COPY[mode]}</span><small>{mode === "photo" ? "PNG" : "PNG + SVG"}</small></label>)}</div>
        {modeTouched && !assetMode && <p className="field-status is-error" id="mode-status" role="alert">이미지 유형을 선택해 주세요.</p>}
      </fieldset>

      <fieldset className="form-section" disabled={isBusy}>
        <div className="field-heading"><div><p className="section-kicker">DOWNLOAD</p><legend>다운로드 형식</legend></div><span className="quiet-badge">투명 배경</span></div>
        <p className="field-help">PNG는 투명 이미지, SVG는 로고·아이콘 전용 벡터 파일, ZIP은 해당 작업의 모든 결과를 포함합니다.</p>
        <div className="mode-list">{OUTPUT_FORMATS.map((format) => {
          const unavailable = format === "svg" && assetMode === "photo";
          const hintId = `output-format-${format}-hint`;
          return <label className="mode-option" key={format}><input aria-describedby={hintId} aria-label={OUTPUT_COPY[format]} checked={outputFormat === format} disabled={unavailable} name="output-format" type="radio" value={format} onChange={() => setOutputFormat(format)} /><span>{OUTPUT_COPY[format]}</span><small id={hintId}>{unavailable ? "로고·아이콘 전용" : format === "zip" ? "모든 결과" : "단일 파일"}</small></label>;
        })}</div>
      </fieldset>

      <fieldset className="form-section" disabled={isBusy} aria-describedby="box-help box-status">
        <div className="field-heading"><div><p className="section-kicker">AREA</p><legend>대상 영역</legend></div><span className="quiet-badge">0–1 정규화</span></div>
        <p className="field-help" id="box-help">이미지 위를 드래그해 대상 영역을 지정하거나, 아래 값을 직접 입력해 정밀 조정합니다. 값은 0–1 범위입니다.</p>
        {selectedImage && previewUrl && <div className="cropper-wrap"><div aria-describedby="box-help" aria-label="이미지에서 대상 영역 지정" className="cropper" role="group" style={{ aspectRatio: `${selectedImage.width} / ${selectedImage.height}` }} onLostPointerCapture={handleCropPointerCancel} onPointerCancel={handleCropPointerCancel} onPointerDown={handleCropPointerDown} onPointerMove={updateBoxFromPointer} onPointerUp={handleCropPointerUp}><Image alt="" draggable={false} fill sizes="(max-width: 680px) 100vw, 600px" src={previewUrl} unoptimized /><div aria-hidden="true" className="cropper-selection" style={previewStyleFor(box)} /></div><p className="cropper-help">이미지 안에서 드래그해 영역을 다시 지정할 수 있습니다. 키보드나 정밀 조정에는 아래 숫자 입력을 사용하세요.</p></div>}
        <div className="box-grid">{BOX_FIELDS.map((field) => <label className="number-field" key={field}><span>{BOX_LABELS[field]}</span><input aria-invalid={boxTouched && Boolean(currentBoxError)} inputMode="decimal" max="1" min="0" name={field} step="0.01" type="number" value={box[field]} onBlur={() => setBoxTouched(true)} onChange={(event) => { const value = event.currentTarget.value; setBoxTouched(true); setBox((current) => ({ ...current, [field]: value })); }} /></label>)}</div>
        {boxTouched && currentBoxError && <p className="field-status is-error" id="box-status" role="alert">{currentBoxError}</p>}
      </fieldset>

      <section className="form-section" aria-labelledby="code-label">
        <div className="field-heading"><div><p className="section-kicker">ACCESS</p><h2 id="code-label">작업 코드</h2></div><span className="quiet-badge">저장 안 함</span></div>
        <p className="field-help" id="code-help">관리자가 공유한 작업 코드만 입력하세요. 토큰이 아니며, 브라우저 저장소에 남기지 않습니다.</p>
        <input aria-describedby="code-help code-status" aria-invalid={codeTouched && processingCode.trim() === ""} aria-labelledby="code-label" autoComplete="off" className="code-field" disabled={isBusy} id="processing-code" name="processing-code" type="text" value={processingCode} onBlur={() => setCodeTouched(true)} onChange={(event) => { setCodeTouched(true); setProcessingCode(event.currentTarget.value); }} />
        {codeTouched && processingCode.trim() === "" && <p className="field-status is-error" id="code-status" role="alert">작업 코드를 입력해 주세요.</p>}
      </section>

      <aside className="output-note"><div><span className="output-eyebrow">OUTPUT</span><strong>원하는 투명 결과 형식을 선택합니다.</strong></div><p><code>result.png</code>은 투명 PNG입니다. <code>result.svg</code>는 로고·아이콘에만 제공되며, ZIP은 해당 작업의 모든 결과를 포함합니다. JPEG 출력은 제공하지 않습니다.</p></aside>

      <div className="launch-area"><p aria-live="polite" className={jobState.kind === "failed" ? "launch-hint is-error" : "launch-hint"} id="launch-hint" role={jobState.kind === "failed" ? "alert" : "status"}>{statusCopyFor(jobState)}</p><button aria-describedby="launch-hint" className="launch-button" disabled={isBusy} type="submit">{actionLabelFor(jobState)}</button>{isBusy && <button className="cancel-button" disabled={jobState.kind === "cancelling"} type="button" onClick={() => void handleCancel()}>{jobState.kind === "cancelling" ? "취소 요청 중" : "작업 취소"}</button>}</div>
    </form>
  );
}
