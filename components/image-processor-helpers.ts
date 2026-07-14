export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;
export const ASSET_MODES = ["logo", "icon", "photo"] as const;
export const BOX_FIELDS = ["cx", "cy", "width", "height"] as const;

export type AssetMode = (typeof ASSET_MODES)[number];
export type BoxField = (typeof BOX_FIELDS)[number];
export type BoxValues = Readonly<Record<BoxField, string>>;
export type SelectedImage = Readonly<{
  readonly file: File;
  readonly name: string;
  readonly size: number;
  readonly width: number;
  readonly height: number;
}>;

const allowedExtensions = new Set(["png", "jpg", "jpeg", "bmp", "webp", "gif"]);

export const INITIAL_BOX: BoxValues = { cx: "0.5", cy: "0.5", width: "1", height: "1" };

export const fileError = (file: File): string | undefined => {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedExtensions.has(extension)) return "PNG, JPG/JPEG, BMP, WebP 또는 GIF 파일만 선택할 수 있습니다. AVIF는 지원하지 않습니다.";
  if (file.size > MAX_FILE_BYTES) return "파일은 10 MiB 이하여야 합니다.";
};

export const boxError = (box: BoxValues): string | undefined => {
  const values = BOX_FIELDS.map((field) => Number(box[field]));
  if (BOX_FIELDS.some((field) => box[field].trim() === "") || values.some((value) => !Number.isFinite(value))) return "모든 좌표에 숫자를 입력해 주세요.";
  const [cx, cy, width, height] = values;
  if (cx === undefined || cy === undefined || width === undefined || height === undefined) return "영역 값을 읽을 수 없습니다.";
  if (values.some((value) => value < 0 || value > 1)) return "영역 값은 0에서 1 사이여야 합니다.";
  if (width === 0 || height === 0) return "영역 너비와 높이는 0보다 커야 합니다.";
  if (cx - width / 2 < 0 || cx + width / 2 > 1 || cy - height / 2 < 0 || cy + height / 2 > 1) return "영역이 이미지 경계를 벗어납니다. 중심 또는 크기를 조정해 주세요.";
};

export const formatBytes = (size: number): string => `${(size / 1024 / 1024).toFixed(2)} MiB`;

export const readDimensions = (file: File): Promise<Pick<SelectedImage, "width" | "height">> => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    resolve({ width: image.naturalWidth, height: image.naturalHeight });
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error("이미지 픽셀 크기를 읽을 수 없습니다."));
  };
  image.src = objectUrl;
});
