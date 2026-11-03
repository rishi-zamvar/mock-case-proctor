import { describe, it, expect } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import {
  resolveSafePath,
  resolveAppRequest,
  isAppOrigin,
  resolveCasePdfRequest,
  resolveResRequest
} from './protocol'

const root = path.join(os.tmpdir(), 'root')

describe('resolveSafePath', () => {
  it('resolves files inside root', () => {
    expect(resolveSafePath(root, '/index.html')).toBe(path.join(root, 'index.html'))
    expect(resolveSafePath(root, '/assets/a.js')).toBe(path.join(root, 'assets', 'a.js'))
  })
  it.each([
    '/../etc/passwd',
    '/%2e%2e/secret',
    '/a/%2e%2e/%2e%2e/x',
    '/..%2fsecret',
    '/%00x',
    '/a%00',
    '/%E0%A4%A',
    '/'
  ])('refuses %s', (p) => {
    expect(resolveSafePath(root, p)).toBeNull()
  })
})

describe('resolveAppRequest', () => {
  const roots = { bundle: root }
  it('maps bundle urls into root, / to index.html', () => {
    expect(resolveAppRequest('app://bundle/', roots)).toBe(path.join(root, 'index.html'))
    expect(resolveAppRequest('app://bundle/x.js', roots)).toBe(path.join(root, 'x.js'))
  })
  it('refuses unknown hosts, traversal, inherited keys, other schemes and garbage', () => {
    expect(resolveAppRequest('app://evil/index.html', roots)).toBeNull()
    expect(resolveAppRequest('app://bundle/%2e%2e/main/index.js', roots)).toBeNull()
    expect(resolveAppRequest('app://constructor/x', roots)).toBeNull()
    expect(resolveAppRequest('https://bundle/x.js', roots)).toBeNull()
    expect(resolveAppRequest('not a url', roots)).toBeNull()
  })
})

describe('isAppOrigin', () => {
  it('accepts app://bundle', () => {
    expect(isAppOrigin('app://bundle/index.html')).toBe(true)
    expect(isAppOrigin('app://bundle')).toBe(true)
  })
  it('rejects other hosts, schemes and junk', () => {
    expect(isAppOrigin('app://assets/x')).toBe(false)
    expect(isAppOrigin('https://evil.com')).toBe(false)
    expect(isAppOrigin('file:///x')).toBe(false)
    expect(isAppOrigin('')).toBe(false)
    expect(isAppOrigin('garbage')).toBe(false)
  })
  it('accepts the dev server origin only when given', () => {
    expect(isAppOrigin('http://localhost:5173/', 'http://localhost:5173')).toBe(true)
    expect(isAppOrigin('http://localhost:5174/', 'http://localhost:5173')).toBe(false)
    expect(isAppOrigin('http://localhost:5173/', undefined)).toBe(false)
  })
})

describe('resolveCasePdfRequest', () => {
  it.each([
    ['app://bundle/cases/02/interviewee.pdf', '02'],
    ['app://bundle/cases/99/interviewee.pdf?x=1', '99']
  ])('given %s, when resolved, then returns case id %s', (url, id) => {
    expect(resolveCasePdfRequest(url)).toBe(id)
  })
  it.each([
    'app://bundle/index.html',
    'app://bundle/assets/x.js',
    'app://assets/x',
    'app://bundle/CASES/02/interviewee.pdf'
  ])('given non-case url %s, when resolved, then null', (url) => {
    expect(resolveCasePdfRequest(url)).toBeNull()
  })
  it.each([
    'app://bundle/cases/02/interviewer.pdf',
    'app://bundle/cases/02/case_02_pawshub_interviewer_package.pdf',
    'app://bundle/cases/2/interviewee.pdf',
    'app://bundle/cases/abc/interviewee.pdf',
    'app://bundle/cases/02/../02/interviewee.pdf',
    'app://bundle/cases/02/%2e%2e/interviewee.pdf',
    'app://bundle/cases/%30%32/interviewee.pdf',
    'app://bundle/cases/02/interviewee.pdf/',
    'app://bundle/cases/',
    'app://bundle/cases'
  ])('given refused case url %s, when resolved, then deny', (url) => {
    expect(resolveCasePdfRequest(url)).toBe('deny')
  })
})

describe('resolveResRequest', () => {
  const root = path.join(os.tmpdir(), 'res-root')
  it('given a /res url, when resolved, then maps into the assets root', () => {
    expect(resolveResRequest('app://bundle/res/models/a.bin', root)).toBe(
      path.join(root, 'models/a.bin')
    )
  })
  it.each(['app://bundle/index.html', 'app://assets/res/a.bin', 'app://bundle/resx/a.bin'])(
    'given non-res url %s, when resolved, then null',
    (url) => {
      expect(resolveResRequest(url, root)).toBeNull()
    }
  )
  it.each([
    'app://bundle/res/../x',
    'app://bundle/res/%2e%2e/x',
    'app://bundle/res/%2e%2e/%2e%2e/etc/passwd',
    'app://bundle/res/',
    'app://bundle/res/a%00.bin'
  ])('given refused res url %s, when resolved, then deny', (url) => {
    expect(resolveResRequest(url, root)).toBe('deny')
  })
})
