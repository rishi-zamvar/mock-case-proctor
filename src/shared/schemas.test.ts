import { describe, it, expect } from 'vitest'
import {
  KeyStatusSchema,
  SaveResultSchema,
  SaveArgsSchema,
  CaseCardSchema,
  ViewStateSchema,
  LibraryViewSchema,
  IntentSchema,
  StartArgsSchema,
  IdArgsSchema,
  AckArgsSchema,
  SpeakEventSchema
} from './schemas'

describe('KeyStatusSchema', () => {
  it.each(['stored', 'env', 'dotenv', 'none'])('accepts source %s', (source) => {
    expect(KeyStatusSchema.parse({ hasKey: true, source })).toEqual({ hasKey: true, source })
  })
  it('rejects extra fields (a key must never ride along)', () => {
    expect(() => KeyStatusSchema.parse({ hasKey: true, source: 'env', key: 'x' })).toThrow()
  })
  it('rejects unknown source and missing hasKey', () => {
    expect(() => KeyStatusSchema.parse({ hasKey: true, source: 'keychain' })).toThrow()
    expect(() => KeyStatusSchema.parse({ source: 'env' })).toThrow()
  })
})

describe('SaveResultSchema', () => {
  const status = { hasKey: true, source: 'stored' }
  it.each(['valid', 'invalid', 'unverified', 'unavailable', 'empty'])('accepts %s', (result) => {
    expect(() => SaveResultSchema.parse({ status, result })).not.toThrow()
  })
  it('rejects unknown result and extra fields', () => {
    expect(() => SaveResultSchema.parse({ status, result: 'ok' })).toThrow()
    expect(() => SaveResultSchema.parse({ status, result: 'valid', key: 'x' })).toThrow()
    expect(() =>
      SaveResultSchema.parse({ status: { ...status, key: 'x' }, result: 'valid' })
    ).toThrow()
  })
})

describe('SaveArgsSchema', () => {
  it('accepts a key with empty or force options', () => {
    expect(() => SaveArgsSchema.parse(['k', {}])).not.toThrow()
    expect(() => SaveArgsSchema.parse(['k', { force: true }])).not.toThrow()
  })
  it('rejects extra options, non-strings, oversize keys and missing options', () => {
    expect(() => SaveArgsSchema.parse(['k', { force: true, x: 1 }])).toThrow()
    expect(() => SaveArgsSchema.parse([1, {}])).toThrow()
    expect(() => SaveArgsSchema.parse(['x'.repeat(1001), {}])).toThrow()
    expect(() => SaveArgsSchema.parse(['k'])).toThrow()
  })
})

describe('CaseCardSchema', () => {
  const card = {
    id: '01',
    number: 1,
    slug: 'claimpath',
    company: 'ClaimPath',
    vertical: 'Insurtech',
    level: 2,
    intervieweePdfPath: '/x/case_01_claimpath/case_01_claimpath_interviewee_package.pdf'
  }
  it('accepts a valid 7-field card', () => {
    expect(CaseCardSchema.parse(card)).toEqual(card)
  })
  it.each([
    ['extra flags', { ...card, flags: [] }],
    ['extra idealAnswer', { ...card, idealAnswer: 'x' }],
    ['one-digit id', { ...card, id: '2' }],
    ['level 4', { ...card, level: 4 }],
    ['bad slug', { ...card, slug: 'Bad-Slug' }],
    [
      'interviewer pdf',
      {
        ...card,
        intervieweePdfPath: '/x/case_01_claimpath/case_01_claimpath_interviewer_package.pdf'
      }
    ]
  ])('rejects %s', (_n, bad) => {
    expect(() => CaseCardSchema.parse(bad)).toThrow()
  })
  it('has exactly the 7 locked keys', () => {
    expect(Object.keys(CaseCardSchema.shape).sort()).toEqual(
      ['company', 'id', 'intervieweePdfPath', 'level', 'number', 'slug', 'vertical'].sort()
    )
  })
})

const vCard = {
  id: '99',
  number: 99,
  slug: 'fixture',
  company: 'Fixture Co',
  vertical: 'SaaS',
  level: 2,
  intervieweePdfPath: '/x/case_99_fixture/case_99_fixture_interviewee_package.pdf'
}
const baseView = {
  sessionId: 's1',
  phase: 'grilling',
  card: vCard,
  reviewDeadline: null,
  clockNow: 1000,
  timeScale: 1,
  section: { id: 'retention', label: 'Retention', index: 2, total: 5 },
  transcript: [{ id: 't1', speaker: 'interviewer', text: 'Walk me through retention.' }],
  speaking: false,
  canTalk: true,
  endedEarly: false,
  reveal: null
}
const reveal = {
  scorecard: {
    rubric: Array.from({ length: 6 }, (_, i) => ({
      dimension: `d${i}`,
      score: 3,
      evidence: 'quote',
      answerKey: 'key'
    })),
    total: 18,
    band: 'average',
    flags: [{ id: 'f1', flag: 'churn', status: 'found' }],
    graderModel: 'fake',
    promptVersion: 'v0'
  },
  checks: {
    brevity: [{ turnId: 't1', ms: 1200, band: 'ideal' }],
    ledWithCall: true,
    omitted: [],
    numbers: [{ said: '48%', expected: '48%', ok: true }]
  },
  idealAnswer: 'ideal',
  opening: 'opening',
  keyNumbers: [{ label: 'ARR', text: '$184M' }]
}

