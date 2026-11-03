// Port contracts (types only). Each port has a real and a fake adapter; compose.ts picks one.
import type { InterviewControl, Phase } from '../domain/machine/interviewMachine'
import type { SectionId } from '../domain/machine/sections'
import type { InterviewerBrief } from '../domain/cases/brief'
import type { Scorecard } from '../../shared/ipc'
import type { Turn } from '../store/sessionSchema'

export type LlmChunk =
  | { type: 'text'; delta: string }
  | { type: 'control'; payload: InterviewControl }
  | { type: 'done'; warmupComplete?: boolean; usage?: LlmUsage }
export type LlmUsage = {
  inputTokens: number
  outputTokens: number
  cacheRead: number
  cacheWrite: number
  stopReason: string | null
}
export type HistoryTurn = { speaker: 'interviewer' | 'candidate'; text: string; phase?: Phase }
/** Code-owned flow facts the prompt states to the model each grilling turn. */
export type ProctorFacts = {
  directive: 'framing' | 'probe' | 'wrap_section' | 'wrapup'
  caps: { soft: number; hard: number } | null
  grillElapsedMs: number
  budgetMs: number
  pushback: 'not_yet' | 'now' | 'done'
  lastAnswerLong: boolean
  plan: SectionId[]
  done: SectionId[]
  surfacedFlagIds: string[]
  /** Non-empty only on the very first grilling turn. */
  openingLabels: string[]
}
export type TurnRequest = {
  kind: 'grill' | 'wrapup'
  section?: SectionId
  hintAllowed?: boolean
  turnInSection: number
  history: HistoryTurn[]
  proctor?: ProctorFacts
}
export type OpeningPlan = {
  recap: string
  recommendation: 'invest' | 'pass' | 'invest_at_price' | 'unclear'
  price: string | null
  considerations: { label: string; section_id: SectionId; stance: 'for' | 'against' }[]
  order: SectionId[]
}
export type ScoreInput = {
  transcript: Turn[]
  controlLog: { at: number; turnId: string; control: InterviewControl }[]
  endedEarly: boolean
  omitted: SectionId[]
  openingPlan?: OpeningPlan
  at: number // app-clock ms; becomes scoredAt
}
export interface LlmPort {
  warmupTurn(req: { history: HistoryTurn[] }, signal: AbortSignal): AsyncIterable<LlmChunk>
  streamTurn(req: TurnRequest, signal: AbortSignal): AsyncIterable<LlmChunk>
  extractPlan(
    opening: string,
    signal: AbortSignal
  ): Promise<{ order: string[]; plan?: OpeningPlan }>
  scoreSession(input: ScoreInput, signal: AbortSignal): Promise<Scorecard>
  /** Barge-in: the candidate cut the last warm-up/grill turn off. spokenText = only the sentences actually heard ('' if none). */
  interrupted?(spokenText: string): void
}
/** One interviewer per case session (INT-08): the brief is bound at construction, never shared across sessions. */
export type MakeLlm = (brief: InterviewerBrief) => LlmPort
export type SttResult = { text: string; noAnswer?: boolean; voicedMs?: number }
export interface SttPort {
  transcribe(pcm16k: Float32Array, o?: { prompt?: string }): Promise<SttResult>
}
/** Keeps the display awake during a session; Electron powerSaveBlocker in prod. */
export interface AwakePort {
  hold(): void
  release(): void
}
export interface ClockPort {
  now(): number
  setTimer(at: number, cb: () => void): () => void
  readonly scale: number
}
