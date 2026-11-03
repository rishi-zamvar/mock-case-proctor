import { DIMENSION_IDS, DIMENSION_LABELS, type Reveal, type ViewState } from '../../../../shared/ipc'

export const AT = Date.UTC(2026, 10, 3, 15)

export function v2Reveal(): Reveal {
  return {
    scorecard: {
      rubric: DIMENSION_IDS.map((d, i) => ({
        id: d,
        dimension: DIMENSION_LABELS[d],
        score: i === 1 ? 2 : 4,
        evidence: i === 1 ? [] : [{ quote: `quote ${d}`, turnId: `c${i}` }],
        answerKey: `key ${d}`,
        rationale: `why ${d}`,
        unverified: i === 1
      })),
      total: 22,
      band: 'close',
      flags: [
        { id: 'f1', flag: 'Churn hidden in cohorts', status: 'found', where: 'S12, A3' },
        { id: 'f2', flag: 'Customer concentration', status: 'hinted', where: 'S4' },
        { id: 'f3', flag: 'Burn understated', status: 'missed', where: '' }
      ],
      keep: 'Leading with the call',
      fix: 'Compute GRR before NRR',
      insight: { calledOut: ['Spotted the cohort churn'], missed: [] },
      summary: 'Solid call, thin back-solve.',
      evidenceStats: { proposed: 6, verified: 5, dropped: 1 },
      checksSummary: {
        numbersCorrect: 1,
        numbersWrong: 1,
        numbersUnverifiable: 1,
        brevity: { short: 0, brief: 0, ideal: 1, long: 1, flagged: 1 },
        avgAnswerMs: 70000,
        ledWithCall: true,
        flagsFound: 1,
        flagsHinted: 1,
        flagsTotal: 3
      },
      graderModel: 'fake',
      promptVersion: 'v1',
      scoredAt: AT
    },
    checks: {
      brevity: [
        { turnId: 'c0', ms: 45000, band: 'ideal' },
        { turnId: 'c2', ms: 80000, band: 'long' },
        { turnId: 'c3', ms: 200000, band: 'flagged' }
      ],
      ledWithCall: true,
      omitted: ['Diligence'],
      numbers: [
        { claim: 'ARR of $9.9M', matched: '$9.9M', expected: '$9.9M', correct: true },
        { claim: 'GRR of 95%', matched: 'GRR', expected: '88%', correct: false },
        { claim: '3 years', matched: null, expected: null, correct: 'unverifiable' }
      ]
    },
    idealAnswer: 'Pass at this price.',
    opening: 'My call is invest.',
    keyNumbers: [{ label: 'Deal', text: '$9.9M ARR at 3.4x' }],
    intendedRead: 'Retention is weaker than NRR implies.',
    backSolve: ['Exit ARR $60M', 'CAGR 43%'],
    transcript: []
  }
}

export function v2View(o: Partial<ViewState> = {}): ViewState {
  return {
    sessionId: 's1',
    phase: 'reviewMode',
    card: {
      id: 'case_99',
      number: 99,
      slug: 'fixturely',
      company: 'Fixturely',
      vertical: 'SaaS',
      level: 2,
      intervieweePdfPath: 'app://cases/case_99/interviewee.pdf'
    },
    reviewDeadline: null,
    clockNow: 0,
    timeScale: 1,
    section: null,
    transcript: [],
    speaking: false,
    canTalk: false,
    endedEarly: false,
    reveal: v2Reveal(),
    deckPage: 1,
    reviewWarned: false,
    ...o
  }
}
