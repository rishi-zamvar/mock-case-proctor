// Case library reader (LIB-03). Reads the root only; pdftotext runs in Phase 3 glue (deckText is an argument).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { CaseCard } from '../../../shared/ipc'
import { CaseCardSchema } from '../../../shared/schemas'
import { buildBrief, type InterviewerBrief } from './brief'

export const DEFAULT_LIBRARY_ROOT = join(homedir(), 'Documents/Projects/lead_edge_mock_cases')
const DIR_RE = /^case_(\d{2})_([a-z0-9]+)$/

export const intervieweePdfPath = (root: string, id: string, slug: string): string =>
  join(root, `case_${id}_${slug}`, `case_${id}_${slug}_interviewee_package.pdf`)

function caseDirs(root: string): { id: string; slug: string }[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => DIR_RE.exec(e.name))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ id: m[1], slug: m[2] }))
}

const dataPath = (root: string, id: string): string => join(root, '_work/data', `case_${id}.json`)

function readCase(root: string, id: string, slug: string): { card: CaseCard; data: unknown } {
  const data = JSON.parse(readFileSync(dataPath(root, id), 'utf8'))
  const card = CaseCardSchema.parse({
    id: data.case_id,
    number: parseInt(id, 10),
    slug,
    company: data.company.name,
    vertical: data.vertical,
    level: data.level,
    intervieweePdfPath: intervieweePdfPath(root, id, slug)
  })
  return { card, data }
}

export function listCases(root: string = DEFAULT_LIBRARY_ROOT): CaseCard[] {
  return caseDirs(root)
    .filter(({ id }) => existsSync(dataPath(root, id)))
    .map(({ id, slug }) => readCase(root, id, slug).card)
    .sort((a, b) => a.number - b.number)
}

export function loadCase(
  root: string,
  id: string,
  deckText: string
): { card: CaseCard; brief: InterviewerBrief } {
  const dir = caseDirs(root).find((c) => c.id === id)
  if (!dir || !existsSync(dataPath(root, id))) throw new Error(`case ${id} not found`)
  const { card, data } = readCase(root, id, dir.slug)
  return { card, brief: buildBrief(data, deckText) }
}
