import { describe, it, expect } from 'vitest'
import { KeyStatusSchema, SaveResultSchema, SaveArgsSchema } from './schemas'

describe('KeyStatusSchema', () => {
  it.each(['stored', 'env', 'dotenv', 'none'])('accepts source %s', (source) => {
    expect(KeyStatusSchema.parse({ hasKey: true, source })).toEqual({ hasKey: true, source })
  })
  it('rejects extra fields (a key must never ride along)', () => {
    expect(() => KeyStatusSchema.parse({ hasKey: true, source: 'env', key: 'x' })).toThrow()
  })
  it('rejects unknown source and missing hasKey', () => {
    expect(() => KeyStatusSchema.parse({ hasKey: true, source: 'keychain' })).toThrow()
    expect(() => KeyStatusSchema.parse({ source: 'env' })).toThrow()
  })
})

describe('SaveResultSchema', () => {
  const status = { hasKey: true, source: 'stored' }
  it.each(['valid', 'invalid', 'unverified', 'unavailable', 'empty'])('accepts %s', (result) => {
    expect(() => SaveResultSchema.parse({ status, result })).not.toThrow()
  })
  it('rejects unknown result and extra fields', () => {
    expect(() => SaveResultSchema.parse({ status, result: 'ok' })).toThrow()
    expect(() => SaveResultSchema.parse({ status, result: 'valid', key: 'x' })).toThrow()
    expect(() =>
      SaveResultSchema.parse({ status: { ...status, key: 'x' }, result: 'valid' })
    ).toThrow()
  })
})

describe('SaveArgsSchema', () => {
  it('accepts a key with empty or force options', () => {
    expect(() => SaveArgsSchema.parse(['k', {}])).not.toThrow()
    expect(() => SaveArgsSchema.parse(['k', { force: true }])).not.toThrow()
  })
  it('rejects extra options, non-strings, oversize keys and missing options', () => {
    expect(() => SaveArgsSchema.parse(['k', { force: true, x: 1 }])).toThrow()
    expect(() => SaveArgsSchema.parse([1, {}])).toThrow()
    expect(() => SaveArgsSchema.parse(['x'.repeat(1001), {}])).toThrow()
    expect(() => SaveArgsSchema.parse(['k'])).toThrow()
  })
})
