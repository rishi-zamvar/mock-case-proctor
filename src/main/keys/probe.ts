import Anthropic, {
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError
} from '@anthropic-ai/sdk'
import type { ProbeResult } from '../../shared/ipc'

export const PROBE_MODEL = 'claude-haiku-5-5'

/** One 1-token request. Never logs the key. */
export async function probeKey(
  apiKey: string,
  opts: { baseURL?: string; fetch?: typeof fetch; timeout?: number } = {}
): Promise<ProbeResult> {
  const client = new Anthropic({
    apiKey,
    maxRetries: 0,
    timeout: opts.timeout ?? 10_000,
    ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    ...(opts.fetch ? { fetch: opts.fetch } : {})
  })
  try {
    await client.messages.create({
      model: PROBE_MODEL,
      max_tokens: 1,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: 'ping' }]
    })
    return 'valid'
  } catch (e) {
    if (e instanceof AuthenticationError || e instanceof PermissionDeniedError) return 'invalid'
    if (e instanceof RateLimitError) return 'valid'
    return 'unverified'
  }
}
