// The only IPC surface (KEY-03): three channels, zod-validated both ways, app-origin senders only.
// Never log handler args: key:save carries the API key.
import { CH } from '../shared/ipc'
import { KeyStatusSchema, SaveArgsSchema, SaveResultSchema } from '../shared/schemas'
import { isAppOrigin } from './protocol'
import type { KeyStore } from './keys/keyStore'

type Sender = { senderFrame: { url: string } | null }
export type IpcLike = {
  handle(channel: string, fn: (event: Sender, ...args: unknown[]) => unknown): void
}

export function registerIpc(
  ipc: IpcLike,
  store: Pick<KeyStore, 'status' | 'save' | 'clear'>,
  devUrl?: string
): void {
  const guard = (event: Sender): void => {
    const url = event.senderFrame?.url
    if (!url || !isAppOrigin(url, devUrl)) throw new Error('forbidden sender')
  }

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
}
