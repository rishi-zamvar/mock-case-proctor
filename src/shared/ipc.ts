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
  e2eSay: 'e2e:say'
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
  config: { tts: TtsMode }
  speak: { ack(turnId: string, seq: number, spoken?: boolean): Promise<void> }
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
export type RubricRow = { dimension: string; score: number; evidence: string; answerKey: string }
export type FlagStatus = 'found' | 'hinted' | 'missed'
export type FlagRowView = { id: string; flag: string; status: FlagStatus }
export type Scorecard = {
  rubric: RubricRow[]
  total: number
  band: 'strong' | 'average' | 'weak'
  flags: FlagRowView[]
  graderModel: string
  promptVersion: string
}
export type BrevityBand = 'short' | 'brief' | 'ideal' | 'long' | 'flagged'
export type Checks = {
  brevity: { turnId: string; ms: number; band: BrevityBand }[]
  ledWithCall: boolean
  omitted: string[]
  numbers: { said: string; expected: string; ok: boolean }[]
}
export type Reveal = {
  scorecard: Scorecard
  checks: Checks
  idealAnswer: string
  opening: string
  keyNumbers: { label: string; text: string }[]
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
  | { type: 'answer'; ms: number }
  | { type: 'ready' }
  | { type: 'skipWarmup' }
  | { type: 'end' }
  | { type: 'deckPage'; page: number }
export type StartOptions = { warmup: boolean }
export type SpeakEvent = { turnId: string; seq: number; text: string }
export type TtsMode = 'headtts' | 'fake'
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
