import { describe, it, expect } from 'vitest'
import { avatarState, awaitingReply, shouldRun, STATE_PLAN } from './behaviour'

describe('avatarState', () => {
  const cases: [boolean, boolean, boolean, string][] = [
    [false, false, false, 'idle'],
    [false, false, true, 'thinking'],
    [false, true, false, 'listening'],
    [false, true, true, 'listening'],
    [true, false, false, 'speaking'],
    [true, false, true, 'speaking'],
    [true, true, false, 'speaking'],
    [true, true, true, 'speaking']
  ]
  it.each(cases)(
    'given playing=%s listening=%s awaitingReply=%s, when mapped, then %s',
    (playing, listening, awaiting, want) => {
      expect(avatarState({ playing, listening, awaitingReply: awaiting })).toBe(want)
    }
  )
})

describe('awaitingReply', () => {
  it('given extraction or an in-flight turn, when checked, then true; otherwise false', () => {
    expect(awaitingReply({ phase: 'extraction', speaking: false })).toBe(true)
    expect(awaitingReply({ phase: 'grilling', speaking: true })).toBe(true)
    expect(awaitingReply({ phase: 'grilling', speaking: false })).toBe(false)
    expect(awaitingReply({ phase: 'review', speaking: false })).toBe(false)
  })
})

describe('shouldRun', () => {
  it('given visibility and playback, when gated, then runs iff visible or playing', () => {
    expect(shouldRun({ visible: false, playing: false })).toBe(false)
    expect(shouldRun({ visible: true, playing: false })).toBe(true)
    expect(shouldRun({ visible: false, playing: true })).toBe(true)
    expect(shouldRun({ visible: true, playing: true })).toBe(true)
  })
})

describe('STATE_PLAN', () => {
  it('given each state, when planned, then listening nods, thinking looks aside, idle/speaking stay quiet', () => {
    const [lo, hi] = STATE_PLAN.listening.nodEveryMs!
    expect(lo).toBeGreaterThanOrEqual(3000)
    expect(hi).toBeLessThanOrEqual(8000)
    expect(lo).toBeLessThanOrEqual(hi)
    expect(STATE_PLAN.listening.emoji).toBe('yes')
    expect(STATE_PLAN.thinking.lookAside).toBe(true)
    expect(STATE_PLAN.thinking.emoji).toBe('🤔')
    for (const s of ['idle', 'speaking'] as const) {
      expect(STATE_PLAN[s].emoji).toBeNull()
      expect(STATE_PLAN[s].nodEveryMs).toBeNull()
    }
  })
})
