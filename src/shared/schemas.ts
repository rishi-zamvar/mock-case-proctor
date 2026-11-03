// Strict zod schemas for the IPC boundary (KEY-03). Main-only: the preload must never import this.
import { z } from 'zod'
import type { CaseCard, KeyStatus, SaveResult } from './ipc'

export const KeyStatusSchema = z
  .object({ hasKey: z.boolean(), source: z.enum(['stored', 'env', 'dotenv', 'none']) })
  .strict()

export const SaveResultSchema = z
  .object({
    status: KeyStatusSchema,
    result: z.enum(['valid', 'invalid', 'unverified', 'unavailable', 'empty'])
  })
  .strict()

export const SaveArgsSchema = z.tuple([
  z.string().max(1000),
  z.object({ force: z.boolean().optional() }).strict()
])

export const CaseCardSchema = z
  .object({
    id: z.string().regex(/^\d{2}$/),
    number: z.number().int(),
    slug: z.string().regex(/^[a-z0-9]+$/),
    company: z.string().min(1),
    vertical: z.string().min(1),
    level: z.number().int().min(1).max(3),
    intervieweePdfPath: z.string().endsWith('_interviewee_package.pdf')
  })
  .strict()

// Compile-time guards: schemas and the shared contract must stay identical.
const _ks: KeyStatus = {} as z.infer<typeof KeyStatusSchema>
const _ks2: z.infer<typeof KeyStatusSchema> = {} as KeyStatus
const _sr: SaveResult = {} as z.infer<typeof SaveResultSchema>
const _sr2: z.infer<typeof SaveResultSchema> = {} as SaveResult
const _cc: CaseCard = {} as z.infer<typeof CaseCardSchema>
const _cc2: z.infer<typeof CaseCardSchema> = {} as CaseCard
void [_ks, _ks2, _sr, _sr2, _cc, _cc2]
