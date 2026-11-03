import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import DeckViewer, { deckLabel } from './DeckViewer'

const FILE = 'app://bundle/cases/case_99/interviewee.pdf'

function setup(
  initialPage = 1,
  file = FILE
): { onPageChange: ReturnType<typeof vi.fn>; unmount: () => void } {
  const onPageChange = vi.fn()
  const { unmount } = render(
    <DeckViewer file={file} initialPage={initialPage} onPageChange={onPageChange} />
  )
  return { onPageChange, unmount }
}

const root = (): HTMLElement => screen.getByTestId('deck-viewer')
const indicator = (): string => screen.getByTestId('deck-page-indicator').textContent ?? ''
const key = (k: string, o: KeyboardEventInit = {}): boolean =>
  fireEvent.keyDown(window, { key: k, ...o })

afterEach(() => {
  delete (globalThis as { __PDF_PAGES?: number }).__PDF_PAGES
})

describe('deckLabel', () => {
  it('given PDF page 1, when labelled, then it is the Prompt', () => {
    expect(deckLabel(1, 4)).toBe('Prompt')
    expect(deckLabel(1, 1)).toBe('Prompt')
  })
  it('given a later PDF page, when labelled, then it uses the deck footer number', () => {
    expect(deckLabel(2, 4)).toBe('p. 1 / 3')
    expect(deckLabel(13, 32)).toBe('p. 12 / 31')
  })
})

