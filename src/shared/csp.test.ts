import { describe, expect, test } from 'vitest'
import { CSP } from './csp'

const directive = (name: string): string[] =>
  (CSP.split('; ').find((d) => d.startsWith(name + ' ')) ?? '').split(' ').slice(1)

describe('CSP', () => {
  test('given GLB textures load via blob: fetch, when inspecting connect-src, then blob: is allowed', () => {
    expect(directive('connect-src')).toContain('blob:')
  })
  test('given the hardened script policy, when inspecting script-src, then no unsafe-eval and no blob:', () => {
    const s = directive('script-src')
    expect(s).not.toContain("'unsafe-eval'")
    expect(s).not.toContain('blob:')
    expect(s).toContain("'wasm-unsafe-eval'")
  })
})
