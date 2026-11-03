// BAR-01: the ONLY projection from a session to what the renderer sees. Pure: no fs, electron or clock.
// Every object is an explicit literal; never spread session, brief or card into the view.
import type { CaseCard, Checks, Reveal, SectionView, ViewPhase, ViewState } from '../../shared/ipc'
import { ViewStateSchema } from '../../shared/schemas'
import type { InterviewerBrief } from '../domain/cases/brief'
import { SECTION_CATALOG } from '../domain/machine/sections'
import { brevityBand } from '../domain/metrics'
import type { SessionFile } from '../store/sessionSchema'

export type ViewExtras = {
  clockNow: number
  timeScale: number
  speaking: boolean
  transcribing?: boolean
  scoringFailed?: boolean
}

const TALK_PHASES: readonly ViewPhase[] = ['warmup', 'presentation', 'grilling']
const CALL_RE = /\b(invest|pass|buy|my call)\b/i

const label = (id: string): string => SECTION_CATALOG.find((c) => c.id === id)?.label ?? id

function sectionView(s: SessionFile, phase: ViewPhase): SectionView | null {
  const m = s.machineState
  if (phase !== 'grilling' || m.current === null) return null
  return { id: m.current, label: label(m.current), index: m.done.length, total: m.plan.length }
}

export function toViewState(
  s: SessionFile,
  card: CaseCard,
  brief: InterviewerBrief,
  x: ViewExtras
): ViewState {
  const m = s.machineState
  const phase: ViewPhase = m.phase === 'idle' ? 'warmup' : m.phase
  return ViewStateSchema.parse({
    sessionId: s.id,
    phase,
    card,
    reviewDeadline: m.reviewDeadline,
    clockNow: x.clockNow,
    timeScale: x.timeScale,
    section: sectionView(s, phase),
    transcript: s.transcript.map((t) => ({ id: t.id, speaker: t.speaker, text: t.text })),
    speaking: x.speaking,
    canTalk: !x.speaking && !x.transcribing && TALK_PHASES.includes(phase),
    endedEarly: m.endedEarly,
    reveal: phase === 'reviewMode' && s.scorecard ? buildReveal(s, brief) : null,
    deckPage: s.deckPage ?? 1,
    reviewWarned: m.reviewWarned,
    transcribing: x.transcribing ?? false,
    scoringFailed: x.scoringFailed ?? false
  })
}

export function buildReveal(s: SessionFile, brief: InterviewerBrief): Reveal {
  if (!s.scorecard) throw new Error('buildReveal: session has no scorecard')
  const opening =
    s.transcript.find((t) => t.speaker === 'candidate' && t.phase === 'presentation')?.text ?? ''
  const firstSentence = opening.split(/(?<=[.!?])\s/)[0] ?? ''
  const checks: Checks = {
    brevity: s.transcript
      .filter(
        (t) =>
          t.speaker === 'candidate' &&
          t.ms !== undefined &&
          (t.phase === 'presentation' || t.phase === 'grilling')
      )
      .map((t) => ({ turnId: t.id, ms: t.ms as number, band: brevityBand(t.ms as number) })),
    ledWithCall: CALL_RE.test(firstSentence),
    omitted: s.machineState.omitted.map(label),
    numbers: [] // ponytail: numbers check is empty until Phase 8's tolerance parser (REV-03)
  }
  return {
    scorecard: s.scorecard,
    checks,
    idealAnswer: brief.idealAnswer,
    opening,
    keyNumbers: brief.memorize.map((k) => ({ label: k.label, text: k.text })),
    intendedRead: brief.intendedRead.sentence,
    backSolve: backSolveLines(brief.backSolve),
    transcript: s.transcript.map((t) => ({
      id: t.id,
      speaker: t.speaker,
      text: t.text,
      offsetMs: t.at - s.startedAt,
      ms: t.ms ?? null,
      section: t.section ?? null
    }))
  }
}

const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// ponytail: fmt table is the minimum seen in the 12 cases (val, m, $M, pct, pct1, growth, x); unknown fmt prints raw.
function fmtStep(v: unknown, fmt: unknown): string {
  if (typeof v !== 'number') return String(v)
  if (fmt === 'm' || fmt === '$M' || fmt === 'val') return `$${v}M`
  if (fmt === 'pct' || fmt === 'pct1' || fmt === 'growth') return `${Math.round(v * 1000) / 10}%`
  if (fmt === 'x') return `${v}x`
  return String(v)
}

/** Brief back-solve (shape unknown at the type level) -> human lines for the reveal. */
export function backSolveLines(bs: unknown): string[] {
  if (!isRec(bs)) return []
  const steps = Array.isArray(bs.steps) ? bs.steps.filter(isRec) : []
  const lines = steps.map((st) => `${String(st.label)}: ${fmtStep(st.v, st.fmt)}`)
  for (const k of ['le_band_check', 'underwrite_path_text'])
    if (typeof bs[k] === 'string') lines.push(bs[k] as string)
  return lines
}
