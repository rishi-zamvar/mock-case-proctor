import { STATE_PLAN, shouldRun, type AvatarState } from './behaviour'

// The slice of TalkingHead 1.8.2 the state/run-gating logic drives (pure: no three, no WebGL).
export type CoreHead = {
  start(): void
  stop(): void
  onResize?(): void
  makeEyeContact(ms: number): void
  lookAhead(ms: number): void
  animQueue: unknown[]
  animFactory(t: unknown): unknown
  animEmojis: Record<string, unknown>
}

export type AvatarCore = {
  onReady(): void // showAvatar resolved (it already called start())
  setVisible(v: boolean): void
  setPlaying(p: boolean): void
  setState(s: AvatarState): void
  state(): AvatarState
  stateLog(): AvatarState[]
}

export function createAvatarCore(
  head: CoreHead,
  o: { raf?: (f: () => void) => unknown; random?: () => number } = {}
): AvatarCore {
  const raf = o.raf ?? ((f: () => void) => requestAnimationFrame(f))
  const random = o.random ?? Math.random
  let ready = false
  let running = false
  let visible = false
  let playing = false
  let current: AvatarState = 'idle'
  const log: AvatarState[] = []
  let nod: ReturnType<typeof setInterval> | null = null

  const gate = (): void => {
    if (!ready) return
    const want = shouldRun({ visible, playing })
    if (want === running) return
    running = want
    if (want) head.start()
    else head.stop()
  }
  const emoji = (name: string): void => {
    head.animQueue.push(head.animFactory(head.animEmojis[name]))
  }

  return {
    onReady() {
      ready = true
      running = true
      gate()
    },
    setVisible(v) {
      const shown = v && !visible
      visible = v
      gate()
      if (shown && ready) raf(() => head.onResize?.())
    },
    setPlaying(p) {
      playing = p
      gate()
    },
    setState(s) {
      if (s === current) return
      current = s
      log.push(s)
      if (nod !== null) clearInterval(nod)
      nod = null
      const plan = STATE_PLAN[s]
      if (plan.eyeContactMs > 0) head.makeEyeContact(plan.eyeContactMs)
      if (plan.lookAside) head.lookAhead(800)
      if (plan.nodEveryMs) {
        const [lo, hi] = plan.nodEveryMs
        nod = setInterval(() => emoji('yes'), lo + random() * (hi - lo))
      } else if (plan.emoji) emoji(plan.emoji)
    },
    state: () => current,
    stateLog: () => [...log]
  }
}
