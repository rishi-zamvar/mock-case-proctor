export const mss = (ms: number): string => {
  const t = Math.floor(Math.max(0, ms) / 1000)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
