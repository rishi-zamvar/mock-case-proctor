// IPC contract shared by main, preload and renderer.
// NO runtime imports: the sandboxed preload bundles this file.
export const CH = {
  keyStatus: 'key:status',
  keySave: 'key:save',
  keyClear: 'key:clear',
  libraryList: 'library:list',
  sessionStart: 'session:start',
  sessionIntent: 'session:intent',
  sessionResume: 'session:resume',
  sessionDiscard: 'session:discard',
  speakAck: 'speak:ack',
  speakCancel: 'speak:cancel',
  view: 'view:state',
  speak: 'speak:sentence',
  e2eSay: 'e2e:say',
  sttChunk: 'stt:chunk',
  sttStatus: 'stt:status',
  speakStarted: 'speak:started',
  trendsGet: 'trends:get'
} as const
export type KeySource = 'stored' | 'env' | 'dotenv' | 'none'
export type KeyStatus = { hasKey: boolean; source: KeySource }
export type ProbeResult = 'valid' | 'invalid' | 'unverified'
export type SaveOutcome = ProbeResult | 'unavailable' | 'empty'
export type SaveResult = { status: KeyStatus; result: SaveOutcome }
export type SaveOptions = { force?: boolean }
export interface Api {
  key: {
    status(): Promise<KeyStatus>
    save(key: string, opts?: SaveOptions): Promise<SaveResult>
    clear(): Promise<KeyStatus>
  }
  library: { list(): Promise<LibraryView> }
  session: {
    start(caseId: string, opts: StartOptions): Promise<{ sessionId: string }>
    intent(i: Intent): Promise<void>
    resume(id: string): Promise<{ sessionId: string }>
    discard(id: string): Promise<void>
  }
  config: { tts: TtsMode; stt?: SttMode } // stt optional: old renderer test mocks omit it
  stt?: {
    chunk(answerId: string, idx: number, pcm: Float32Array): Promise<void>
    status(): Promise<SttStatus>
  }
  speak: {
    ack(turnId: string, seq: number, spoken?: boolean): Promise<void>
    started?(turnId: string, seq: number): Promise<void>
  }
  trends?: { get(): Promise<TrendsView> } // optional: old renderer test mocks omit it
  onView(cb: (v: ViewState) => void): () => void
  onSpeak(cb: (s: SpeakEvent) => void): () => void
  onSpeakCancel(cb: (c: SpeakCancel) => void): () => void
}
export type IpcTapEntry = { channel: string; payload: unknown }
export interface E2EHooks {
  micPeak(ms: number): Promise<number>
  say(text: string): Promise<void>
  ipcLog(): IpcTapEntry[]
}
// Candidate-safe case summary: the ONLY case shape that may cross IPC. Never add interviewer fields.
export type CaseCard = {
  id: string
  number: number
  slug: string
  company: string
  vertical: string
  level: number
  intervieweePdfPath: string
}

export type ViewPhase =
  | 'warmup'
  | 'review'
  | 'presentation'
  | 'extraction'
  | 'grilling'
  | 'wrapup'
  | 'scoring'
  | 'reviewMode'
