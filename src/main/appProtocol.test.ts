import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, test, vi } from 'vitest'
import { CSP } from '../shared/csp'
import { registerAppProtocol } from './appProtocol'

type Get = ((url: string) => Promise<Response>) & { fetch: ReturnType<typeof vi.fn> }

const setup = (casePdf?: (id: string) => string | null, withCasePdf = false): Get => {
  const root = mkdtempSync(join(tmpdir(), 'app-proto-'))
  writeFileSync(join(root, 'index.html'), '<p>hi</p>')
  writeFileSync(join(root, 'w.mjs'), 'export {}')
  writeFileSync(join(root, 'm.wasm'), new Uint8Array([0, 97, 115, 109]))
  const assets = mkdtempSync(join(tmpdir(), 'app-assets-'))
  mkdirSync(join(assets, 'models'))
  writeFileSync(join(assets, 'models', 'a.bin'), new Uint8Array(1234))
  let handler!: (req: Request) => Promise<Response>
  const protocol = { handle: (_s: string, h: (req: Request) => Promise<Response>) => (handler = h) }
  // Mirrors Electron net.fetch: a missing file:// rejects instead of returning 404.
  const fetch = vi.fn(async (u: string) => {
    if (u.startsWith('file:///lib/')) return new Response('%PDF')
    const { readFile } = await import('node:fs/promises')
    return new Response(await readFile(new URL(u)))
  })
  if (withCasePdf || casePdf)
    registerAppProtocol(protocol as never, { fetch } as never, { bundle: root, assets }, casePdf)
  else registerAppProtocol(protocol as never, { fetch } as never, { bundle: root, assets })
  return Object.assign((url: string) => handler(new Request(url)), { fetch })
}

const PDF = '/lib/case_02_x/case_02_x_interviewee_package.pdf'

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

  test('given a casePdf resolver, when a valid case pdf is requested, then the interviewee file is served with CSP', async () => {
    const get = setup((id) => (id === '02' ? PDF : null))
    const res = await get('app://bundle/cases/02/interviewee.pdf')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-security-policy')).toBe(CSP)
    expect(get.fetch).toHaveBeenCalledWith(pathToFileURL(PDF).toString())
  })

  test.each([
    'app://bundle/cases/02/interviewer.pdf',
    'app://bundle/cases/02/%2e%2e/interviewee.pdf',
    'app://bundle/cases/2/interviewee.pdf'
  ])('given a denied case url %s, when requested, then 404 without fetching', async (url) => {
    const get = setup(() => PDF)
    expect((await get(url)).status).toBe(404)
    expect(get.fetch).not.toHaveBeenCalled()
  })

  test('given an unknown case id, when requested, then 404 without fetching', async () => {
    const get = setup(() => null)
    expect((await get('app://bundle/cases/77/interviewee.pdf')).status).toBe(404)
    expect(get.fetch).not.toHaveBeenCalled()
  })

  test('given a buggy resolver returning an interviewer package, when requested, then 404 anyway', async () => {
    const get = setup(() => '/lib/case_02_x/case_02_x_interviewer_package.pdf')
    expect((await get('app://bundle/cases/02/interviewee.pdf')).status).toBe(404)
    expect(get.fetch).not.toHaveBeenCalled()
  })

  test('given no casePdf resolver, when a case pdf is requested, then 404', async () => {
    const get = setup()
    expect((await get('app://bundle/cases/02/interviewee.pdf')).status).toBe(404)
    expect(get.fetch).not.toHaveBeenCalled()
  })

  test('given an upper-case CASES path, when requested, then 404 from the bundle root', async () => {
    const get = setup(() => PDF)
    expect((await get('app://bundle/CASES/02/interviewee.pdf')).status).toBe(404)
  })

  test('given any served file, when requested, then Content-Length equals the file size', async () => {
    const res = await setup()('app://bundle/index.html')
    expect(res.headers.get('content-length')).toBe('9')
  })

  test.each([
    ['app://bundle/w.mjs', 'text/javascript'],
    ['app://bundle/m.wasm', 'application/wasm']
  ])('given %s, when served, then Content-Type is %s', async (url, type) => {
    const res = await setup()(url)
    expect(res.headers.get('content-type')).toBe(type)
  })

  test('given a file under the assets root, when /res is requested, then it is served same-origin with CSP and size', async () => {
    const res = await setup()('app://bundle/res/models/a.bin')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-security-policy')).toBe(CSP)
    expect(res.headers.get('content-length')).toBe('1234')
  })

  test('given a missing /res file, when requested, then 404', async () => {
    expect((await setup()('app://bundle/res/models/missing.bin')).status).toBe(404)
  })

  // Request normalises %2e%2e before the handler sees it; raw traversal is covered in protocol.test.ts.
  test('given a refused /res url, when requested, then 404 without fetching', async () => {
    const get = setup()
    expect((await get('app://bundle/res/a%00.bin')).status).toBe(404)
    expect(get.fetch).not.toHaveBeenCalled()
  })
})
