// Port contracts (types only). Each port has a real and a fake adapter; compose.ts picks one.
import type { InterviewControl } from '../domain/machine/interviewMachine'
import type { SectionId } from '../domain/machine/sections'
import type { InterviewerBrief } from '../domain/cases/brief'
import type { Scorecard } from '../../shared/ipc'
import type { Turn } from '../store/sessionSchema'

export type LlmChunk =
  | { type: 'text'; delta: string }
  | { type: 'control'; payload: InterviewControl }
  | { type: 'done'; warmupComplete?: boolean }
export type HistoryTurn = { speaker: 'interviewer' | 'candidate'; text: string }
export type TurnRequest = {
  kind: 'grill' | 'wrapup'
  section?: SectionId
  hintAllowed?: boolean
  turnInSection: number
  history: HistoryTurn[]
}
export type ScoreInput = {
  transcript: Turn[]
  controlLog: { at: number; turnId: string; control: InterviewControl }[]
  endedEarly: boolean
  omitted: SectionId[]
}
export interface LlmPort {
  warmupTurn(req: { history: HistoryTurn[] }, signal: AbortSignal): AsyncIterable<LlmChunk>
  streamTurn(req: TurnRequest, signal: AbortSignal): AsyncIterable<LlmChunk>
  extractPlan(opening: string, signal: AbortSignal): Promise<{ order: string[] }>
  scoreSession(input: ScoreInput, signal: AbortSignal): Promise<Scorecard>
}
/** One interviewer per case session (INT-08): the brief is bound at construction, never shared across sessions. */
export type MakeLlm = (brief: InterviewerBrief) => LlmPort
export interface SttPort {
  transcribe(pcm16k: Float32Array): Promise<{ text: string }>
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
