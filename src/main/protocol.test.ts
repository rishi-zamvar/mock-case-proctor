import { describe, it, expect } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { resolveSafePath, resolveAppRequest, isAppOrigin } from './protocol'

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
