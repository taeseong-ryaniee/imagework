# Imagework

Imagework turns one submitted raster image into a downloaded ZIP containing a
transparent PNG and, for logo or icon jobs, a colour SVG. The browser sends the
image and selected normalized target box to a single server worker. That worker
uses the official Google Colab CLI to create a temporary GPU session, runs the
reviewed shared processing code, validates the ZIP, returns it to the browser,
and removes job state.

This repository contains the application and worker implementation. It is not a
claim that a public deployment has real Google Colab or Hugging Face credentials
configured yet.

## User flow

1. Choose one PNG, JPG/JPEG, BMP, WebP, or GIF (first frame only), up to 10 MiB
   and 20 megapixels. The browser measures the selected file's pixel dimensions
   before submission.
2. Choose `logo`, `icon`, or `photo`, set a valid normalized target box, and
   enter the processing code supplied by the deployment owner.
3. Submit the job. The page shows preparation, GPU processing, download, and
   safe failure states; it also offers cancellation while a request is active.
4. The browser downloads `imagework-results.zip`. Every successful ZIP has
   `result.png`; logo and icon jobs also have `result.svg`. JPEG output is not
   offered because it cannot preserve transparency.

The server receives image bytes only for the temporary job. It does not expose
Google authentication material, the Hugging Face token, raw CLI output, remote
paths, or session metadata to the browser.

## Deployment

Deploy Imagework as a Node.js server process, not as a static export. It needs a
private writable volume for short-lived job and CLI-state directories plus a
server-only installation of the official
[`google-colab-cli`](https://github.com/googlecolab/google-colab-cli).

Follow the complete [server-worker deployment guide](docs/server-worker.md).
Put the service behind the documented [reverse-proxy admission boundary](docs/reverse-proxy.md)
so its 11 MiB multipart envelope and per-IP request limit apply before Next.js
reads multipart data; the application then enforces the 10 MiB file cap.
The checked-in [`.env.example`](.env.example) is deliberately value-free:
inject each real value through the host's secret manager. Never commit an auth
configuration, a Hugging Face token, a processing code, session state, input,
output, or ZIP archive.

`IMAGEWORK_PROCESSING_CODE` is a deployment-shared request gate, not a Hugging
Face or Google credential. Treat it as a server secret: distribute it only by a
trusted channel, rotate it if disclosed, and never place it in a `NEXT_PUBLIC_*`
variable, source file, URL, or log.

## Local development

```bash
npm install
npm run dev
```

For a local production server, first supply disposable values for every
`IMAGEWORK_*` variable in `.env.example`, install/configure the official CLI
with noninteractive ADC only, then run:

```bash
npm run build
npm start
```

Do not use a personal interactive Colab session, a browser cookie, or a
developer home directory as the worker's CLI state. The server must use a
dedicated service identity and isolated per-job configuration directories.

## Checks

```bash
npm test
npx tsc --noEmit
npm run lint
npm run check:colab-notebook
npm run check:public-artifacts
npm run build
```

Use the redacted [server-job results template](docs/colab-results.md) for a
real deployment verification. Do not commit generated evidence or secrets.
