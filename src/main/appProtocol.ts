// app:// handler (FND-05): path-safe file serving, every response carries the CSP header.
import { pathToFileURL } from 'node:url'
import type { Net, Protocol } from 'electron'
import { CSP } from '../shared/csp'
import { resolveAppRequest } from './protocol'

export const APP_SCHEME_PRIVILEGES = {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  stream: true
}

export function registerAppProtocol(
  protocol: Pick<Protocol, 'handle'>,
  net: Pick<Net, 'fetch'>,
  roots: Record<string, string>
): void {
  protocol.handle('app', async (req) => {
    const file = resolveAppRequest(req.url, roots)
    if (!file) return new Response('Not found', { status: 404 })
    const res = await net.fetch(pathToFileURL(file).toString())
    const headers = new Headers(res.headers)
    headers.set('Content-Security-Policy', CSP)
    return new Response(res.body, { status: res.status, headers })
  })
}
