import { useEffect, useState } from 'react'
import { measure, createSilenceWatch, SILENCE_RMS, SILENCE_MS } from './level'
import styles from './media.module.css'

export type GetMedia = (c: MediaStreamConstraints) => Promise<MediaStream>
export type Meter = { read(): { rms: number; peak: number }; close(): void }

type Props = {
  getUserMedia?: GetMedia
  createMeter?: (s: MediaStream) => Meter
  now?: () => number
}

const POLL_MS = 50

function defaultMeter(stream: MediaStream): Meter {
  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  ctx.createMediaStreamSource(stream).connect(analyser)
  const buf = new Float32Array(analyser.fftSize)
  return {
    read: () => {
      analyser.getFloatTimeDomainData(buf)
      return measure(buf)
    },
    close: () => void ctx.close()
  }
}

const defaultGetMedia = (): GetMedia | undefined =>
  navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)

export default function MicCheck(props: Props): React.JSX.Element {
  const getUserMedia = 'getUserMedia' in props ? props.getUserMedia : defaultGetMedia()
  const createMeter = props.createMeter ?? defaultMeter
  const now = props.now ?? (() => performance.now())
  const [status, setStatus] = useState<'loading' | 'live' | 'unavailable'>(
    getUserMedia ? 'loading' : 'unavailable'
  )
  const [level, setLevel] = useState({ rms: 0, peak: 0, silent: false })

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null
    let meter: Meter | null = null
    let timer: ReturnType<typeof setInterval> | undefined
    if (!getUserMedia) return
    getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        meter = createMeter(s)
        setStatus('live')
        const silent = createSilenceWatch({ threshold: SILENCE_RMS, ms: SILENCE_MS })
        timer = setInterval(() => {
          const { rms, peak } = meter!.read()
          const isSilent = silent(rms, now())
          setLevel((p) => ({ rms, peak: Math.max(p.peak, peak), silent: isSilent }))
        }, POLL_MS)
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable')
      })
    return () => {
      cancelled = true
      clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
      meter?.close()
    }
    // mount-only: the injected seams are fixed for the component's life
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div data-testid="mic-check" className={styles.micCheck}>
      <label htmlFor="mic-level">Say something to test your mic</label>
      <meter
        id="mic-level"
        data-testid="mic-level"
        className={styles.meter}
        min={0}
        max={1}
        value={level.rms}
        data-level={level.rms.toFixed(2)}
        data-peak={level.peak.toFixed(2)}
      />
      {status === 'unavailable' && (
        <p data-testid="mic-unavailable" role="status" className={styles.note}>
          Microphone unavailable — check System Settings › Privacy &amp; Security
        </p>
      )}
      {status === 'live' && level.silent && (
        <p data-testid="mic-silent" role="status" className={styles.note}>
          We can&apos;t hear you — check your mic
        </p>
      )}
    </div>
  )
}