describe('ViewStateSchema', () => {
  it('given a pre-review view when parsed then it passes', () => {
    expect(() => ViewStateSchema.parse(baseView)).not.toThrow()
  })
  it.each([
    ['brief', {}],
    ['flags', []]
  ])('given an extra %s key when parsed then it throws', (k, v) => {
    expect(() => ViewStateSchema.parse({ ...baseView, [k]: v })).toThrow()
  })
  it('given grilling with a reveal when parsed then it throws', () => {
    expect(() => ViewStateSchema.parse({ ...baseView, reveal })).toThrow()
  })
  it('given reviewMode with a full reveal when parsed then it passes', () => {
    expect(() => ViewStateSchema.parse({ ...baseView, phase: 'reviewMode', reveal })).not.toThrow()
  })
  it('given a rubric score of 6 when parsed then it throws', () => {
    const bad = structuredClone(reveal)
    bad.scorecard.rubric[0].score = 6
    expect(() => ViewStateSchema.parse({ ...baseView, phase: 'reviewMode', reveal: bad })).toThrow()
  })
  it('given a transcript line with an answerKey when parsed then it throws', () => {
    const transcript = [{ id: 't1', speaker: 'candidate', text: 'x', answerKey: 'leak' }]
    expect(() => ViewStateSchema.parse({ ...baseView, transcript })).toThrow()
  })
})

describe('IntentSchema', () => {
  it('given an answer with ms when parsed then it passes', () => {
    expect(() => IntentSchema.parse({ type: 'answer', ms: 1200 })).not.toThrow()
  })
  it.each([
    ['answer without ms', { type: 'answer' }],
    ['negative ms', { type: 'answer', ms: -1 }],
    ['ms over the 10-minute cap', { type: 'answer', ms: 600_001 }],
    ['unknown type', { type: 'hack' }],
    ['extra key', { type: 'ready', extra: 1 }]
  ])('given %s when parsed then it throws', (_n, bad) => {
    expect(() => IntentSchema.parse(bad)).toThrow()
  })
})

describe('IPC argument schemas', () => {
  it('given a two-digit case id and warmup when parsed then StartArgs passes', () => {
    expect(() => StartArgsSchema.parse(['99', { warmup: true }])).not.toThrow()
  })
  it.each([
    ['one-digit id', ['9', { warmup: true }]],
    ['traversal id', ['../x', { warmup: true }]],
    ['missing warmup', ['99', {}]]
  ])('given %s when parsed then StartArgs throws', (_n, bad) => {
    expect(() => StartArgsSchema.parse(bad)).toThrow()
  })
  it('given a session id when parsed then IdArgs passes', () => {
    expect(() => IdArgsSchema.parse(['2026-11-03T07-00-00-000Z_case_99'])).not.toThrow()
  })
  it.each([['../etc'], ['a/b']])('given %s when parsed then IdArgs throws', (id) => {
    expect(() => IdArgsSchema.parse([id])).toThrow()
  })
  it('given a turn id and seq 0 when parsed then AckArgs passes', () => {
    expect(() => AckArgsSchema.parse(['t1', 0])).not.toThrow()
  })
  it.each([
    ['negative seq', ['t1', -1]],
    ['fractional seq', ['t1', 1.5]]
  ])('given %s when parsed then AckArgs throws', (_n, bad) => {
    expect(() => AckArgsSchema.parse(bad)).toThrow()
  })
})

describe('SpeakEventSchema', () => {
  it('given an extra key when parsed then it throws', () => {
    const ev = { turnId: 't1', seq: 0, text: 'Hello.' }
    expect(() => SpeakEventSchema.parse(ev)).not.toThrow()
    expect(() => SpeakEventSchema.parse({ ...ev, brief: 'x' })).toThrow()
  })
})

describe('LibraryViewSchema', () => {
  const view = {
    cases: [{ card: vCard, completed: { at: 1, score: 18 } }],
    resumable: null,
    quarantined: 0,
    error: null
  }
  it('given one completed entry when parsed then it passes', () => {
    expect(() => LibraryViewSchema.parse(view)).not.toThrow()
  })
  it('given an extra key on an entry when parsed then it throws', () => {
    const bad = { ...view, cases: [{ ...view.cases[0], flags: [] }] }
    expect(() => LibraryViewSchema.parse(bad)).toThrow()
  })
})
