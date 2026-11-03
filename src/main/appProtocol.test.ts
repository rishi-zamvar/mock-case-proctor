import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { CSP } from '../shared/csp'
import { registerAppProtocol } from './appProtocol'

const setup = (): ((url: string) => Promise<Response>) => {
  const root = mkdtempSync(join(tmpdir(), 'app-proto-'))
  writeFileSync(join(root, 'index.html'), '<p>hi</p>')
  let handler!: (req: Request) => Promise<Response>
  const protocol = { handle: (_s: string, h: (req: Request) => Promise<Response>) => (handler = h) }
  // Mirrors Electron net.fetch: a missing file:// rejects instead of returning 404.
  const net = {
    fetch: async (u: string) => {
      const { readFile } = await import('node:fs/promises')
      return new Response(await readFile(new URL(u)))
    }
  }
  registerAppProtocol(protocol as never, net as never, { bundle: root })
  return (url) => handler(new Request(url))
}

describe('registerAppProtocol', () => {
  test('given an existing file, when requested, then it is served with the CSP header', async () => {
    const res = await setup()('app://bundle/index.html')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-security-policy')).toBe(CSP)
  })

  test('given a missing file inside the root, when requested, then 404 instead of a thrown error', async () => {
    const res = await setup()('app://bundle/main/index.js')
    expect(res.status).toBe(404)
  })
})
