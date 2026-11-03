// Whisper vocabulary prompt: company + glossary terms + finance vocab.
import type { InterviewerBrief } from './brief'

export const FINANCE_VOCAB: readonly string[] = [
  'ARR',
  'NRR',
  'GRR',
  'CAGR',
  'EV',
  'NTM',
  'pre-money',
  'post-money',
  'MOIC',
  'Rule of 40',
  'burn multiple'
]

// ponytail: word count is a proxy for Whisper's ~200-token prompt cap; tokenize if prompts grow.
export function sttPrompt(brief: Pick<InterviewerBrief, 'company' | 'glossary'>): string {
  const seen = new Set<string>()
  return [brief.company.name, ...brief.glossary.map((g) => g.term), ...FINANCE_VOCAB]
    .filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
    .join(', ')
}
