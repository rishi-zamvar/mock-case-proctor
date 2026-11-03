import { describe, it, expect, vi, type Mock } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import AvatarStage from './AvatarStage'
import type { AvatarBinding, AvatarState } from './behaviour'

type FakeAvatar = AvatarBinding & {
  setVisible: Mock<(v: boolean) => void>
  setState: Mock<(s: AvatarState) => void>
  emitPlaying(p: boolean): void
}

function fakeAvatar(): FakeAvatar {
  const host = document.createElement('div')
  host.dataset.testid = 'avatar-host'
  const subs = new Set<(p: boolean) => void>()
  let playing = false
  return {
    host,
    setVisible: vi.fn<(v: boolean) => void>(),
    setState: vi.fn<(s: AvatarState) => void>(),
    isPlaying: () => playing,
    onPlaying: (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    emitPlaying(p) {
      playing = p
      subs.forEach((cb) => cb(p))
    }
  }
}

const base = { speaking: false, listening: false, waiting: false }
const id = (s: string): HTMLElement => screen.getByTestId(s)
const q = (s: string): HTMLElement | null => screen.queryByTestId(s)

describe('AvatarStage', () => {
  it('given no avatar, when rendered, then it shows the T1 placeholder markup only', () => {
    render(<AvatarStage {...base} speaking />)
    expect(id('avatar-stage').textContent).toContain('Interviewer')
    expect(id('speaking-ring').getAttribute('data-speaking')).toBe('true')
    expect(q('thinking-indicator')).toBeNull()
    expect(q('avatar-slot')).toBeNull()
  })

  it('given an avatar, when mounted and unmounted, then the host is attached then detached', () => {
    const a = fakeAvatar()
    const { unmount } = render(<AvatarStage {...base} avatar={a} />)
    expect(a.host.parentElement).toBe(id('avatar-slot'))
    expect(a.setVisible).toHaveBeenLastCalledWith(true)
    unmount()
    expect(a.setVisible).toHaveBeenLastCalledWith(false)
    expect(document.contains(a.host)).toBe(false)
  })

  it('given an avatar, when remounted, then the same host is re-attached', () => {
    const a = fakeAvatar()
    const host = a.host
    render(<AvatarStage {...base} avatar={a} />).unmount()
    render(<AvatarStage {...base} avatar={a} />)
    expect(id('avatar-slot').firstChild).toBe(host)
  })

  it('given session inputs, when they change, then the avatar state follows', () => {
    const a = fakeAvatar()
    const { rerender } = render(<AvatarStage {...base} avatar={a} />)
    expect(a.setState).toHaveBeenLastCalledWith('idle')
    expect(id('avatar-stage').dataset.avatarState).toBe('idle')

    rerender(<AvatarStage {...base} listening avatar={a} />)
    expect(a.setState).toHaveBeenLastCalledWith('listening')

    rerender(<AvatarStage {...base} waiting avatar={a} />)
    expect(a.setState).toHaveBeenLastCalledWith('thinking')
    const ind = id('thinking-indicator')
    expect(ind.getAttribute('aria-label')).toBe('Interviewer is thinking')
    expect(ind.textContent).toBe('…')

    act(() => a.emitPlaying(true))
    expect(a.setState).toHaveBeenLastCalledWith('speaking')
    expect(id('avatar-stage').dataset.avatarState).toBe('speaking')
    expect(q('thinking-indicator')).toBeNull()

    act(() => a.emitPlaying(false))
    rerender(<AvatarStage {...base} avatar={a} />)
    expect(a.setState).toHaveBeenLastCalledWith('idle')
  })

  it('given audio already playing, when mounted, then the state starts as speaking', () => {
    const a = fakeAvatar()
    a.emitPlaying(true)
    render(<AvatarStage {...base} avatar={a} />)
    expect(a.setState).toHaveBeenLastCalledWith('speaking')
  })
})
