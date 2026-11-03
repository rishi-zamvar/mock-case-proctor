export const CSP = [
  "default-src 'self' app:",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' app: data: blob:",
  "font-src 'self' app:",
  "media-src 'self' app: blob: mediastream:",
  "worker-src 'self' app: blob:",
  "connect-src 'self' app: https://huggingface.co https://*.huggingface.co https://*.hf.co",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'"
].join('; ')
