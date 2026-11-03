// Deck text for a case: sibling deck.txt if present, else pdftotext on the candidate-facing PDF only.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findCase, intervieweePdfPath } from './library'

export function readDeckText(
  root: string,
  id: string,
  run: (pdf: string) => string = (pdf) => execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' })
): string {
  const c = findCase(root, id)
  if (!c) throw new Error(`case ${id} not found`)
  const txt = join(c.dir, 'deck.txt')
  return existsSync(txt) ? readFileSync(txt, 'utf8') : run(intervieweePdfPath(root, id, c.slug))
}