export type Speaker = 'interviewer' | 'candidate'
export type TranscriptLine = { id: string; speaker: Speaker; text: string }
export type SectionView = { id: string; label: string; index: number; total: number }
export const DIMENSION_IDS = [
  'clear_call',
  'lead_edge_8',
  'retention',
  'valuation',
  'back_solve',
  'quality_poise'
] as const
export type DimensionId = (typeof DIMENSION_IDS)[number]
export const DIMENSION_LABELS: Record<DimensionId, string> = {
  clear_call: 'Clear call',
  lead_edge_8: 'Lead Edge 8',
  retention: 'Retention insight',
  valuation: 'Valuation and comps',
  back_solve: 'Return back-solve',
  quality_poise: 'Business quality and poise'
}
export type Band = 'ready' | 'close' | 'another' // 26-30 / 20-25 / <20
export type EvidenceQuote = { quote: string; turnId: string }
export type RubricRow = {
  id: DimensionId
  dimension: string
  score: number // 1-5
  evidence: EvidenceQuote[] // 0-3, verified only
  answerKey: string
  rationale: string
  unverified: boolean
}
export type FlagStatus = 'found' | 'hinted' | 'missed' // 'hinted' = found after a hint
export type FlagRowView = { id: string; flag: string; status: FlagStatus; where: string } // where: deck slide refs, e.g. "S12, A3"
export type BrevityBand = 'short' | 'brief' | 'ideal' | 'long' | 'flagged'
export type ChecksSummary = {
  numbersCorrect: number
  numbersWrong: number
  numbersUnverifiable: number
  brevity: Record<BrevityBand, number>
  avgAnswerMs: number | null
  ledWithCall: boolean
  flagsFound: number
  flagsHinted: number
  flagsTotal: number
}
export type Scorecard = {
  rubric: RubricRow[]
  total: number
  band: Band
  flags: FlagRowView[]
  keep: string
  fix: string
  insight: { calledOut: string[]; missed: string[] }
  summary: string
  evidenceStats: { proposed: number; verified: number; dropped: number }
  checksSummary: ChecksSummary
  graderModel: string
  promptVersion: string
  scoredAt: number
}
export type NumberCheck = {
  claim: string
  matched: string | null
  expected: string | null
  correct: boolean | 'unverifiable'
}
export type Checks = {
  brevity: { turnId: string; ms: number; band: BrevityBand }[]
  ledWithCall: boolean
  omitted: string[]
  numbers: NumberCheck[]
}
export type RevealLine = {
  id: string
  speaker: Speaker
  text: string
  offsetMs: number
  ms: number | null
  section: string | null
}
export type Reveal = {
  scorecard: Scorecard
  checks: Checks
  idealAnswer: string
  opening: string
  keyNumbers: { label: string; text: string }[]
  intendedRead: string
  backSolve: string[]
  transcript: RevealLine[]
}
export type SessionSummary = {
  sessionId: string
  caseId: string
  at: number // scoredAt
  total: number
  band: Band
  dims: Record<DimensionId, number>
  flagFoundRate: number | null
  avgAnswerMs: number | null
  numberAccuracy: number | null
  brevity: Record<BrevityBand, number>
  fix: string
}
export type TrendsInsights = {
  recurringWeaknesses: string[]
  progress: { id: DimensionId; direction: 'up' | 'flat' | 'down'; note: string }[]
  carriedForwardFix: { fix: string; improved: 'yes' | 'no' | 'unclear'; note: string } | null
  nextCase: { caseId: string; why: string } | null
  readiness: string
}
export type TrendsView = {
  status: 'insufficient' | 'ready' | 'failed'
  summaries: SessionSummary[] // oldest first
  insights: TrendsInsights | null
}
// Built ONLY from candidate-safe fields (BAR-01): before reviewMode nothing here can hold brief content.
export type ViewState = {
  sessionId: string
  phase: ViewPhase
  card: CaseCard
  reviewDeadline: number | null // app-clock epoch ms
  clockNow: number // app-clock epoch ms at push time
  timeScale: number // app-clock ms per real ms (1 in production)
  section: SectionView | null
  transcript: TranscriptLine[] // candidate answers + interviewer lines ACTUALLY spoken
  speaking: boolean
  canTalk: boolean
  endedEarly: boolean
  reveal: Reveal | null // non-null ONLY when phase === 'reviewMode'
  deckPage: number // 1-based PDF page of the interviewee deck; 1 when unset
  reviewWarned: boolean
  transcribing?: boolean // optional for test literals; toViewState always sets it
  scoringFailed?: boolean // optional in the type; toViewState always sets it
}
export type LibraryEntry = { card: CaseCard; completed: { at: number; score: number } | null }
export type ResumableSession = {
  sessionId: string
  caseId: string
  company: string
  phase: ViewPhase
}
export type LibraryView = {
  cases: LibraryEntry[]
  resumable: ResumableSession | null
  quarantined: number
  error: string | null
}
export type Intent =
  | { type: 'answer'; ms: number; answerId?: string; chunks?: number }
  | { type: 'bargeIn' }
  | { type: 'ready' }
  | { type: 'skipWarmup' }
  | { type: 'end' }
  | { type: 'deckPage'; page: number }
  | { type: 'retryScore' }
export type StartOptions = { warmup: boolean }
export type SpeakEvent = { turnId: string; seq: number; text: string }
export type TtsMode = 'headtts' | 'fake'
export type SttMode = 'whisper' | 'fake'
export type SttStatus = 'metal' | 'cpu' | 'failed' | 'off'
export type TtsDevice = 'webgpu' | 'wasm' | 'none'
export type SpeakCancel = { turnId: string }
export type AvatarStateName = 'idle' | 'listening' | 'thinking' | 'speaking'
export type SpokenSeq = {
  turnId: string
  seq: number
  visemes: number
  startedAt: number
  endedAt: number | null
}
// Published by the renderer as window.__voice ONLY when '__e2e' in window (contextBridge objects are frozen, so it cannot live on __e2e).
export interface VoiceProbe {
  readonly ttsDevice: TtsDevice | null
  readonly ready: boolean
  readonly isSpeaking: boolean // head.isSpeaking
  readonly visemeCount: number // visemes actually played
  readonly spokenSeqs: SpokenSeq[]
  readonly avatarState: AvatarStateName
  readonly stateLog: AvatarStateName[] // every distinct state transition, in order
  readonly instances: number // TalkingHead constructions this app lifetime
  opaqueFraction(): number // render + readback, 0..1
  audition(voice: string, text: string): Promise<string> // base64 PCM16 LE, 24 kHz mono
}
