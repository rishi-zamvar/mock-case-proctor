// Placeholder resolver. Mirrors lead_edge_mock_cases/_work/scripts/build_interviewer.js fnRef/R
// (minus R's S-id -> "p. N" relabel). Single pass: no token .s nests a placeholder.
export type Tokens = Record<string, { v: unknown; fmt: string; s: string }>

type Notes = { numbered?: { id: string }[] } | null | undefined
type FnData = {
  deck?: Record<string, { notes?: Notes } | null | undefined>
  inserts?: { id: string; notes?: Notes }[]
  bank?: { house?: string }
}

/** Broad leftover detector: any {non-space} run, e.g. {x}, {exA_y}, {fn:a.b}. */
export const LEFTOVER_RE = /\{[^{}\s]+\}/

/** {fn:<slide>.<id>} or bare {fn:<id>} (must be unique) -> "note (2)" / "note (b)" (H3 = alpha markers). */
export function makeFnRef(data: FnData): (k: string) => string {
  const alpha = data.bank?.house === 'H3'
  const lists: [string, Notes][] = [
    ...Object.entries(data.deck ?? {}).map(([t, sl]): [string, Notes] => [t, sl?.notes]),
    ...(data.inserts ?? []).map((x): [string, Notes] => [x.id.toLowerCase(), x.notes])
  ]
  return (k) => {
    const [t, id] = k.includes('.') ? k.split('.') : [null, k]
    const hits = lists
      .filter(([tt, n]) => (!t || tt === t) && n?.numbered)
      .map(([, n]) => n!.numbered!.findIndex((x) => x.id === id))
      .filter((i) => i >= 0)
    if (hits.length !== 1) throw new Error(`{fn:${k}} matches ${hits.length} notes`)
    return `note (${alpha ? String.fromCharCode(97 + hits[0]) : hits[0] + 1})`
  }
}

export function resolveString(s: string, tokens: Tokens, fnRef: (k: string) => string): string {
  return s
    .replace(/\{fn:([\w.]+)\}/g, (_, k: string) => fnRef(k))
    .replace(/\{(\w+)\}/g, (_, k: string) => {
      if (!Object.hasOwn(tokens, k)) throw new Error(`unresolved token {${k}}`)
      return tokens[k].s
    })
}

/** Returns a new structure with every string passed through f; scalars untouched. */
export const resolveDeep = <T>(o: T, f: (s: string) => string): T =>
  typeof o === 'string'
    ? (f(o) as T)
    : Array.isArray(o)
      ? (o.map((x) => resolveDeep(x, f)) as T)
      : o && typeof o === 'object'
        ? (Object.fromEntries(Object.entries(o).map(([k, v]) => [k, resolveDeep(v, f)])) as T)
        : o

export function makeResolver(data: { tokens: Tokens } & FnData): (s: string) => string {
  const fnRef = makeFnRef(data)
  return (s) => resolveString(s, data.tokens, fnRef)
}
