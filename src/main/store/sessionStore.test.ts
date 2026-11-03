import { describe, it, expect, vi } from 'vitest'
import * as nodeFs from 'node:fs'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionStore } from './sessionStore'
import type { SessionFile } from './sessionSchema'
import { initialState } from '../domain/machine/interviewMachine'
import type { Logger } from '../log'

const SECRET = 'my revenue grew 184 million transcript-secret'
const NOW = 5000

function session(o: Partial<SessionFile> = {}): SessionFile {
  return {
    schemaVersion: 1,
    id: 's1',
    caseId: '99',
    startedAt: 1,
    status: 'active',
    warmup: true,
    machineState: initialState(),
    transcript: [{ id: 't1', speaker: 'candidate', phase: 'presentation', text: SECRET, at: 2 }],
    controlLog: [],
    timings: [],
    pending: null,
    ...o
  }
}

function setup(fs?: Parameters<typeof createSessionStore>[0]['fs']) {
  const root = mkdtempSync(join(tmpdir(), 'mcp-store-'))
  const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const store = createSessionStore({ root, now: () => NOW, log, fs })
  return { root, log, store }
}

function plant(root: string, id: string, body: string) {
  mkdirSync(join(root, id), { recursive: true })
  writeFileSync(join(root, id, 'session.json'), body)
}

describe('SessionStore save/load', () => {
  it('given a valid session when saved then load round-trips and no tmp file remains', () => {
    const { root, store } = setup()
    const s = session()
    store.save(s)
    expect(store.load('s1')).toEqual(s)
    const file = join(root, 's1', 'session.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(s)
    expect(existsSync(`${file}.tmp`)).toBe(false)
  })

  it('given an invalid session when saved then it throws and the file on disk is unchanged', () => {
    const { root, store } = setup()
    store.save(session())
    const file = join(root, 's1', 'session.json')
    const before = readFileSync(file, 'utf8')
    expect(() => store.save(session({ status: 'graded' as unknown as 'active' }))).toThrow()
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('given two saves when loaded then the second content wins', () => {
    const { store } = setup()
    store.save(session())
    store.save(session({ status: 'abandoned', endedAt: 9 }))
    expect(store.load('s1')?.status).toBe('abandoned')
  })

  it('given rename fails once when saving then the previous session.json stays intact and loadable', () => {
    let fail = false
    const renameSync = vi.fn((a: nodeFs.PathLike, b: nodeFs.PathLike) => {
      if (fail) {
        fail = false
        throw new Error('rename boom')
      }
      nodeFs.renameSync(a, b)
    })
    const { root, store } = setup({ renameSync })
    const first = session()
    store.save(first)
    fail = true
    expect(() => store.save(session({ status: 'abandoned' }))).toThrow('rename boom')
    expect(store.load('s1')).toEqual(first)
    expect(existsSync(join(root, 's1', 'session.json.tmp'))).toBe(false)
  })

  it('given no file when loading then null', () => {
    expect(setup().store.load('missing')).toBeNull()
  })

  it('given corrupt JSON when loading then null, the file is quarantined and counted once', () => {
    const { root, store } = setup()
    plant(root, 'bad1', '{not json')
    expect(store.load('bad1')).toBeNull()
    expect(existsSync(join(root, '_quarantine', `bad1-${NOW}.json`))).toBe(true)
    expect(existsSync(join(root, 'bad1', 'session.json'))).toBe(false)
    expect(store.takeQuarantined()).toBe(1)
    expect(store.takeQuarantined()).toBe(0)
  })

  it('given schema-invalid JSON when loading then it is quarantined', () => {
    const { root, store } = setup()
    plant(root, 'bad2', '{"schemaVersion":2}')
    expect(store.load('bad2')).toBeNull()
    expect(existsSync(join(root, '_quarantine', `bad2-${NOW}.json`))).toBe(true)
    expect(store.takeQuarantined()).toBe(1)
  })

  it('given 2 valid and 1 corrupt when listing then the valid ones come newest first and the corrupt one is quarantined', () => {
    const { root, store } = setup()
    store.save(session({ id: 'old', startedAt: 10 }))
    store.save(session({ id: 'new', startedAt: 20 }))
    plant(root, 'bad', '{not json')
    const all = store.list()
    expect(all.map((s) => s.id)).toEqual(['new', 'old'])
    expect(store.takeQuarantined()).toBe(1)
    // the quarantine dir is not a session
    expect(store.list().map((s) => s.id)).toEqual(['new', 'old'])
    expect(store.takeQuarantined()).toBe(0)
    expect(readdirSync(join(root, '_quarantine'))).toHaveLength(1)
  })

  it('given a missing root when listing then empty', () => {
    const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const store = createSessionStore({
      root: join(tmpdir(), 'mcp-nope-' + Date.now()),
      now: () => 1,
      log
    })
    expect(store.list()).toEqual([])
  })

  it('given a path-traversal id when loading then null without touching the fs', () => {
    const existsSpy = vi.fn(nodeFs.existsSync)
    const readSpy = vi.fn(nodeFs.readFileSync)
    const { store } = setup({ existsSync: existsSpy, readFileSync: readSpy } as never)
    expect(store.load('../x')).toBeNull()
    expect(existsSpy).not.toHaveBeenCalled()
    expect(readSpy).not.toHaveBeenCalled()
  })

  it('given saves and a quarantine when logging then no log line contains transcript text', () => {
    const { root, log, store } = setup()
    store.save(session())
    plant(root, 'bad', JSON.stringify({ text: SECRET }))
    store.list()
    const all = [log.info, log.warn, log.error].flatMap(
      (f) => (f as ReturnType<typeof vi.fn>).mock.calls
    )
    expect(JSON.stringify(all)).not.toContain(SECRET)
  })
})
