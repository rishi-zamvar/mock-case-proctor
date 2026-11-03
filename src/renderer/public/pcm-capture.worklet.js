/* global AudioWorkletProcessor, registerProcessor */
// Copy-only capture worklet: posts 4096-sample Float32Array blocks from the 16 kHz context.
// Must be a real same-origin file (blob: worklets are CSP-blocked). Never logs audio.
class Cap extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Float32Array(4096)
    this.n = 0
    this.port.onmessage = (e) => {
      if (e.data && e.data.flush) {
        this.port.postMessage({ final: this.buf.slice(0, this.n) })
        this.n = 0
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  process(inputs) {
    const ch = inputs[0][0]
    if (ch)
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i]
        if (this.n === this.buf.length) {
          this.port.postMessage(this.buf)
          this.buf = new Float32Array(4096)
          this.n = 0
        }
      }
    return true
  }
}
registerProcessor('pcm-capture', Cap)
