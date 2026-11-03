// Code-owned proctor facts for every grill/wrapup turn (INT-03/INT-05). Pure: shared by runner and live eval.
import { pushbackStatus } from '../domain/machine/interviewMachine'
import type { SectionId } from '../domain/machine/sections'
import type { ProctorFacts, TurnRequest } from '../ports'
import type { SessionFile } from '../store/sessionSchema'

export function buildTurnRequest(
  s: Pick<SessionFile, 'machineState' | 'transcript' | 'controlLog' | 'openingPlan'>,
  pending: { kind: 'grill' | 'wrapup'; section?: SectionId; hintAllowed?: boolean },
  now: number
): TurnRequest {
  const m = s.machineState
  const turns = m.turnsInSection
  const directive: ProctorFacts['directive'] =
    pending.kind === 'wrapup'
      ? 'wrapup'
      : turns === 0
        ? 'framing'
        : m.caps && turns >= m.caps.soft
          ? 'wrap_section'
          : 'probe'
  const lastCandidate = s.transcript.findLast((t) => t.speaker === 'candidate')
  const firstGrill = pending.kind === 'grill' && m.done.length === 0 && turns === 0
  return {
    kind: pending.kind,
    section: pending.section,
    hintAllowed: pending.hintAllowed,
    turnInSection: turns,
    history: s.transcript.map((t) => ({ speaker: t.speaker, text: t.text, phase: t.phase })),
    proctor: {
      directive,
      caps: m.caps,
      grillElapsedMs: m.grillStartedAt ? Math.max(0, now - m.grillStartedAt) : 0,
      budgetMs: m.config.budgetMin * 60_000,
      pushback: pushbackStatus(m),
      lastAnswerLong: lastCandidate !== undefined && lastCandidate.id === m.interruptedAnswerId,
      plan: m.plan,
      done: m.done,
      surfacedFlagIds: [...new Set(s.controlLog.flatMap((e) => e.control.flags_surfaced ?? []))],
      openingLabels: firstGrill ? (s.openingPlan?.considerations.map((c) => c.label) ?? []) : []
    }
  }
}
