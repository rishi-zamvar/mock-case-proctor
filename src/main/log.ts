// Main-process logger. Every line is redacted so an API key can never reach a log (KEY-03).
export const KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]+/g

export function redact(s: string): string {
  return s.replace(KEY_PATTERN, 'sk-ant-***')
}

function one(x: unknown): string {
  if (x instanceof Error) return x.stack ?? x.message
  if (typeof x === 'string') return x
  try {
    return JSON.stringify(x) ?? String(x)
  } catch {
    return String(x)
  }
}

export function format(args: unknown[]): string {
  return redact(args.map(one).join(' '))
}

export type Logger = {
  info(...a: unknown[]): void
  warn(...a: unknown[]): void
  error(...a: unknown[]): void
}

export function createLogger(sink: Pick<Console, 'log' | 'warn' | 'error'> = console): Logger {
  return {
    info: (...a) => sink.log(format(a)),
    warn: (...a) => sink.warn(format(a)),
    error: (...a) => sink.error(format(a))
  }
}

export const log: Logger = createLogger(console)
