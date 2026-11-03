import { join } from 'node:path'

/** Minimal .env parser (no `dotenv` dependency, by decision). */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, '')
    const eq = line.indexOf('=')
    if (!line || line.startsWith('#') || eq < 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    const q = value[0]
    if ((q === '"' || q === "'") && value.length > 1 && value.endsWith(q)) value = value.slice(1, -1)
    else value = value.replace(/\s+#.*$/, '').trim()
    if (key) out[key] = value
  }
  return out
}

/** E2E never reads the real .env (Pitfall 5); packaged builds never read one. */
export function resolveDotenvPath(o: {
  env: Record<string, string | undefined>
  isPackaged: boolean
  appPath: string
}): string | null {
  if (o.env.E2E === '1') return o.env.E2E_DOTENV_PATH ?? null
  if (o.isPackaged) return null
  return join(o.appPath, '.env')
}
