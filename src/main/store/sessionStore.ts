// File-backed session store (REV-05, FLOW-07, LIB-02). One dir per session: <root>/<id>/session.json.
import * as nodeFs from 'node:fs'
import { join } from 'node:path'
import { SessionFileSchema, type SessionFile } from './sessionSchema'
import type { CaseCard, LibraryView } from '../../shared/ipc'
import type { Logger } from '../log'

export interface SessionStore {
  save(s: SessionFile): void
  load(id: string): SessionFile | null
  list(): SessionFile[]
  takeQuarantined(): number
  libraryView(cards: CaseCard[]): LibraryView
}

type Fs = typeof nodeFs
const ID = /^[A-Za-z0-9_-]{1,80}$/
const QUARANTINE = '_quarantine'

export function createSessionStore(o: {
  root: string
  now: () => number
  log: Logger
  fs?: Partial<Fs>
}): SessionStore {
  const { root, now, log } = o
  const fs: Fs = { ...nodeFs, ...o.fs }
  let quarantined = 0
  const fileOf = (id: string): string => join(root, id, 'session.json')

  function quarantine(id: string): void {
    try {
      fs.mkdirSync(join(root, QUARANTINE), { recursive: true })
      fs.renameSync(fileOf(id), join(root, QUARANTINE, `${id}-${now()}.json`))
      quarantined++
      log.warn('session quarantined', id) // id only, never content
    } catch (e) {
      log.error('session quarantine failed', id, (e as Error).message)
    }
  }

  // ponytail: full rewrite per turn; move to append-only NDJSON if a session exceeds a few MB
  function save(s: SessionFile): void {
    SessionFileSchema.parse(s)
    const dir = join(root, s.id)
    fs.mkdirSync(dir, { recursive: true })
    const final = fileOf(s.id)
    const tmp = `${final}.tmp`
    try {
      const fd = fs.openSync(tmp, 'w')
      try {
        fs.writeFileSync(fd, JSON.stringify(s, null, 2))
        fs.fsyncSync(fd)
      } finally {
        fs.closeSync(fd)
      }
      fs.renameSync(tmp, final)
    } catch (e) {
      try {
        fs.unlinkSync(tmp)
      } catch {
        /* best effort */
      }
      throw e
    }
  }

  function load(id: string): SessionFile | null {
    if (!ID.test(id)) return null
    const file = fileOf(id)
    if (!fs.existsSync(file)) return null
    let parsed: ReturnType<typeof SessionFileSchema.safeParse>
    try {
      parsed = SessionFileSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')))
    } catch {
      quarantine(id)
      return null
    }
    if (!parsed.success) {
      quarantine(id)
      return null
    }
    return parsed.data
  }

  function list(): SessionFile[] {
    let entries: nodeFs.Dirent[]
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      return []
    }
    return entries
      .filter((d) => d.isDirectory() && d.name !== QUARANTINE)
      .map((d) => load(d.name))
      .filter((s): s is SessionFile => s !== null)
      .sort((a, b) => b.startedAt - a.startedAt)
  }

  function takeQuarantined(): number {
    const n = quarantined
    quarantined = 0
    return n
  }

  function libraryView(_cards: CaseCard[]): LibraryView {
    throw new Error('not implemented')
  }

  return { save, load, list, takeQuarantined, libraryView }
}
