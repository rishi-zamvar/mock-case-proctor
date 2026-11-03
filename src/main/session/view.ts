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
    transcribing: x.transcribing ?? false
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
    keyNumbers: brief.memorize.map((k) => ({ label: k.label, text: k.text }))
  }
}
