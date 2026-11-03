// Records ONE missing replay fixture from a logged request (1 live call, key from .env, never printed):
// RECORD_ONE=1 REQ=<n.req.json> OUT=<fixtures/.../n.res.json> npx vitest run --project main tests/replay/recordOne.test.ts
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parseDotenv } from '../../src/main/keys/dotenv'

const ROOT = join(__dirname, '..', '..')

it.skipIf(!process.env.RECORD_ONE)(
  'records one fixture from a logged request',
  async () => {
    const req = process.env.REQ!
    const out = process.env.OUT!
    const { method, path, body } = JSON.parse(readFileSync(req, 'utf8')) as {
      method: string
      path: string
      body: unknown
    }
    const key = parseDotenv(readFileSync(join(ROOT, '.env'), 'utf8')).ANTHROPIC_API_KEY
    expect(Boolean(key)).toBe(true)
    const r = await fetch(`https://api.anthropic.com${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': key
      },
      body: JSON.stringify(body)
    })
    const fx = {
      status: r.status,
      headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' },
      body: await r.text()
    }
    expect(fx.status).toBe(200)
    writeFileSync(out, JSON.stringify(fx, null, 2))
    copyFileSync(req, out.replace(/\.res\.json$/, '.req.json'))
  },
  300_000
)
