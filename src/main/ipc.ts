// The only IPC surface: narrow channels, zod-validated both ways, app-origin senders only.
// Never log handler args: key:save carries the API key.
import { z } from 'zod'
import { CH, type LibraryView, type SttStatus } from '../shared/ipc'
import {
  AckArgsSchema,
  IdArgsSchema,
  IntentSchema,
  KeyStatusSchema,
  LibraryViewSchema,
  SaveArgsSchema,
  SaveResultSchema,
  StartArgsSchema,
  StartedArgsSchema,
  SttChunkArgsSchema,
  SttStatusSchema
} from '../shared/schemas'
import { isAppOrigin } from './protocol'
import type { KeyStore } from './keys/keyStore'
import type { SessionRunner } from './session/runner'

type Sender = { senderFrame: { url: string } | null }
export type IpcLike = {
  handle(channel: string, fn: (event: Sender, ...args: unknown[]) => unknown): void
}
export type IpcDeps = {
  keyStore: Pick<KeyStore, 'status' | 'save' | 'clear'>
  runner?: Pick<
    SessionRunner,
    'start' | 'resume' | 'discard' | 'intent' | 'ack' | 'sttChunk' | 'started'
  >
  library?: () => LibraryView
  e2eSay?: (text: string) => void
  sttStatus?: () => Promise<SttStatus>
}

const NoArgs = z.tuple([])
const IntentArgs = z.tuple([IntentSchema])
const SayArgs = z.tuple([z.string().max(2000)])

export function registerIpc(ipc: IpcLike, deps: IpcDeps, devUrl?: string): void {
  const store = deps.keyStore
  const guard = (event: Sender): void => {
    const url = event.senderFrame?.url
    if (!url || !isAppOrigin(url, devUrl)) throw new Error('forbidden sender')
  }
  /** Guarded + validated handler: the guard runs before any argument is looked at. */
  const on = <S extends z.ZodType<unknown[]>>(
    ch: string,
    schema: S,
    fn: (args: z.infer<S>) => unknown
  ): void =>
    ipc.handle(ch, async (event, ...args) => {
      guard(event)
      const parsed = schema.safeParse(args)
      if (!parsed.success) throw new Error('invalid arguments')
      return fn(parsed.data)
    })

  ipc.handle(CH.keyStatus, (event) => {
    guard(event)
    return KeyStatusSchema.parse(store.status())
  })

  ipc.handle(CH.keySave, async (event, ...args) => {
    guard(event)
    const parsed = SaveArgsSchema.safeParse(args)
    if (!parsed.success) throw new Error('invalid arguments')
    return SaveResultSchema.parse(await store.save(...parsed.data))
  })

  ipc.handle(CH.keyClear, async (event) => {
    guard(event)
    return KeyStatusSchema.parse(await store.clear())
  })

  const { runner, library, e2eSay } = deps
  if (library) on(CH.libraryList, NoArgs, () => LibraryViewSchema.parse(library()))
  if (runner) {
    on(CH.sessionStart, StartArgsSchema, ([id, opts]) => runner.start(id, opts))
    on(CH.sessionResume, IdArgsSchema, ([id]) => runner.resume(id))
    on(CH.sessionIntent, IntentArgs, async ([i]) => void (await runner.intent(i)))
    on(CH.sessionDiscard, IdArgsSchema, ([id]) => void runner.discard(id))
    on(CH.speakAck, AckArgsSchema, ([t, seq, spoken]) => void runner.ack(t, seq, spoken ?? true))
    on(CH.sttChunk, SttChunkArgsSchema, ([id, idx, pcm]) => void runner.sttChunk(id, idx, pcm))
    on(CH.speakStarted, StartedArgsSchema, ([t, s]) => void runner.started(t, s))
    const { sttStatus } = deps
    on(CH.sttStatus, NoArgs, async () =>
      SttStatusSchema.parse(sttStatus ? await sttStatus() : 'off')
    )
  }
  if (e2eSay) on(CH.e2eSay, SayArgs, ([t]) => void e2eSay(t))
}
