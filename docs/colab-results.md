# Server-job verification results (redacted template)

Use one copy of this template for each controlled deployment verification. It
records only pass/fail and redacted timings; do not include user images, ZIP
files, Google Colab CLI transcripts, session IDs, paths, or secret values.

## Environment

| Field | Value |
| --- | --- |
| UTC time | |
| Deployment revision | |
| Worker host class | |
| Official CLI version | |
| Auth mode (`adc` only) | |
| Configured accelerator | |
| SAM commit | |
| VTracer version | |

## Timings

| Stage | Duration |
| --- | --- |
| Queue/provisioning | |
| Input upload | |
| Processing | |
| ZIP validation/download | |
| Cleanup | |
| Total | |

## Results

| Scenario | Pass/Fail/Not run | Redacted observation |
| --- | --- | --- |
| Valid PNG, SVG, and ZIP selections return the matching attachment | | |
| Logo SVG included | | |
| Photo SVG excluded | | |
| Transparent `result.png` in ZIP | | |
| Invalid image bytes rejected | | |
| Invalid processing code rejected | | |
| CLI failure maps to safe failure | | |
| Browser cancellation maps to safe failure | | |
| Successful job removes local/remote state | | |
| Failed job removes local/remote state | | |

## Redaction rules

Never record credentials, processing codes, uploaded input names, filesystem
locations, remote paths, image contents/base64, ZIP contents, command lines,
or raw CLI output. Do not attach a source image, archive, config, log, or
secret-manager export to this document.
