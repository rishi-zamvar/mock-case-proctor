import { describe, it, expect, vi } from 'vitest'
import { redact, format, createLogger } from './log'

// Built at runtime so no key-shaped literal lives in source (secret scan).
const FAKE = 'sk-' + 'ant-' + 'api03-' + 'A'.repeat(40) + '_-z9'

describe('redact', () => {
  it('masks a key inside a string', () => {
    expect(redact(`token ${FAKE} end`)).toBe('token sk-ant-*** end')
  })
  it('masks every key and leaves clean strings unchanged', () => {
    expect(redact(`${FAKE} and ${FAKE}`)).toBe('sk-ant-*** and sk-ant-***')
    expect(redact('no secrets here')).toBe('no secrets here')
  })
})

describe('format', () => {
  it('masks keys inside objects', () => {
    const out = format(['a', 1, { k: FAKE }])
    expect(out).toContain('sk-ant-***')
    expect(out).not.toContain(FAKE)
  })
  it('includes Error stacks with keys masked', () => {
    const out = format([new Error(`bad ${FAKE}`)])
    expect(out).toContain('at ')
    expect(out).toContain('sk-ant-***')
    expect(out).not.toContain(FAKE)
  })
  it('does not throw on circular objects', () => {
    const o: Record<string, unknown> = { k: FAKE }
    o.self = o
    expect(() => format([o])).not.toThrow()
    expect(format([o])).not.toContain(FAKE)
  })
})

describe('createLogger', () => {
  it('routes levels to sink with one redacted string', () => {
    const sink = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const l = createLogger(sink)
    l.info('i', FAKE)
    l.warn({ k: FAKE })
    l.error(new Error(FAKE))
    for (const fn of [sink.log, sink.warn, sink.error]) {
      expect(fn).toHaveBeenCalledTimes(1)
      const args = fn.mock.calls[0]
      expect(args).toHaveLength(1)
      expect(typeof args[0]).toBe('string')
      expect(args[0]).not.toContain(FAKE)
      expect(args[0]).toContain('sk-ant-***')
    }
  })
})
