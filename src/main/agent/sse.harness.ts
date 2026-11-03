// Test-only: a `fetch` stub for `new Anthropic({ fetch })` that streams real Anthropic SSE, so the
// real SDK MessageStream parses it (no MSW/nock, no SDK patching). Optional per-event delay for
// abort tests (Pitfall 8). Each call pops the next scripted response; `requests` keeps the bodies.
type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

let seq = 0

export function sseEvents(o: {
  thinking?: boolean
  text: string[]
  control?: object | null
  usage?: Usage
  stopReason?: string
  toolUseId?: string
}): string[] {
  const id = o.toolUseId ?? `toolu_${++seq}`
  const usage = {
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    ...o.usage
  }
  const ev: [string, object][] = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: `msg_${id}`,
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { ...usage, output_tokens: 1 }
        }
      }
    ]
  ]
  let index = 0
  const block = (start: object, deltas: object[]): void => {
    ev.push(['content_block_start', { type: 'content_block_start', index, content_block: start }])
    for (const delta of deltas)
      ev.push(['content_block_delta', { type: 'content_block_delta', index, delta }])
    ev.push(['content_block_stop', { type: 'content_block_stop', index }])
    index++
  }
  if (o.thinking !== false)
    block({ type: 'thinking', thinking: '', signature: '' }, [
      { type: 'thinking_delta', thinking: '' },
      { type: 'signature_delta', signature: 'sig_abc' }
    ])
  if (o.text.length)
    block(
      { type: 'text', text: '' },
      o.text.map((t) => ({ type: 'text_delta', text: t }))
    )
  if (o.control) {
    const json = JSON.stringify(o.control)
    const mid = Math.floor(json.length / 2)
    block({ type: 'tool_use', id, name: 'interview_control', input: {} }, [
      { type: 'input_json_delta', partial_json: json.slice(0, mid) },
      { type: 'input_json_delta', partial_json: json.slice(mid) }
    ])
  }
  ev.push([
    'message_delta',
    {
      type: 'message_delta',
      delta: {
        stop_reason: o.stopReason ?? (o.control ? 'tool_use' : 'end_turn'),
        stop_sequence: null
      },
      usage
    }
  ])
  ev.push(['message_stop', { type: 'message_stop' }])
  return ev.map(([t, d]) => `event: ${t}\ndata: ${JSON.stringify(d)}\n\n`)
}

/** A non-stream JSON response (for messages.parse) is passed as a one-element array starting with '{'. */
export function sseFetch(
  responses: string[][],
  opts: { delayMs?: number } = {}
): { fetch: typeof globalThis.fetch; requests: Record<string, unknown>[] } {
  const requests: Record<string, unknown>[] = []
  const queue = [...responses]
  const fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)))
    const events = queue.shift()
    if (!events) throw new Error('sseFetch: no scripted response left')
    if (events.length === 1 && events[0].startsWith('{'))
      return new Response(events[0], { headers: { 'content-type': 'application/json' } })
    const signal = init?.signal
    const enc = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      async start(c) {
        for (const e of events) {
          if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs))
          if (signal?.aborted) {
            c.error(signal.reason ?? new DOMException('aborted', 'AbortError'))
            return
          }
          c.enqueue(enc.encode(e))
        }
        c.close()
      }
    })
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
  }) as typeof globalThis.fetch
  return { fetch, requests }
}

/** A stubbed non-stream messages response whose text content is `text`. */
export function jsonMessage(text: string): string[] {
  return [
    JSON.stringify({
      id: 'msg_json',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 }
    })
  ]
}
