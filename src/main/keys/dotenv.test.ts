import { describe, it, expect } from 'vitest'
import { parseDotenv, resolveDotenvPath } from './dotenv'

describe('parseDotenv', () => {
  it('parses LF and CRLF lines', () => {
    expect(parseDotenv('A=1\nB=two')).toEqual({ A: '1', B: 'two' })
    expect(parseDotenv('A=1\r\nB=two\r\n')).toEqual({ A: '1', B: 'two' })
  })
  it('handles export, quotes and trailing comments', () => {
    expect(parseDotenv('export A=1')).toEqual({ A: '1' })
    expect(parseDotenv('A="q v"').A).toBe('q v')
    expect(parseDotenv("A='q v'").A).toBe('q v')
    expect(parseDotenv('A=x # c').A).toBe('x')
    expect(parseDotenv('A="x # y"').A).toBe('x # y')
  })
  it('ignores comments, blanks and lines without =', () => {
    expect(parseDotenv('# comment\n\nnoequals\nA=1')).toEqual({ A: '1' })
  })
  it('handles empty values, spaces around = and = inside values', () => {
    expect(parseDotenv('A=').A).toBe('')
    expect(parseDotenv('A = b')).toEqual({ A: 'b' })
    expect(parseDotenv('A=b=c').A).toBe('b=c')
  })
})

describe('resolveDotenvPath', () => {
  it('returns null under E2E without an override', () => {
    expect(resolveDotenvPath({ env: { E2E: '1' }, isPackaged: false, appPath: '/p' })).toBeNull()
  })
  it('returns the E2E override path', () => {
    expect(
      resolveDotenvPath({
        env: { E2E: '1', E2E_DOTENV_PATH: '/t/.env' },
        isPackaged: false,
        appPath: '/p'
      })
    ).toBe('/t/.env')
  })
  it('returns null when packaged', () => {
    expect(resolveDotenvPath({ env: {}, isPackaged: true, appPath: '/p' })).toBeNull()
  })
  it('returns appPath/.env in dev', () => {
    expect(resolveDotenvPath({ env: {}, isPackaged: false, appPath: '/p' })).toBe('/p/.env')
  })
})
