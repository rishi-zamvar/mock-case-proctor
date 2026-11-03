// The real LlmPort over @anthropic-ai/sdk (INT-01, INT-06..08, FLOW-02, FLOW-05). Main only.
// One closure per brief: frozen system prefix + private histories, nothing at module scope.
// Logs carry codes and counts only, never candidate, proctor or reply text.
import Anthropic, { APIError, APIUserAbortError } from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type {
  MessageCreateParamsStreaming,
  MessageParam
} from '@anthropic-ai/sdk/resources/messages'
import type { InterviewerBrief } from '../domain/cases/brief'
import type { Logger } from '../log'
import type { HistoryTurn, LlmChunk, LlmUsage, MakeLlm } from '../ports'
import { INTERVIEW_CONTROL_TOOL, parseControl } from './control'
import { assistantTurn, seedFromHistory, textOnlyAssistant, userTurn } from './messages'
import { buildSystem, buildWarmupSystem, proctorNote, warmupNote } from './prompt'
import { EXTRACT_SYSTEM, OpeningPlanSchema, toExtractResult } from './extraction'
import { FALLBACK_LINE, wrapCandidate } from './turnText'
import { createFakeLlm } from '../adapters/fakeLlm'

export const DEFAULT_INTERVIEWER_MODEL = 'claude-opus-5-5'
/** Research Correction 1: 300 truncates the interview_control call. */
export const INTERVIEWER_MAX_TOKENS = 1024

export type ClaudeLlmConfig = { client: Anthropic; model: string; log: Logger }

const lastCandidate = (h: HistoryTurn[]): string | undefined => {
  const t = h[h.length - 1]
  return t?.speaker === 'candidate' ? t.text : undefined
}

const isAbort = (e: unknown, signal: AbortSignal): boolean =>
  e instanceof APIUserAbortError || signal.aborted

export function createClaudeLlm(cfg: ClaudeLlmConfig): MakeLlm {
  const { client, model, log } = cfg

  /** Streams one request; returns the final message, or null if aborted. Never touches history. */
  async function* run(
    params: MessageCreateParamsStreaming,
    signal: AbortSignal,
    tag: string
  ): AsyncGenerator<LlmChunk, Anthropic.Message | null> {
    try {
      const stream = client.messages.stream(params, { signal })
      let texts = 0
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta' && ev.delta.text) {
          texts++
          yield { type: 'text', delta: ev.delta.text }
        }
      }
      const msg = await stream.finalMessage()
      if (texts === 0) {
        log.warn(`${tag}: no spoken text, using fallback`)
        yield { type: 'text', delta: FALLBACK_LINE }
      }
      if (msg.stop_reason === 'max_tokens') log.warn(`${tag}: stop_reason max_tokens`)
      return msg
    } catch (e) {
      if (isAbort(e, signal)) return null
      throw e
    }
  }

  const usageOf = (msg: Anthropic.Message): LlmUsage => ({
    inputTokens: msg.usage.input_tokens,
    outputTokens: msg.usage.output_tokens,
    cacheRead: msg.usage.cache_read_input_tokens ?? 0,
    cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
    stopReason: msg.stop_reason
  })

  /** Only after a completed turn: append the user turn and the raw assistant content. */
  const remember = (msgs: MessageParam[], user: MessageParam, msg: Anthropic.Message): void => {
    const asst = assistantTurn(msg.content)
    msgs.push(user, asst.content.length ? asst : textOnlyAssistant(FALLBACK_LINE))
  }

  return (brief: InterviewerBrief) => {
    const system = buildSystem(brief)
    const flagIds = brief.flags.map.map((f) => f.id)
    const grillMsgs: MessageParam[] = []
    const warmMsgs: MessageParam[] = []
    let pendingToolUseId: string | null = null

    return {
      async *streamTurn(req, signal) {
        const candidate = lastCandidate(req.history)
        if (grillMsgs.length === 0) {
          // Resume after restart: seed text-only from persisted grilling turns (tool ids are gone).
          const prior = req.history
            .slice(0, candidate === undefined ? undefined : -1)
            .filter((t) => t.phase === 'grilling')
          while (prior.length && prior[prior.length - 1].speaker === 'candidate') prior.pop()
          if (prior.length) grillMsgs.push(...seedFromHistory(prior))
        }
        const user = userTurn({
          toolUseId: pendingToolUseId,
          proctor: proctorNote(req, brief),
          candidate
        })
        const params: MessageCreateParamsStreaming = {
          model,
          max_tokens: INTERVIEWER_MAX_TOKENS,
          output_config: { effort: 'low' },
          cache_control: { type: 'ephemeral' },
          system: system as MessageCreateParamsStreaming['system'],
          tools: [INTERVIEW_CONTROL_TOOL],
          tool_choice: { type: 'auto' },
          messages: [...grillMsgs, user],
          stream: true
        }
        const msg = yield* run(params, signal, 'grill')
        // ponytail: an aborted turn's candidate text is not replayed to Claude; Phase 7 barge-in owns partial history.
        if (!msg) return
        remember(grillMsgs, user, msg)
        const tu = msg.content.find(
          (b): b is Anthropic.ToolUseBlock =>
            b.type === 'tool_use' && b.name === INTERVIEW_CONTROL_TOOL.name
        )
        pendingToolUseId = tu?.id ?? null
        const { control, anomalies } = parseControl(tu?.input, { current: req.section, flagIds })
        if (!tu) log.warn('grill: control missing')
        else if (anomalies.length) log.warn(`grill: control anomalies ${anomalies.join(',')}`)
        if (control) yield { type: 'control', payload: control }
        yield { type: 'done', usage: usageOf(msg) }
      },

      async *warmupTurn({ history }, signal) {
        const candidate = lastCandidate(history)
        const n = history.filter((t) => t.speaker === 'candidate').length
        const user = userTurn({ proctor: warmupNote(n), candidate })
        const msg = yield* run(
          {
            model,
            max_tokens: INTERVIEWER_MAX_TOKENS,
            output_config: { effort: 'low' },
            system: buildWarmupSystem(),
            messages: [...warmMsgs, user],
            stream: true
          },
          signal,
          'warmup'
        )
        if (!msg) return
        remember(warmMsgs, user, msg)
        // Warm-up end is code-owned (skip button / 10-min timer): never warmupComplete here.
        yield { type: 'done', usage: usageOf(msg) }
      },

      async extractPlan(opening, signal) {
        try {
          const r = await client.messages.parse(
            {
              model,
              max_tokens: 2048,
              output_config: { effort: 'low', format: zodOutputFormat(OpeningPlanSchema) },
              system: EXTRACT_SYSTEM,
              messages: [{ role: 'user', content: wrapCandidate(opening) }]
            },
            { signal }
          )
          if (!r.parsed_output) log.warn('extraction unparsable: no parsed output')
          return toExtractResult(r.parsed_output)
        } catch (e) {
          if (isAbort(e, signal)) return { order: [] }
          if (e instanceof APIError) throw e
          log.warn('extraction unparsable')
          return { order: [] }
        }
      },

      scoreSession(input, signal) {
        // ponytail: Phase 8 grader replaces this.
        return createFakeLlm()(brief).scoreSession(input, signal)
      }
    }
  }
}
