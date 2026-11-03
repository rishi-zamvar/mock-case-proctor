import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(cleanup)

// jsdom has no canvas/worker: a tiny react-pdf stand-in. Set globalThis.__PDF_PAGES to vary the page count;
// a file URL containing 'missing' fails to load.
vi.mock('react-pdf', async () => {
  const React = await import('react')
  type DocProps = {
    file: string
    onLoadSuccess?: (d: { numPages: number }) => void
    onLoadError?: (e: Error) => void
    children?: React.ReactNode
  }
  function Document({ file, onLoadSuccess, onLoadError, children }: DocProps): React.ReactElement {
    React.useEffect(() => {
      if (String(file).includes('missing')) onLoadError?.(new Error('x'))
      else onLoadSuccess?.({ numPages: (globalThis as { __PDF_PAGES?: number }).__PDF_PAGES ?? 4 })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file])
    return React.createElement('div', { 'data-testid': 'pdf-document' }, children)
  }
  function Page({ pageNumber, width }: { pageNumber: number; width?: number }): React.ReactElement {
    return React.createElement('div', { 'data-testid': 'pdf-page', 'data-n': pageNumber, 'data-width': width })
  }
  return { pdfjs: { GlobalWorkerOptions: {} }, Document, Page }
})
