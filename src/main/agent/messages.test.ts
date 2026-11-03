import { describe, expect, it } from 'vitest'
import type {
  ContentBlock,
  ContentBlockParam,
  MessageParam
} from '@anthropic-ai/sdk/resources/messages'
import {
  assistantTurn,
  checkConversation,
  seedFromHistory,
  textOnlyAssistant,
  userTurn
} from './messages'

const blocks = (m: MessageParam): Array<Record<string, unknown>> =>
  m.content as unknown as Array<Record<string, unknown>>

const resp = (b: unknown[]): ContentBlock[] => b as ContentBlock[]

describe('userTurn', () => {
  it('given a tool id and candidate text, when built, then tool_result, proctor, wrapped candidate in order', () => {
    const m = userTurn({ toolUseId: 'tu_1', proctor: '<proctor>x</proctor>', candidate: 'hi' })
    expect(m.role).toBe('user')
    expect(m.content).toEqual([
      { type: 'tool_result', tool_use_id: 'tu_1', content: 'ok' },
      { type: 'text', text: '<proctor>x</proctor>' },
      { type: 'text', text: '<candidate_said>hi</candidate_said>' }
    ])
  })

  it('given no tool id and an empty candidate, when built, then only the proctor block', () => {
    expect(userTurn({ proctor: 'p', candidate: '' }).content).toEqual([{ type: 'text', text: 'p' }])
    expect(userTurn({ toolUseId: null, proctor: 'p' }).content).toEqual([
      { type: 'text', text: 'p' }
    ])
  })
})

describe('assistantTurn', () => {
  it('given thinking, text, tool_use and an empty text, when mapped, then three blocks kept verbatim', () => {
    const m = assistantTurn(
      resp([
        { type: 'thinking', thinking: 'hmm', signature: 'sig' },
        { type: 'text', text: 'Hello.', citations: null },
        { type: 'text', text: '', citations: null },
        { type: 'redacted_thinking', data: 'enc' },
        { type: 'tool_use', id: 'tu_9', name: 'interview_control', input: { a: 1 }, caller: {} },
        { type: 'server_tool_use', id: 'x', name: 'web_search', input: {} }
      ])
    )
    expect(m.role).toBe('assistant')
    expect(m.content).toEqual([
      { type: 'thinking', thinking: 'hmm', signature: 'sig' },
      { type: 'text', text: 'Hello.' },
      { type: 'redacted_thinking', data: 'enc' },
      { type: 'tool_use', id: 'tu_9', name: 'interview_control', input: { a: 1 } }
    ])
  })
})

describe('textOnlyAssistant', () => {
  it('given interrupted, when built, then the text is suffixed', () => {
    expect(blocks(textOnlyAssistant('First sentence.', true))[0].text).toBe(
      'First sentence. [interrupted]'
    )
    expect(blocks(textOnlyAssistant('Done.'))[0].text).toBe('Done.')
  })
})

describe('seedFromHistory', () => {
  it('given a leading interviewer turn and repeated candidate turns, when seeded, then valid alternating text-only history', () => {
    const msgs = seedFromHistory([
      { speaker: 'interviewer', text: 'Hi' },
      { speaker: 'candidate', text: 'a' },
      { speaker: 'candidate', text: 'b' },
      { speaker: 'interviewer', text: 'q' }
    ])
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    const cand = blocks(msgs[2])
    expect(cand).toHaveLength(1)
    expect(cand[0].text).toBe('<candidate_said>a b</candidate_said>')
    expect(JSON.stringify(msgs)).not.toContain('tool_')
    msgs.push(userTurn({ proctor: 'p' }))
    expect(checkConversation(msgs)).toEqual([])
  })
})

describe('checkConversation', () => {
  const u = (content: MessageParam['content']): MessageParam => ({ role: 'user', content })
  const a = (content: MessageParam['content']): MessageParam => ({ role: 'assistant', content })
  const t = (text: string): ContentBlockParam[] => [{ type: 'text', text }]
  const tr = (id: string): ContentBlockParam[] => [
    { type: 'tool_result', tool_use_id: id, content: 'ok' }
  ]
  const tu = (id: string): ContentBlockParam[] => [{ type: 'tool_use', id, name: 'x', input: {} }]

  it('given a valid tool round trip, then no violations', () => {
    expect(checkConversation([u(t('a')), a(tu('tu_1')), u([...tr('tu_1'), ...t('b')])])).toEqual([])
  })

  it('given each broken shape, then a code flags it', () => {
    expect(checkConversation([a(t('x')), u(t('y'))])).toContain('first_not_user')
    expect(checkConversation([u(t('x')), a(t('y'))])).toContain('last_not_user')
    expect(checkConversation([u(t('x')), u(t('y'))])).toContain('adjacent_roles:1')
    expect(checkConversation([u([])])).toContain('empty_content:0')
    expect(checkConversation([u(t(''))])).toContain('empty_text:0')
    expect(checkConversation([u(''), a(t('y')), u(t('z'))])).toContain('empty_text:0')
    expect(checkConversation([u(t('a')), a(tu('tu_1')), u(tr('tu_2'))])).toContain(
      'orphan_tool_result:2'
    )
    expect(checkConversation([u(tr('tu_1'))])).toContain('orphan_tool_result:0')
    expect(checkConversation([])).toContain('empty_conversation')
  })

  it('given violations, then codes never contain message text', () => {
    const codes = checkConversation([a(t('SECRET')), a(t('SECRET'))])
    expect(codes.join(' ')).not.toContain('SECRET')
  })
})
