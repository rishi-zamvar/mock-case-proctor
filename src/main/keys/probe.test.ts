import { describe, it, expect } from 'vitest'
import { probeKey, PROBE_MODEL } from './probe'

const KEY = 'test-key-' + 'x'.repeat(8)
const MSG = {
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5',
  content: [{ type: 'text', text: 'p' }], stop_reason: 'max_tokens', stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 }
}

function fake(status: number, body: unknown = { type: 'error', error: { type: 'x', message: 'x' } }) {
  const calls: { url: string; body: any }[] = []
  const fetch = (async (url: any, init?: any) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }) as typeof globalThis.fetch
  return { calls, fetch }
}

const run = (f: { fetch: typeof fetch }) => probeKey(KEY, { baseURL: 'http://replay.test', fetch: f.fetch })

describe('probeKey', () => {
  it('returns valid on 200 and sends a 1-token haiku request', async () => {
    const f = fake(200, MSG)
    expect(await run(f)).toBe('valid')
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0].url.endsWith('/v1/messages')).toBe(true)
    expect(f.calls[0].body.model).toBe('claude-haiku-5-5')
    expect(PROBE_MODEL).toBe('claude-haiku-5-5')
    expect(f.calls[0].body.max_tokens).toBe(1)
  })
  it('returns invalid on 401 and 403', async () => {
    expect(await run(fake(401, { type: 'error', error: { type: 'authentication_error', message: 'x' } }))).toBe('invalid')
    expect(await run(fake(403))).toBe('invalid')
  })
  it('returns valid on 429 (auth passed)', async () => {
    expect(await run(fake(429))).toBe('valid')
  })
  it('returns unverified on 500, 529 and 400', async () => {
    expect(await run(fake(500))).toBe('unverified')
    expect(await run(fake(529))).toBe('unverified')
    expect(await run(fake(400))).toBe('unverified')
  })
  it('returns unverified on network failure without retrying', async () => {
    let n = 0
    const fetch = (async () => { n++; throw new TypeError('fetch failed') }) as typeof globalThis.fetch
    expect(await probeKey(KEY, { baseURL: 'http://replay.test', fetch })).toBe('unverified')
    expect(n).toBe(1)
  })
})
