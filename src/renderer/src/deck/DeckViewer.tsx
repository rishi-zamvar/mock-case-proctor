import { useCallback, useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import styles from './DeckViewer.module.css'

// Must be set in the module that renders <Document> (react-pdf README); resolves to react-pdf's own pinned PDF.js copy.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

// No `options` prop: pdfjs 6.3 has no eval path (isEvalSupported is gone). If one is added later, keep it a
// module constant; a new object per render makes react-pdf reload the document.
const ZOOM_STEP = 0.25
const ZOOM_MIN = 0.5
const ZOOM_MAX = 3

/** PDF page 1 is the case prompt; deck page N is PDF page N+1. */
// eslint-disable-next-line react-refresh/only-export-components -- deckLabel is part of the component contract
export function deckLabel(page: number, numPages: number): string {
  return page <= 1 ? 'Prompt' : `p. ${page - 1} / ${numPages - 1}`
}

type Props = {
  file: string
  initialPage: number
  onPageChange: (page: number) => void
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export default function DeckViewer({ file, initialPage, onPageChange }: Props): React.JSX.Element {
  const [numPages, setNumPages] = useState(0)
  const [current, setCurrent] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [railOpen, setRailOpen] = useState(true)
  const [error, setError] = useState(false)
  const [stageWidth, setStageWidth] = useState(800)
  const scrollerRef = useRef<HTMLDivElement>(null)
  // Ref mirror of current: go() updates it before its scroll lands, so the scroll handler never re-reports that page.
  const currentRef = useRef(1)
  const onPageChangeRef = useRef(onPageChange)
  useEffect(() => {
    onPageChangeRef.current = onPageChange
  }, [onPageChange])

  const scrollTo = (p: number): void => {
    scrollerRef.current?.querySelector(`[data-page-n="${p}"]`)?.scrollIntoView?.({ block: 'start' })
  }

  const go = useCallback(
    (p: number): void => {
      const next = clamp(p, 1, Math.max(1, numPages))
      if (next === currentRef.current) return
      currentRef.current = next
      setCurrent(next)
      scrollTo(next)
      onPageChangeRef.current(next)
    },
    [numPages]
  )

  // Restore the session's page once the document is loaded, without reporting it back.
  const initialRef = useRef(initialPage)
  useEffect(() => {
    if (numPages === 0) return
    const p = clamp(initialRef.current, 1, numPages)
    currentRef.current = p
    setCurrent(p)
    scrollTo(p)
  }, [numPages])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === 'PageDown' || e.key === 'ArrowRight') go(currentRef.current + 1)
      else if (e.key === 'PageUp' || e.key === 'ArrowLeft') go(currentRef.current - 1)
      else if (e.metaKey && (e.key === '=' || e.key === '+'))
        setZoom((z) => clamp(z + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX))
      else if (e.metaKey && e.key === '-') setZoom((z) => clamp(z - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const onScroll = (): void => {
    const el = scrollerRef.current
    if (!el) return
    const line = el.scrollTop + el.clientHeight / 3
    let seen = 1
    el.querySelectorAll<HTMLElement>('[data-page-n]').forEach((w) => {
      if (w.offsetTop <= line) seen = Number(w.dataset.pageN)
    })
    if (seen === currentRef.current) return
    currentRef.current = seen
    setCurrent(seen)
    onPageChangeRef.current(seen)
  }

  const pages = Array.from({ length: numPages }, (_, i) => i + 1)
  const width = Math.max(200, Math.round((stageWidth - 32) * zoom))
  const zoomBy = (d: number): void => setZoom((z) => clamp(z + d, ZOOM_MIN, ZOOM_MAX))

  return (
    <div
      className={styles.viewer}
      data-testid="deck-viewer"
      data-page={current}
      data-pages={numPages}
      data-zoom={zoom}
      data-rail={railOpen}
    >
      <div className={styles.toolbar}>
        <button
          type="button"
          data-testid="thumbs-toggle"
          aria-expanded={railOpen}
          aria-controls="deck-thumbs"
          onClick={() => setRailOpen((o) => !o)}
        >
          Pages
        </button>
        <span
          className={`tabular ${styles.indicator}`}
          data-testid="deck-page-indicator"
          aria-live="polite"
        >
          {numPages > 0 ? deckLabel(current, numPages) : ''}
        </span>
        <button
          type="button"
          data-testid="zoom-out"
          aria-label="Zoom out"
          onClick={() => zoomBy(-ZOOM_STEP)}
        >
          −
        </button>
        <button
          type="button"
          data-testid="zoom-in"
          aria-label="Zoom in"
          onClick={() => zoomBy(ZOOM_STEP)}
        >
          +
        </button>
      </div>
      {error ? (
        <p className={styles.status} role="alert" data-testid="deck-error">
          Couldn&apos;t load the deck
        </p>
      ) : (
        <Document
          file={file}
          className={styles.body}
          loading=""
          error=""
          onLoadSuccess={(d) => setNumPages(d.numPages)}
          onLoadError={() => setError(true)}
        >
          {/* ponytail: every thumbnail renders at width 96, fine for ~30-page decks; window them if a deck lags */}
          <nav
            id="deck-thumbs"
            className={styles.rail}
            data-testid="deck-thumbs"
            aria-label="Deck pages"
            hidden={!railOpen}
          >
            {pages.map((n) => (
              <button
                key={n}
                type="button"
                className={styles.thumb}
                data-testid={`thumb-${n}`}
                aria-label={`Go to ${deckLabel(n, numPages)}`}
                aria-current={n === current ? 'page' : undefined}
                onClick={() => go(n)}
              >
                <Page
                  pageNumber={n}
                  width={96}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </button>
            ))}
          </nav>
          <div
            className={styles.pages}
            data-testid="deck-pages"
            ref={scrollerRef}
            onScroll={onScroll}
          >
            {numPages === 0 && <p className={styles.status}>Loading deck…</p>}
            {pages.map((n) => (
              <div key={n} data-page-n={n} className={styles.page}>
                <Page
                  pageNumber={n}
                  width={width}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </div>
            ))}
          </div>
        </Document>
      )}
    </div>
  )
}
