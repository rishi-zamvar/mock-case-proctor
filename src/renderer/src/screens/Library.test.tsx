import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CaseCard, LibraryView } from '../../../shared/ipc'
import Library from './Library'

const card = (n: number, company: string, vertical: string, level: number): CaseCard => ({
  id: String(n).padStart(2, '0'),
  number: n,
  slug: `${String(n).padStart(2, '0')}_${company.toLowerCase()}_slug`,
  company,
  vertical,
  level,
  intervieweePdfPath: `/cases/${company}/interviewee_package.pdf`
})

const VIEW: LibraryView = {
  cases: [
    { card: card(1, 'Acme', 'Vertical SaaS', 1), completed: null },
    {
      card: card(2, 'PawsHub', 'Consumer', 2),
      completed: { at: Date.UTC(2026, 10, 3, 12), score: 18 }
    },
    { card: card(99, 'Fixturely', 'Fintech', 3), completed: null }
  ],
  resumable: null,
  quarantined: 0,
  error: null
}

function setup(over: Partial<LibraryView> = {}): Record<string, ReturnType<typeof vi.fn>> {
  const props = {
    onStart: vi.fn(),
    onResume: vi.fn(),
    onDiscard: vi.fn(),
    onOpenSettings: vi.fn()
  }
  render(<Library view={{ ...VIEW, ...over }} {...props} />)
  return props
}

