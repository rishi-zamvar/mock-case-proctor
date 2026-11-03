// Pre-whisper voiced-frame gate (VIN-04). Whisper hallucinates on silence; never send it audio this rejects.
export const FRAME = 320 // 20 ms @ 16 kHz
export const VOICED_RMS = 0.02 // ponytail: absolute threshold; make it relative to the noise floor if AGC rooms trip it
export const MIN_VOICED_MS = 400

/** Milliseconds of 20 ms frames whose RMS exceeds `rms`. A partial trailing frame is ignored. */
export function voicedMs(pcm: Float32Array, rms = VOICED_RMS): number {
  let v = 0
  for (let i = 0; i + FRAME <= pcm.length; i += FRAME) {
    let e = 0
    for (let j = 0; j < FRAME; j++) e += pcm[i + j] ** 2
    if (Math.sqrt(e / FRAME) > rms) v++
  }
  return v * 20
}
