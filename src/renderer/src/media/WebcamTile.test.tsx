import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import WebcamTile from './WebcamTile'
import type { GetMedia } from './MicCheck'

function fakeStream(): { stream: MediaStream; stop: ReturnType<typeof vi.fn> } {
  const stop = vi.fn()
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
  return { stream, stop }
}

const flush = (): Promise<void> => act(async () => {})
const tile = (): HTMLElement => screen.getByTestId('webcam-tile')
const video = (): HTMLVideoElement => screen.getByTestId('webcam-video') as HTMLVideoElement

describe('WebcamTile', () => {
  it('given on, when the camera opens, then a mirrored video-only 640x360 stream goes live labelled You', async () => {
    const { stream } = fakeStream()
    let resolve!: (s: MediaStream) => void
    const gum = vi.fn<GetMedia>(() => new Promise<MediaStream>((r) => (resolve = r)))
    render(<WebcamTile on getUserMedia={gum} />)
    expect(tile().getAttribute('data-state')).toBe('loading')
    await act(async () => resolve(stream))
    expect(gum).toHaveBeenCalledTimes(1)
    expect(gum).toHaveBeenCalledWith({ video: { width: 640, height: 360 } })
    expect(gum.mock.calls[0][0]).not.toHaveProperty('audio')
    expect(tile().getAttribute('data-state')).toBe('live')
    expect(video().srcObject).toBe(stream)
    expect(video().className).toMatch(/mirror/)
    expect(video().muted).toBe(true)
    expect(tile().textContent).toContain('You')
  })

  it('given a label prop, when rendered, then that label shows', async () => {
    render(
      <WebcamTile on getUserMedia={() => Promise.resolve(fakeStream().stream)} label="Rishi" />
    )
    await flush()
    expect(tile().textContent).toContain('Rishi')
  })

  it.each([['NotAllowedError'], ['NotFoundError']])(
    'given getUserMedia rejects with %s, when on, then a calm Camera off shows',
    async (name) => {
      render(<WebcamTile on getUserMedia={() => Promise.reject(new DOMException('x', name))} />)
      await flush()
      expect(tile().getAttribute('data-state')).toBe('off')
      expect(screen.getByTestId('camera-off').textContent).toContain('Camera off')
    }
  )

  it('given no getUserMedia, when on, then it is off without throwing', async () => {
    render(<WebcamTile on getUserMedia={undefined} />)
    await flush()
    expect(tile().getAttribute('data-state')).toBe('off')
  })

  it('given off, when rendered, then the camera is never requested', async () => {
    const gum = vi.fn()
    render(<WebcamTile on={false} getUserMedia={gum} />)
    await flush()
    expect(gum).not.toHaveBeenCalled()
    expect(tile().getAttribute('data-state')).toBe('off')
  })

  it('given a live camera, when turned off, then tracks stop and srcObject clears', async () => {
    const { stream, stop } = fakeStream()
    const gum = (): Promise<MediaStream> => Promise.resolve(stream)
    const { rerender } = render(<WebcamTile on getUserMedia={gum} />)
    await flush()
    const v = video()
    rerender(<WebcamTile on={false} getUserMedia={gum} />)
    await flush()
    expect(stop).toHaveBeenCalledTimes(1)
    expect(v.srcObject).toBeNull()
    expect(tile().getAttribute('data-state')).toBe('off')
    // The .video class sets display:block, which beats [hidden]; off must remove the element.
    expect(screen.queryByTestId('webcam-video')).toBeNull()
  })

  it('given a live camera, when unmounted, then tracks stop', async () => {
    const { stream, stop } = fakeStream()
    const { unmount } = render(<WebcamTile on getUserMedia={() => Promise.resolve(stream)} />)
    await flush()
    unmount()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('given unmount before resolve, when the stream arrives, then its tracks stop', async () => {
    const { stream, stop } = fakeStream()
    let resolve!: (s: MediaStream) => void
    const { unmount } = render(
      <WebcamTile on getUserMedia={() => new Promise((r) => (resolve = r))} />
    )
    unmount()
    await act(async () => resolve(stream))
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
