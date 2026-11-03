import type { ViewPhase } from '../../../shared/ipc'

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking'

/** Priority: playing > listening > awaiting reply > idle. */
export function avatarState(i: {
  playing: boolean
  listening: boolean
  awaitingReply: boolean
}): AvatarState {
  if (i.playing) return 'speaking'
  if (i.listening) return 'listening'
  return i.awaitingReply ? 'thinking' : 'idle'
}

/** Extraction (deck read-back) or an in-flight LLM turn both mean the partner owes a reply. */
export function awaitingReply(v: { phase: ViewPhase; speaking: boolean }): boolean {
  return v.phase === 'extraction' || v.speaking
}

export function shouldRun(i: { visible: boolean; playing: boolean }): boolean {
  return i.visible || i.playing
}

export type StatePlan = {
  eyeContactMs: number
  nodEveryMs: readonly [number, number] | null
  emoji: 'yes' | '🤔' | null
  lookAside: boolean
}

// emoji is played via animQueue/animFactory(animEmojis[...]), never speakEmoji (it flips isSpeaking).
export const STATE_PLAN: Record<AvatarState, StatePlan> = {
  idle: { eyeContactMs: 2000, nodEveryMs: null, emoji: null, lookAside: false },
  listening: { eyeContactMs: 2000, nodEveryMs: [4000, 7000], emoji: 'yes', lookAside: false },
  thinking: { eyeContactMs: 0, nodEveryMs: null, emoji: '🤔', lookAside: true },
  speaking: { eyeContactMs: 0, nodEveryMs: null, emoji: null, lookAside: false } // TalkingHead drives it
}

// What AvatarStage (05-06) needs from the voice runtime (05-05 implements it):
export type AvatarBinding = {
  host: HTMLElement // the one persistent TalkingHead container
  setVisible(v: boolean): void // stage mounted (true) / unmounted (false)
  setState(s: AvatarState): void
  isPlaying(): boolean
  onPlaying(cb: (playing: boolean) => void): () => void
}
