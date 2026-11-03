import { useEffect, useRef, useState } from 'react'
import type { GetMedia } from './MicCheck'
import styles from './media.module.css'

type Props = { on: boolean; label?: string; getUserMedia?: GetMedia }

const defaultGetMedia = (): GetMedia | undefined =>
  navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)

/** Mirrored self-view. Own video-only stream; never recorded, never persisted. */
export default function WebcamTile(props: Props): React.JSX.Element {
  const { on, label = 'You' } = props
  const getUserMedia = 'getUserMedia' in props ? props.getUserMedia : defaultGetMedia()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [live, setLive] = useState<boolean | null>(null) // null = waiting on the camera

  useEffect(() => {
    if (!on || !getUserMedia) return
    let cancelled = false
    let stream: MediaStream | null = null
    getUserMedia({ video: { width: 640, height: 360 } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        if (videoRef.current) videoRef.current.srcObject = s
        setLive(true)
      })
      .catch(() => {
        if (!cancelled) setLive(false)
      })
    const video = videoRef.current
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
      if (video) video.srcObject = null
      setLive(null)
    }
    // getUserMedia is a fixed seam for the component's life
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on])

  const state = !on || !getUserMedia || live === false ? 'off' : live ? 'live' : 'loading'

  return (
    <div data-testid="webcam-tile" data-state={state} className={styles.tile}>
      <video
        ref={videoRef}
        data-testid="webcam-video"
        className={`${styles.video} ${styles.mirror}`}
        autoPlay
        muted
        playsInline
        hidden={state === 'off'}
      />
      {state === 'off' && (
        <p data-testid="camera-off" className={styles.off}>
          Camera off
        </p>
      )}
      <span className={styles.label}>{label}</span>
    </div>
  )
}
