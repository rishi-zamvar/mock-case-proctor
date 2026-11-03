// Claude replay/record server for tests. Clients point the SDK at `${url}/s/<scenario>[~<launchId>]`.
// Request headers are never written to disk; auth values live only in memory for /__log canary checks.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface ReplayServer {
  url: string
  close(): Promise<void>
}

interface Fixture {
  status: number
  headers: { 'content-type': string }
  body: string
}

interface Seen {
  method: string
  path: string
  body: unknown
  auth?: string
  xkey?: string
}

const FORWARD = [
  'anthropic-version',
  'anthropic-beta',
  'content-type',
  'authorization',
  'x-api-key'
]

const readBody = async (req: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

const send = (res: ServerResponse, fx: Fixture): void => {
  res.writeHead(fx.status, { 'content-type': fx.headers['content-type'] })
  res.end(fx.body)
}

const writeLog = async (dir: string, n: number, s: Seen): Promise<void> => {
  await mkdir(dir, { recursive: true })
  const { method, path, body } = s // auth fields deliberately dropped
  await writeFile(join(dir, `${n}.req.json`), JSON.stringify({ method, path, body }, null, 2))
}

export async function startReplayServer(opts: {
  fixturesDir: string
  logDir: string
  record?: boolean
  upstream?: string
  port?: number
}): Promise<ReplayServer> {
  const upstream = opts.upstream ?? 'https://api.anthropic.com'
  const counters = new Map<string, number>()
  const seen = new Map<string, Seen[]>()

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const u = new URL(req.url ?? '/', 'http://x')
    const parts = u.pathname.split('/').filter(Boolean)

    if (parts[0] === '__log' && parts[1] && req.method === 'GET') {
      const key = decodeURIComponent(parts[1])
      const canary = u.searchParams.get('canary')
      const list = seen.get(key) ?? []
      const sawCanary =
        canary !== null && list.some((s) => s.auth === `Bearer ${canary}` || s.xkey === canary)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          requests: list.map(({ method, path, body }) => ({ method, path, body })),
          sawCanary
        })
      )
      return
    }

    if (parts[0] !== 's' || !parts[1]) {
      res.writeHead(404).end()
      return
    }

    const key = decodeURIComponent(parts[1])
    const scenario = key.split('~')[0]
    const n = counters.get(key) ?? 0
    counters.set(key, n + 1)
    const path = '/' + parts.slice(2).join('/')
    const text = await readBody(req)
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      // keep raw text
    }
    const h = req.headers
    const entry: Seen = {
      method: req.method ?? 'GET',
      path,
      body,
      auth: typeof h.authorization === 'string' ? h.authorization : undefined,
      xkey: typeof h['x-api-key'] === 'string' ? h['x-api-key'] : undefined
    }
    seen.set(key, [...(seen.get(key) ?? []), entry])
    const fixtureDir = join(opts.fixturesDir, scenario)

    if (opts.record) {
      const headers: Record<string, string> = {}
      for (const name of FORWARD) if (typeof h[name] === 'string') headers[name] = h[name] as string
      const up = await fetch(upstream + path + u.search, {
        method: entry.method,
        headers,
        body: entry.method === 'GET' || entry.method === 'HEAD' ? undefined : text
      })
      const fx: Fixture = {
        status: up.status,
        headers: { 'content-type': up.headers.get('content-type') ?? 'application/json' },
        body: await up.text()
      }
      await mkdir(fixtureDir, { recursive: true })
      await writeFile(join(fixtureDir, `${n}.res.json`), JSON.stringify(fx, null, 2))
      await writeLog(fixtureDir, n, entry)
      send(res, fx)
      return
    }

    await writeLog(join(opts.logDir, key), n, entry)
    let fx: Fixture
    try {
      fx = JSON.parse(await readFile(join(fixtureDir, `${n}.res.json`), 'utf8')) as Fixture
    } catch {
      res.writeHead(599, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          type: 'error',
          error: { type: 'replay_missing', message: `${scenario}/${n}` }
        })
      )
      return
    }
    send(res, fx)
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({ type: 'error', error: { type: 'replay_internal', message: String(err) } })
      )
    })
  })
  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
        server.closeAllConnections()
      })
  }
}
