import { useEffect, useRef, useState } from 'react'
import { avatarState, type AvatarBinding } from './behaviour'
import s from './AvatarStage.module.css'

export type AvatarStageProps = {
  speaking: boolean // view.speaking (drives the speaking-ring)
  listening: boolean // Session's `recording`
  waiting: boolean // awaitingReply(view)
  avatar?: AvatarBinding // absent in fake mode
}

export default function AvatarStage({
  speaking,
  listening,
  waiting,
  avatar
}: AvatarStageProps): React.JSX.Element {
  const slot = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(() => avatar?.isPlaying() ?? false)

  // One persistent host: moved into this slot on mount, detached (not destroyed) on unmount.
  useEffect(() => {
    if (!avatar || !slot.current) return
    slot.current.appendChild(avatar.host)
    avatar.setVisible(true)
    setPlaying(avatar.isPlaying())
    const off = avatar.onPlaying(setPlaying)
    return () => {
      off()
      avatar.setVisible(false)
      avatar.host.remove()
    }
  }, [avatar])

  const state = avatarState({ playing: !!avatar && playing, listening, awaitingReply: waiting })
  useEffect(() => avatar?.setState(state), [avatar, state])

  const ring = (
    <div
      data-testid="speaking-ring"
      data-speaking={String(speaking)}
      className={s.ring}
      aria-hidden="true"
    />
  )

  if (!avatar)
    return (
      <div data-testid="avatar-stage" data-avatar-state={state} className={s.placeholder}>
        {ring}
        <span>Interviewer</span>
      </div>
    )

  return (
    <div data-testid="avatar-stage" data-avatar-state={state} className={s.stage}>
      <div data-testid="avatar-slot" ref={slot} className={s.slot} />
      {state === 'thinking' && (
        <div
          data-testid="thinking-indicator"
          role="status"
          aria-label="Interviewer is thinking"
          className={s.thinking}
        >
          …
        </div>
      )}
      <div className={s.tag}>
        {ring}
        <span>Interviewer</span>
      </div>
    </div>
  )
}
