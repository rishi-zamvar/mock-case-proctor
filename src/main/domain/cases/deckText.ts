/** pdftotext output -> pages. pages[0] = case prompt, pages[N] = deck page N. Drops only a trailing empty page. */
export function splitPages(raw: string): string[] {
  if (raw === '') return []
  const pages = raw.split('\f')
  if (pages.at(-1) === '') pages.pop()
  return pages
}
