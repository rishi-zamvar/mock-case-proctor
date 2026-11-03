// app:// handler (FND-05): path-safe file serving, every response carries the CSP header.
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Net, Protocol } from 'electron'
import { CSP } from '../shared/csp'
import { resolveAppRequest, resolveCasePdfRequest, resolveResRequest } from './protocol'

export const APP_SCHEME_PRIVILEGES = {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  stream: true
}

// Module workers need a JS MIME; file:// gives no reliable type for .mjs.
const MIME: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm'
}

export function registerAppProtocol(
  protocol: Pick<Protocol, 'handle'>,
  net: Pick<Net, 'fetch'>,
  roots: Record<string, string>,
  casePdf?: (id: string) => string | null
): void {
  const notFound = (): Response => new Response('Not found', { status: 404 })
  const serve = async (file: string): Promise<Response> => {
    // net.fetch rejects on a missing file; that is a 404, not a handler crash.
    const res = await net.fetch(pathToFileURL(file).toString()).catch(() => null)
    if (!res) return notFound()
    const headers = new Headers(res.headers)
    headers.set('Content-Security-Policy', CSP)
    // Without Content-Length transformers.js re-copies its buffer per chunk (model load 133 s vs 1.3 s).
    const size = await stat(file).then(
      (s) => s.size,
      () => null
    )
    if (size !== null) headers.set('Content-Length', String(size))
    const type = MIME[extname(file).toLowerCase()]
    if (type) headers.set('Content-Type', type)
    return new Response(res.body, { status: res.status, headers })
  }
  protocol.handle('app', async (req) => {
    const c = resolveCasePdfRequest(req.url)
    if (c === 'deny') return notFound()
    if (c !== null) {
      const file = casePdf?.(c)
      // Defence in depth (BAR-02): never serve an interviewer package, even from a buggy resolver.
      if (!file || file.endsWith('_interviewer_package.pdf')) return notFound()
      return serve(file)
    }
    const r = roots.assets ? resolveResRequest(req.url, roots.assets) : null
    if (r === 'deny') return notFound()
    if (r) return serve(r)
    const file = resolveAppRequest(req.url, roots)
    return file ? serve(file) : notFound()
  })
}
