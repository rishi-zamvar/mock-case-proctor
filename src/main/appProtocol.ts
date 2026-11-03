// app:// handler (FND-05): path-safe file serving, every response carries the CSP header.
import { pathToFileURL } from 'node:url'
import type { Net, Protocol } from 'electron'
import { CSP } from '../shared/csp'
import { resolveAppRequest, resolveCasePdfRequest } from './protocol'

export const APP_SCHEME_PRIVILEGES = {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  stream: true
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
    const file = resolveAppRequest(req.url, roots)
    return file ? serve(file) : notFound()
  })
}
