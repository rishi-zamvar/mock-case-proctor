import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { createServer, type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { startReplayServer, type ReplayServer } from './server'

const MESSAGE = (id: string): string =>
  JSON.stringify({
    id,
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: 'p' }],
    stop_reason: 'max_tokens',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 }
  })

const PING = {
  model: 'claude-haiku-5-5',
  max_tokens: 1,
  messages: [{ role: 'user' as const, content: 'ping' }]
}

let KEY: string
let fixturesDir: string
let logDir: string
let server: ReplayServer | undefined

const writeFixture = async (scenario: string, n: number, fx: object): Promise<void> => {
  await mkdir(join(fixturesDir, scenario), { recursive: true })
  await writeFile(join(fixturesDir, scenario, `${n}.res.json`), JSON.stringify(fx))
}

const client = (url: string, key: string): Anthropic =>
  new Anthropic({ apiKey: KEY, baseURL: `${url}/s/${key}`, maxRetries: 0 })

beforeEach(async () => {
  KEY = 'test-key-' + randomUUID()
  fixturesDir = await mkdtemp(join(tmpdir(), 'fx-'))
  logDir = await mkdtemp(join(tmpdir(), 'log-'))
  await writeFixture('probe-ok', 0, {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: MESSAGE('msg_fixture')
  })
})

afterEach(async () => {
  await server?.close()
  server = undefined
})

describe('replay server', () => {
  test('given a probe-ok fixture, when the SDK calls messages.create, then it gets the fixture message', async () => {
    server = await startReplayServer({ fixturesDir, logDir })
    const msg = await client(server.url, 'probe-ok~a').messages.create(PING)
    expect(msg.id).toBe('msg_fixture')
  })

  test('given a replayed request, when logged, then the req log has path + body and no key or auth headers', async () => {
    server = await startReplayServer({ fixturesDir, logDir })
    await client(server.url, 'probe-ok~a').messages.create(PING)
    const raw = await readFile(join(logDir, 'probe-ok~a', '0.req.json'), 'utf8')
    const log = JSON.parse(raw)
    expect(log.path).toBe('/v1/messages')
    expect(log.body.max_tokens).toBe(1)
    expect(raw).not.toContain(KEY)
    expect(raw.toLowerCase()).not.toContain('authorization')
    expect(raw).not.toContain('x-api-key')
  })

  test('given a second call on the same key, when 1.res.json is missing, then 599; a fresh launch key starts at 0', async () => {
    server = await startReplayServer({ fixturesDir, logDir })
    const a = client(server.url, 'probe-ok~a')
    await a.messages.create(PING)
    const err = await a.messages.create(PING).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Anthropic.APIError)
    expect((err as InstanceType<typeof Anthropic.APIError>).status).toBe(599)
    const msg = await client(server.url, 'probe-ok~b').messages.create(PING)
    expect(msg.id).toBe('msg_fixture')
  })

  test('given a 401 fixture, when the SDK calls, then it throws AuthenticationError', async () => {
    await writeFixture('probe-401', 0, {
      status: 401,
      headers: { 'content-type': 'application/json' },
      body: '{"type":"error","error":{"type":"authentication_error","message":"x"}}'
    })
    server = await startReplayServer({ fixturesDir, logDir })
    const err = await client(server.url, 'probe-401')
      .messages.create(PING)
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Anthropic.AuthenticationError)
  })

  test('given an SSE fixture, when fetched, then the body is byte-identical with event-stream content type', async () => {
    const sse =
      'event: ping\ndata: {"type":"ping"}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'
    await writeFixture('sse', 0, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: sse
    })
    server = await startReplayServer({ fixturesDir, logDir })
    const res = await fetch(`${server.url}/s/sse/v1/messages`, { method: 'POST', body: '{}' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(await res.text()).toBe(sse)
  })

  test('given requests seen, when GET /__log with canary, then sawCanary reflects the key and never echoes it', async () => {
    server = await startReplayServer({ fixturesDir, logDir })
    await client(server.url, 'probe-ok~a').messages.create(PING)
    const hit = await fetch(`${server.url}/__log/probe-ok~a?canary=${encodeURIComponent(KEY)}`)
    const hitText = await hit.text()
    expect(JSON.parse(hitText).sawCanary).toBe(true)
    expect(JSON.parse(hitText).requests[0].path).toBe('/v1/messages')
    const miss = await fetch(`${server.url}/__log/probe-ok~a?canary=other`)
    const missText = await miss.text()
    expect(JSON.parse(missText).sawCanary).toBe(false)
    expect(hitText).not.toContain(KEY)
    expect(missText).not.toContain(KEY)
  })

  test('given RECORD mode, when the SDK calls, then it proxies upstream and writes res + header-free req fixtures', async () => {
    let seen: { headers: IncomingHttpHeaders; url?: string } | undefined
    const upstream = createServer((req, res) => {
      seen = { headers: req.headers, url: req.url }
      req.resume()
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(MESSAGE('msg_up'))
      })
    })
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r))
    const stubUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`
    try {
      server = await startReplayServer({ fixturesDir, logDir, record: true, upstream: stubUrl })
      const msg = await client(server.url, 'rec-x').messages.create(PING)
      expect(msg.id).toBe('msg_up')
      const resFx = JSON.parse(await readFile(join(fixturesDir, 'rec-x', '0.res.json'), 'utf8'))
      expect(resFx.status).toBe(200)
      expect(JSON.parse(resFx.body).id).toBe('msg_up')
      const reqRaw = await readFile(join(fixturesDir, 'rec-x', '0.req.json'), 'utf8')
      expect(reqRaw).not.toContain(KEY)
      expect(reqRaw.toLowerCase()).not.toContain('authorization')
      expect(existsSync(join(logDir, 'rec-x'))).toBe(false)
      expect(seen?.headers.authorization).toBe(`Bearer ${KEY}`)
      expect(seen?.url).toBe('/v1/messages')
    } finally {
      upstream.closeAllConnections()
      await new Promise((r) => upstream.close(r))
    }
  })
})