describe('Library', () => {
  it('renders the home root with the heading and one card per case in order', () => {
    setup()
    expect(document.querySelector('main[data-screen="home"]')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Case library')
    const cards = screen.getAllByTestId(/^case-card-/)
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual([
      'case-card-01',
      'case-card-02',
      'case-card-99'
    ])
    const c = within(cards[1])
    expect(c.getByTestId('case-number').textContent).toBe('Case 02')
    expect(c.getByTestId('case-company').textContent).toBe('PawsHub')
    expect(c.getByTestId('case-vertical').textContent).toBe('Consumer')
    expect(c.getByTestId('case-level').textContent).toBe('Level 2')
    expect(within(cards[2]).getByTestId('case-number').textContent).toBe('Case 99')
  })

  it('never shows the slug or pdf path', () => {
    setup()
    for (const el of screen.getAllByTestId(/^case-card-/)) {
      expect(el.textContent).not.toMatch(/slug|interviewee_package/)
    }
  })

  it('greys completed cases and offers Retake; others offer Start', () => {
    setup()
    const done = screen.getByTestId('case-card-02')
    expect(done.getAttribute('data-completed')).toBe('true')
    expect(screen.getByTestId('completed-02').textContent).toBe('Completed Nov 3, 2026 · 18/30')
    expect(screen.getByTestId('retake-02').textContent).toBe('Retake')
    expect(screen.queryByTestId('start-02')).toBeNull()
    for (const id of ['01', '99']) {
      expect(screen.getByTestId(`case-card-${id}`).getAttribute('data-completed')).toBe('false')
      expect(screen.getByTestId(`start-${id}`).textContent).toBe('Start')
      expect(screen.queryByTestId(`retake-${id}`)).toBeNull()
    }
  })

  it('opens the start sheet with warm-up on and starts with it', async () => {
    const p = setup()
    await userEvent.click(screen.getByTestId('start-01'))
    const sheet = screen.getByTestId('start-sheet')
    expect(sheet.getAttribute('role')).toBe('dialog')
    expect(sheet.getAttribute('aria-modal')).toBe('true')
    expect(sheet.getAttribute('aria-label')).toBe('Start Acme')
    const toggle = screen.getByLabelText('Include 5–10 min warm-up chat') as HTMLInputElement
    expect(toggle.getAttribute('data-testid')).toBe('warmup-toggle')
    expect(toggle.checked).toBe(true)
    expect(document.activeElement).toBe(screen.getByTestId('sheet-start'))
    await userEvent.click(screen.getByTestId('sheet-start'))
    expect(p.onStart).toHaveBeenCalledTimes(1)
    expect(p.onStart).toHaveBeenCalledWith('01', { warmup: true })
    expect(screen.queryByTestId('start-sheet')).toBeNull()
  })

  it('starts without warm-up when the toggle is unchecked', async () => {
    const p = setup()
    await userEvent.click(screen.getByTestId('start-01'))
    await userEvent.click(screen.getByTestId('warmup-toggle'))
    await userEvent.click(screen.getByTestId('sheet-start'))
    expect(p.onStart).toHaveBeenCalledWith('01', { warmup: false })
  })

  it('Retake opens the same sheet and starts a fresh session', async () => {
    const p = setup()
    await userEvent.click(screen.getByTestId('retake-02'))
    expect(screen.getByTestId('start-sheet').getAttribute('aria-label')).toBe('Start PawsHub')
    await userEvent.click(screen.getByTestId('sheet-start'))
    expect(p.onStart).toHaveBeenCalledWith('02', { warmup: true })
  })

  it('resets the toggle to on each time the sheet opens', async () => {
    setup()
    await userEvent.click(screen.getByTestId('start-01'))
    await userEvent.click(screen.getByTestId('warmup-toggle'))
    await userEvent.click(screen.getByTestId('sheet-cancel'))
    await userEvent.click(screen.getByTestId('start-99'))
    expect((screen.getByTestId('warmup-toggle') as HTMLInputElement).checked).toBe(true)
  })

  it('Escape and Cancel close the sheet without starting', async () => {
    const p = setup()
    await userEvent.click(screen.getByTestId('start-01'))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('start-sheet')).toBeNull()
    await userEvent.click(screen.getByTestId('start-01'))
    await userEvent.click(screen.getByTestId('sheet-cancel'))
    expect(screen.queryByTestId('start-sheet')).toBeNull()
    expect(p.onStart).not.toHaveBeenCalled()
  })

  it('shows the resume banner and routes Resume / Discard', async () => {
    const p = setup({
      resumable: { sessionId: 's1', caseId: '99', company: 'Fixturely', phase: 'grilling' }
    })
    expect(screen.getByTestId('resume-banner').textContent).toContain(
      'Resume your Fixturely session from grilling?'
    )
    await userEvent.click(screen.getByTestId('resume-btn'))
    expect(p.onResume).toHaveBeenCalledWith('s1')
    await userEvent.click(screen.getByTestId('discard-btn'))
    expect(p.onDiscard).toHaveBeenCalledWith('s1')
  })

  it('labels the extraction phase as presentation', () => {
    setup({ resumable: { sessionId: 's2', caseId: '01', company: 'Acme', phase: 'extraction' } })
    expect(screen.getByTestId('resume-banner').textContent).toContain(
      'Resume your Acme session from presentation?'
    )
  })

  it('shows no banner when nothing is resumable', () => {
    setup()
    expect(screen.queryByTestId('resume-banner')).toBeNull()
  })

  it('shows the quarantine notice only when n > 0', () => {
    setup({ quarantined: 2 })
    const n = screen.getByTestId('quarantine-notice')
    expect(n.getAttribute('role')).toBe('status')
    expect(n.textContent).toBe('2 corrupt session file(s) were set aside.')
  })

  it('hides the quarantine notice at 0', () => {
    setup()
    expect(screen.queryByTestId('quarantine-notice')).toBeNull()
  })

  it('shows the error as an alert', () => {
    setup({ error: 'Case library not found' })
    expect(screen.getByRole('alert').textContent).toBe('Case library not found')
    expect(screen.getByTestId('library-error')).toBe(screen.getByRole('alert'))
  })

  it('shows no error when null', () => {
    setup()
    expect(screen.queryByTestId('library-error')).toBeNull()
  })

  it('the gear opens settings', async () => {
    const p = setup()
    const gear = screen.getByTestId('open-settings')
    expect(gear.getAttribute('aria-label')).toBe('Settings')
    await userEvent.click(gear)
    expect(p.onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('is keyboard operable: Tab to start-01 and Enter opens the sheet', async () => {
    const p = setup()
    const target = screen.getByTestId('start-01')
    for (let i = 0; i < 10 && document.activeElement !== target; i++) await userEvent.tab()
    expect(document.activeElement).toBe(target)
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement).toBe(screen.getByTestId('sheet-start'))
    await userEvent.keyboard('{Enter}')
    expect(p.onStart).toHaveBeenCalledWith('01', { warmup: true })
  })

  it('the start sheet runs a setup check that never blocks Start', async () => {
    const p = setup()
    await userEvent.click(screen.getByTestId('start-01'))
    const check = screen.getByTestId('setup-check')
    expect(within(check).getByRole('heading', { name: 'Check your setup' })).not.toBeNull()
    expect(within(check).getByTestId('mic-check')).not.toBeNull()
    expect(within(check).getByTestId('mic-unavailable')).not.toBeNull()
    expect(within(check).getByTestId('webcam-tile')).not.toBeNull()
    expect(within(check).getByTestId('camera-off')).not.toBeNull()
    expect(document.activeElement).toBe(screen.getByTestId('sheet-start'))
    await userEvent.click(screen.getByTestId('sheet-start'))
    expect(p.onStart).toHaveBeenCalledWith('01', { warmup: true })
    expect(screen.queryByTestId('mic-check')).toBeNull()
  })

  it('closing the sheet unmounts the setup check', async () => {
    setup()
    await userEvent.click(screen.getByTestId('start-01'))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('mic-check')).toBeNull()
    await userEvent.click(screen.getByTestId('start-01'))
    await userEvent.click(screen.getByTestId('sheet-cancel'))
    expect(screen.queryByTestId('setup-check')).toBeNull()
    expect(document.activeElement).toBe(screen.getByTestId('start-01'))
  })
})
