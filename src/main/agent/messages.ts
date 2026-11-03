// Claude message-history builder (RESEARCH Pattern 3). Stateless; the adapter owns the array.
// Types only from the SDK. checkConversation returns codes, never message text.
import type {
  ContentBlock,
  ContentBlockParam,
  MessageParam
} from '@anthropic-ai/sdk/resources/messages'
import { wrapCandidate } from './turnText'

type Turn = { speaker: 'interviewer' | 'candidate'; text: string }

export function userTurn(o: {
  toolUseId?: string | null
  proctor: string
  candidate?: string
}): MessageParam {
  const content: ContentBlockParam[] = []
  if (o.toolUseId) content.push({ type: 'tool_result', tool_use_id: o.toolUseId, content: 'ok' })
  content.push({ type: 'text', text: o.proctor })
  if (o.candidate) content.push({ type: 'text', text: wrapCandidate(o.candidate) })
  return { role: 'user', content }
}

export function assistantTurn(content: ContentBlock[]): MessageParam {
  const out: ContentBlockParam[] = []
  for (const b of content) {
    if (b.type === 'thinking')
      out.push({ type: 'thinking', thinking: b.thinking, signature: b.signature })
    else if (b.type === 'redacted_thinking') out.push({ type: 'redacted_thinking', data: b.data })
    else if (b.type === 'text' && b.text) out.push({ type: 'text', text: b.text })
    else if (b.type === 'tool_use')
      out.push({ type: 'tool_use', id: b.id, name: b.name, input: b.input })
  }
  return { role: 'assistant', content: out }
}

export function textOnlyAssistant(text: string, interrupted?: boolean): MessageParam {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: text + (interrupted ? ' [interrupted]' : '') }]
  }
}

export function seedFromHistory(turns: Turn[]): MessageParam[] {
  const merged: Turn[] = []
  for (const t of turns) {
    if (!t.text) continue
    const last = merged[merged.length - 1]
    if (last?.speaker === t.speaker) last.text += ' ' + t.text
    else merged.push({ ...t })
  }
  const msgs: MessageParam[] = []
  if (merged[0]?.speaker === 'interviewer') msgs.push(userTurn({ proctor: '(start)' }))
  for (const t of merged) {
    msgs.push(
      t.speaker === 'candidate'
        ? { role: 'user', content: [{ type: 'text', text: wrapCandidate(t.text) }] }
        : textOnlyAssistant(t.text)
    )
  }
  return msgs
}

export function checkConversation(msgs: MessageParam[]): string[] {
  if (msgs.length === 0) return ['empty_conversation']
  const v: string[] = []
  if (msgs[0].role !== 'user') v.push('first_not_user')
  if (msgs[msgs.length - 1].role !== 'user') v.push('last_not_user')
  msgs.forEach((m, i) => {
    if (i > 0 && msgs[i - 1].role === m.role) v.push(`adjacent_roles:${i}`)
    if (typeof m.content === 'string') {
      if (!m.content) v.push(`empty_text:${i}`)
      return
    }
    if (m.content.length === 0) v.push(`empty_content:${i}`)
    const prev = msgs[i - 1]
    const ids = new Set(
      prev?.role === 'assistant' && Array.isArray(prev.content)
        ? prev.content.flatMap((b) => (b.type === 'tool_use' ? [b.id] : []))
        : []
    )
    for (const b of m.content) {
      if (b.type === 'text' && !b.text) v.push(`empty_text:${i}`)
      if (b.type === 'tool_result' && !ids.has(b.tool_use_id)) v.push(`orphan_tool_result:${i}`)
    }
  })
  return v
}
