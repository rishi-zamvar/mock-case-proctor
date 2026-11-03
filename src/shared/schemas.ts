// Strict zod schemas for the IPC boundary (KEY-03). Main-only: the preload must never import this.
import { z } from 'zod'
import type { KeyStatus, SaveResult } from './ipc'

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

// Compile-time guards: schemas and the shared contract must stay identical.
const _ks: KeyStatus = {} as z.infer<typeof KeyStatusSchema>
const _ks2: z.infer<typeof KeyStatusSchema> = {} as KeyStatus
const _sr: SaveResult = {} as z.infer<typeof SaveResultSchema>
const _sr2: z.infer<typeof SaveResultSchema> = {} as SaveResult
void [_ks, _ks2, _sr, _sr2]
