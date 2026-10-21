# Imagework

Imagework turns one submitted raster image into a transparent PNG, a colour SVG,
or a ZIP containing all available results. SVG is available only for logo and
icon jobs. The browser sends the image, selected normalized target box, and
download choice to a single server worker. That worker runs on the deployment
host's own GPU, queues the job, validates the result archive, then makes only
the selected file available for download before deleting job state.

This repository contains the application and worker implementation. It is not a
claim that a public deployment has a real GPU host or Hugging Face credentials
configured yet.

## User flow

1. Choose one PNG, JPG/JPEG, BMP, WebP, or GIF (first frame only), up to 10 MiB
   and 20 megapixels. The browser measures the selected file's pixel dimensions
   before submission.
2. Choose `logo`, `icon`, or `photo`, then drag a target rectangle on the local
   proportional image preview. The normalized numeric fields remain available
   for keyboard access and precise adjustment, and stay synchronized with the
   dragged rectangle. Enter the processing code supplied by the deployment
   owner.
3. Submit the job. The page shows preparation, GPU processing, download, and
   safe failure states; it also offers cancellation while a request is active.
4. Choose `PNG`, `SVG`, or `ZIP` before submitting. PNG is a single transparent
   image. SVG is available only for logo and icon jobs. ZIP contains every
   output available for the selected mode: `result.png` for every job and
   `result.svg` for logo/icon jobs. JPEG and AVIF output are not offered because
   they cannot preserve the transparent-result contract.

The server receives image bytes only for the temporary job. It does not expose
the Hugging Face token, raw worker output, or local file paths to the browser.

## Deployment

Deploy Imagework as a Node.js server process, not as a static export. It needs
a dedicated GPU host with a private writable volume for the Python worker's
virtual environment, shared model cache, and short-lived per-job temporary
directories.

Follow the complete [server-worker deployment guide](docs/server-worker.md).
Put the service behind the documented [reverse-proxy admission boundary](docs/reverse-proxy.md)
so its 11 MiB multipart envelope and per-IP request limit apply before Next.js
reads multipart data; the application then enforces the 10 MiB file cap.
The checked-in [`.env.example`](.env.example) provides bilingual, field-by-field
instructions while keeping every assignment blank for public-repository safety.
Inject real values through the host's secret manager.
Never commit an auth configuration, a Hugging Face token, a processing code,
job state, input, output, or ZIP archive.

`IMAGEWORK_PROCESSING_CODE` is a deployment-shared request gate, not a Hugging
Face or Google credential. Treat it as a server secret: distribute it only by a
trusted channel, rotate it if disclosed, and never place it in a `NEXT_PUBLIC_*`
variable, source file, URL, or log.

## Local development

```bash
npm install
npm run dev
```

For a local production server, copy `.env.example` to a Git-ignored server-only
`.env`, fill every blank deployment value using its bilingual comment, run
`scripts/provision-worker.sh` once to build the venv, VTracer binary, and
model cache, then run:

```bash
npm run build
npm start
```

Do not use a developer home directory as the worker's Python environment or
model cache. The server must use a dedicated service identity and isolated
per-job temporary directories.

## Checks

```bash
npm test
npx tsc --noEmit
npm run lint
npm run check:public-artifacts
npm run build
```

Record real deployment verification evidence separately; do not commit
generated evidence or secrets to the repository.

## 한국어 사용 및 배포 안내

### 웹 앱 사용법

1. PNG, JPG/JPEG, BMP, WebP, GIF 중 이미지 한 장을 선택합니다. GIF는 첫 프레임만
   사용합니다. 업로드 전에 브라우저가 실제 픽셀 크기를 자동 측정하며, 파일은 10 MiB
   이하 및 2,000만 픽셀 이하여야 합니다.
2. `로고`, `아이콘`, `사진` 중 이미지 유형을 고르고, 이미지 미리보기 위를
   드래그해 대상 영역을 지정합니다. 아래의 중심/너비/높이 숫자 필드는 키보드
   접근성과 정밀 조정용으로 유지되며 드래그 결과와 즉시 동기화됩니다. 픽셀 크기는
   자동 측정하지만 대상 객체 자체를 자동으로 선택하지는 않습니다.
3. 운영자가 전달한 작업 코드를 입력합니다. 이는 웹 앱 접근 제어용 값이며 Google
   또는 Hugging Face 자격 증명이 아닙니다.
4. 다운로드 형식을 선택합니다.
   - `PNG`: 투명 배경 단일 `result.png`
   - `SVG`: 로고/아이콘 전용 단일 `result.svg`
   - `ZIP`: 해당 작업에서 생성된 모든 결과. 항상 `result.png`를 포함하며 로고와
     아이콘에는 `result.svg`도 포함
5. 결과 만들기를 누르고 준비·GPU 처리·다운로드 상태를 확인합니다. 작업 중에는
   취소할 수 있습니다. 성공하면 선택한 형식의 파일이 자동 다운로드됩니다.

웹 브라우저에는 Hugging Face 토큰, 워커 실행 로그, 로컬 파일 경로가 노출되지
않습니다. 업로드한 파일은 임시 서버 작업에만 사용됩니다.

### 서버 배포 순서

1. Node.js 서버로 배포합니다. 정적 호스팅은 `/api/process`가 GPU 워커를 실행할 수
   없으므로 지원하지 않습니다.
2. 전용 비대화형 운영체제 서비스 계정을 만들고, `scripts/provision-worker.sh`를
   그 계정으로 1회 실행해 Python 3.12 venv, VTracer 바이너리, SAM3 모델 캐시를
   준비합니다.
3. 프로비저닝 스크립트의 0단계가 `nvidia-smi`로 드라이버·CUDA 버전을 확인하고
   `pip install --require-hashes`로 설치 가능성을 재검증합니다. 실패하면
   스크립트가 즉시 중단됩니다.
4. [`.env.example`](.env.example)의 한영 주석을 따라 모든 환경 변수의 빈 값을
   채웁니다. Hugging Face 토큰은 프로비저닝 스크립트 실행 시에만 환경 변수로
   주입하고 런타임 `.env`에는 넣지 않습니다. 처리 코드는 Secret Manager에서
   주입하세요.
5. `IMAGEWORK_MODEL_CACHE`, `IMAGEWORK_JOB_TMP_ROOT` 디렉터리를 만들고 서비스
   계정만 읽고 쓸 수 있게 제한합니다. 낮은 트래픽의 단일 워커라면
   `IMAGEWORK_MAX_QUEUE_DEPTH=1`이 적합합니다.
6. 문서의 Nginx 설정 또는 동일한 신뢰 경계를 적용합니다. 프록시는 제출
   엔드포인트에서만 11 MiB multipart 요청을 허용하고 IP별 속도 제한을 적용해야
   하며, 비동기 잡 API 덕분에 읽기 타임아웃은 120초처럼 짧게 유지해도 됩니다.
7. 아래 검사를 실행한 뒤, 일회용 이미지·작업 코드로 PNG, SVG, ZIP 다운로드를
   각각 확인합니다. 실패 및 취소 작업도 로컬 작업 파일을 보관 기간 이후까지
   남기지 않는지 점검합니다.

```bash
npm test
npx tsc --noEmit
npm run lint
npm run check:public-artifacts
npm run build
```

세부적인 디렉터리 권한, 정리 절차, 오류 응답, Nginx 설정은
[서버 워커 배포 가이드](docs/server-worker.md)와
[리버스 프록시 가이드](docs/reverse-proxy.md)를 따르세요. 실제 배포 검증 기록은
별도로 남기고 비밀값과 사용자 파일은 모두 가립니다.
