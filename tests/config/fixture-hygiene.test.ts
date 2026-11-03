import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const FIXTURES = join(__dirname, '..', 'fixtures', 'claude')

const KEY_RE = /sk-ant-[A-Za-z0-9_-]{20,}/

export function findLeaks(text: string): string[] {
  const leaks: string[] = []
  if (KEY_RE.test(text)) leaks.push('key')
  if (/"authorization"/i.test(text)) leaks.push('authorization')
  if (/x-api-key/i.test(text)) leaks.push('x-api-key')
  return leaks
}

describe('claude fixture hygiene', () => {
  test('given leaky strings, when checked, then findLeaks flags key and authorization header', () => {
    expect(findLeaks('token=' + 'sk-' + 'ant-' + 'z'.repeat(25))).toContain('key')
    expect(findLeaks('{"Authorization": "Bearer x"}')).toContain('authorization')
    expect(findLeaks('{"x-api-key": "y"}')).toContain('x-api-key')
    expect(findLeaks('{"model":"claude-haiku-5-5"}')).toEqual([])
  })

  test('given every file under tests/fixtures/claude, when scanned, then none leak a key or auth header', () => {
    const files = readdirSync(FIXTURES, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => join(d.parentPath, d.name))
    // paths only; never print matched content
    const hits = files.filter((f) => findLeaks(readFileSync(f, 'utf8')).length > 0)
    expect(hits, `fixtures leaking secrets: ${hits.join(', ')}`).toEqual([])
  })
})
