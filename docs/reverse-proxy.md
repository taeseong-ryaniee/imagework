# Reverse-proxy admission boundary

Put a TLS-terminating reverse proxy in front of the Imagework Node.js process.
The application validates its own request contract, but the proxy must reject
oversized and excessive requests before Node parses multipart data or allocates
a job.

[`deploy/nginx.conf.example`](../deploy/nginx.conf.example) is a minimal Nginx
edge example. Before enabling it, the deployment owner must supply its own TLS
certificate configuration and point the private upstream at the local Next.js
process. The repository intentionally contains neither a public hostname nor a
certificate, credential, token, or processing code.

The example enforces these required controls:

- `client_max_body_size 11m` applies only inside the submission endpoint's
  `location = /api/process` block, leaving room for multipart framing while
  still rejecting requests above the application's 11 MiB multipart request
  cap and preserving the product's 10 MiB file limit. The `status`, `result`,
  and `cancel` endpoints keep the server block's smaller default limit.
- `limit_req_zone` uses the direct client IP at this edge and limits processing
  requests to six per minute per IP, with a burst of three. Cancellation has a
  separate, slightly larger burst so a legitimate user can stop work. Rejected
  requests return `429` through `limit_req_status 429`.
- `proxy_read_timeout 120s` is no longer coupled to the job's own duration:
  the async job API responds immediately on submission, status poll, and
  result fetch, so the proxy only needs to cover one HTTP round trip rather
  than the full processing window.
- HTTPS terminates at the proxy; it forwards only the scheme and client chain
  needed by the application and keeps the Node process private.

Do not deploy this unchanged behind another proxy or CDN: configure the edge's
trusted-real-IP mechanism first, otherwise a forwarded header can make the
rate key inaccurate. Keep the upstream reachable only from that edge, set
certificate directives through the host's secret manager, and review the
limits if the shared processing-code distribution changes.
