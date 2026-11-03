// Pure app:// path safety and origin checks (FND-05). No electron import: unit-tested in node.
import path from 'node:path'

export function resolveSafePath(root: string, urlPathname: string): string | null {
  let p: string
  try {
    p = decodeURIComponent(urlPathname)
  } catch {
    return null
  }
  if (p.includes('\0')) return null
  const abs = path.resolve(root, '.' + p)
  const rel = path.relative(root, abs)
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? abs : null
}

export function resolveAppRequest(url: string, roots: Record<string, string>): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'app:' || !Object.hasOwn(roots, u.host)) return null
  const root = roots[u.host]
  const fix = (p: string): string => (p === '/' || p === '' ? '/index.html' : p)
  // WHATWG URL collapses '..' and '%2e%2e' at the root, which hides traversal attempts.
  // Also check the raw path so any attempt to climb out is refused rather than clamped.
  const raw = url.slice(`app://${u.host}`.length).split(/[?#]/)[0]
  if (resolveSafePath(root, fix(raw)) === null) return null
  return resolveSafePath(root, fix(u.pathname))
}

export function isAppOrigin(url: string, devUrl?: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol === 'app:' && u.host === 'bundle') return true
    return devUrl !== undefined && new URL(devUrl).origin === u.origin
  } catch {
    return false
  }
}

/** null = not a case route (fall through to roots). 'deny' = case route but refused (404). string = the case id. */
export function resolveCasePdfRequest(url: string): string | 'deny' | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'app:' || u.host !== 'bundle') return null
  const raw = url.slice('app://bundle'.length).split(/[?#]/)[0]
  if (!raw.startsWith('/cases') && !u.pathname.startsWith('/cases')) return null
  // Exact raw match only: encoded and dot-segment variants are refused, never normalised.
  return /^\/cases\/(\d{2})\/interviewee\.pdf$/.exec(raw)?.[1] ?? 'deny'
}