describe('DeckViewer', () => {
  it('given a 4-page deck, when loaded, then it renders 4 pages, 4 thumbnails and the Prompt label', () => {
    setup()
    expect(
      screen.getAllByTestId('pdf-page').filter((p) => p.closest('[data-page-n]'))
    ).toHaveLength(4)
    expect(screen.getAllByTestId(/^thumb-\d+$/)).toHaveLength(4)
    expect(indicator()).toBe('Prompt')
    expect(root().dataset.pages).toBe('4')
    expect(root().dataset.page).toBe('1')
    expect(screen.getByTestId('deck-page-indicator').classList.contains('tabular')).toBe(true)
  })

  it('given page 1, when PageDown and ArrowRight are pressed, then it moves forward one page each', () => {
    const { onPageChange } = setup()
    key('PageDown')
    expect(root().dataset.page).toBe('2')
    key('ArrowRight')
    expect(root().dataset.page).toBe('3')
    expect(onPageChange.mock.calls).toEqual([[2], [3]])
    expect(indicator()).toBe('p. 2 / 3')
  })

  it('given page 3, when PageUp and ArrowLeft are pressed, then it moves back one page each', () => {
    const { onPageChange } = setup(3)
    key('PageUp')
    key('ArrowLeft')
    expect(root().dataset.page).toBe('1')
    expect(onPageChange.mock.calls).toEqual([[2], [1]])
  })

  it('given the first or last page, when paging past the edge, then it clamps and does not call onPageChange', () => {
    const { onPageChange } = setup()
    key('PageUp')
    expect(onPageChange).not.toHaveBeenCalled()
    key('PageDown')
    key('PageDown')
    key('PageDown')
    key('PageDown')
    expect(root().dataset.page).toBe('4')
    expect(onPageChange.mock.calls).toEqual([[2], [3], [4]])
  })

  it('given the rail, when thumb-3 is clicked, then page 3 is current and reported', () => {
    const { onPageChange } = setup()
    fireEvent.click(screen.getByTestId('thumb-3'))
    expect(root().dataset.page).toBe('3')
    expect(screen.getByTestId('thumb-3').getAttribute('aria-current')).toBe('page')
    expect(screen.getByTestId('thumb-1').hasAttribute('aria-current')).toBe(false)
    expect(indicator()).toBe('p. 2 / 3')
    expect(onPageChange).toHaveBeenCalledWith(3)
    expect(screen.getByTestId('thumb-3').getAttribute('aria-label')).toBe('Go to p. 2 / 3')
  })

  it('given initialPage 3, when loaded, then page 3 is current without calling onPageChange', () => {
    const { onPageChange } = setup(3)
    expect(root().dataset.page).toBe('3')
    expect(onPageChange).not.toHaveBeenCalled()
  })

  it('given initialPage past the end, when loaded, then it clamps to the last page', () => {
    setup(99)
    expect(root().dataset.page).toBe('4')
  })

  it('given zoom 1, when Meta+= / Meta++ / Meta+- are pressed, then zoom steps by 0.25 and page width scales', () => {
    setup()
    const pages = within(screen.getByTestId('deck-pages'))
    const w1 = Number(pages.getAllByTestId('pdf-page')[0].dataset.width)
    expect(key('=', { metaKey: true })).toBe(false) // preventDefault called
    expect(root().dataset.zoom).toBe('1.25')
    key('+', { metaKey: true })
    expect(root().dataset.zoom).toBe('1.5')
    expect(Number(pages.getAllByTestId('pdf-page')[0].dataset.width)).toBeGreaterThan(w1)
    key('-', { metaKey: true })
    expect(root().dataset.zoom).toBe('1.25')
  })

  it('given zoom limits, when zooming far, then zoom clamps to [0.5, 3]', () => {
    setup()
    for (let i = 0; i < 20; i++) key('=', { metaKey: true })
    expect(root().dataset.zoom).toBe('3')
    for (let i = 0; i < 20; i++) key('-', { metaKey: true })
    expect(root().dataset.zoom).toBe('0.5')
  })

  it('given the zoom buttons, when clicked, then zoom changes', () => {
    setup()
    fireEvent.click(screen.getByTestId('zoom-in'))
    expect(root().dataset.zoom).toBe('1.25')
    fireEvent.click(screen.getByTestId('zoom-out'))
    fireEvent.click(screen.getByTestId('zoom-out'))
    expect(root().dataset.zoom).toBe('0.75')
  })

  it('given handled keys, when pressed, then preventDefault is called; unhandled keys and Space are left alone', () => {
    const { onPageChange } = setup()
    expect(key('PageDown')).toBe(false)
    expect(key(' ')).toBe(true)
    expect(key('=')).toBe(true)
    expect(onPageChange.mock.calls).toEqual([[2]])
  })

  it('given focus in an INPUT or TEXTAREA, when paging keys are pressed, then they are ignored', () => {
    const { onPageChange } = setup()
    const input = document.createElement('input')
    const area = document.createElement('textarea')
    document.body.append(input, area)
    fireEvent.keyDown(input, { key: 'PageDown' })
    fireEvent.keyDown(area, { key: 'ArrowRight' })
    expect(onPageChange).not.toHaveBeenCalled()
    input.remove()
    area.remove()
  })

  it('given the rail is open, when thumbs-toggle is clicked, then aria-expanded and hidden flip', () => {
    setup()
    const toggle = screen.getByTestId('thumbs-toggle')
    const rail = screen.getByTestId('deck-thumbs')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(rail.hidden).toBe(false)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(rail.hidden).toBe(true)
    fireEvent.click(toggle)
    expect(rail.hidden).toBe(false)
  })

  it('given a file that fails to load, when rendered, then a deck-error alert shows', () => {
    setup(1, 'app://bundle/cases/missing/interviewee.pdf')
    const err = screen.getByTestId('deck-error')
    expect(err.getAttribute('role')).toBe('alert')
    expect(err.textContent).toContain("Couldn't load the deck")
  })

  it('given scrolling, when a later page reaches the top third, then it becomes current and is reported once', () => {
    const { onPageChange } = setup()
    const scroller = screen.getByTestId('deck-pages')
    const wrappers = scroller.querySelectorAll<HTMLElement>('[data-page-n]')
    wrappers.forEach((w, i) =>
      Object.defineProperty(w, 'offsetTop', { value: i * 1000, configurable: true })
    )
    Object.defineProperty(scroller, 'clientHeight', { value: 900, configurable: true })
    scroller.scrollTop = 1500
    fireEvent.scroll(scroller)
    fireEvent.scroll(scroller)
    expect(root().dataset.page).toBe('2')
    expect(onPageChange.mock.calls).toEqual([[2]])
  })

  it('given go() scrolled programmatically, when the resulting scroll event lands on the same page, then onPageChange is not called twice', () => {
    const { onPageChange } = setup()
    const scroller = screen.getByTestId('deck-pages')
    const wrappers = scroller.querySelectorAll<HTMLElement>('[data-page-n]')
    wrappers.forEach((w, i) =>
      Object.defineProperty(w, 'offsetTop', { value: i * 1000, configurable: true })
    )
    Object.defineProperty(scroller, 'clientHeight', { value: 900, configurable: true })
    key('PageDown')
    scroller.scrollTop = 1000
    fireEvent.scroll(scroller)
    expect(onPageChange.mock.calls).toEqual([[2]])
  })

  it('given unmount, when a key is pressed later, then onPageChange is not called', () => {
    const { onPageChange, unmount } = setup()
    unmount()
    key('PageDown')
    expect(onPageChange).not.toHaveBeenCalled()
  })
})
