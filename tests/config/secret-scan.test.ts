import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const KEY_RE = /sk-ant-[A-Za-z0-9_-]{20,}/

const git = (args: string[]): string => execFileSync('git', args, { encoding: 'utf8' })

const isBinary = (buf: Buffer): boolean => buf.subarray(0, 8192).includes(0)

describe('secret scan', () => {
  test('given a fake key built at runtime, when matched, then KEY_RE finds it and not its own source', () => {
    const fake = 'sk-' + 'ant-' + 'x'.repeat(30)
    expect(KEY_RE.test(`token=${fake}`)).toBe(true)
    expect(KEY_RE.test(KEY_RE.source)).toBe(false)
  })

  test('given tracked, staged and untracked non-ignored files, when scanned, then none contain an Anthropic key', () => {
    const files = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
      .split('\0')
      .filter(Boolean)
    const hits: string[] = []
    for (const file of files) {
      let buf: Buffer
      try {
        buf = readFileSync(file)
      } catch {
        continue // listed in index but deleted from worktree
      }
      if (isBinary(buf)) continue
      if (KEY_RE.test(buf.toString('utf8'))) hits.push(file)
    }
    // paths only; never print matched content
    expect(hits, `files containing a key: ${hits.join(', ')}`).toEqual([])
  })

  test.each(['.env', 'models/x', 'sessions/x', 'cases/x'])(
    'given %s, when checked against .gitignore, then it is ignored',
    (path) => {
      expect(() => git(['check-ignore', '-q', path])).not.toThrow()
    }
  )
})
