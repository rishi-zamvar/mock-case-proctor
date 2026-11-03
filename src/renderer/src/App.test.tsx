import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { KeyStatus, SaveResult } from '../../shared/ipc'
import App from './App'

const KEY = 'paste-key-' + 'q'.repeat(6)

function mockApi(status: KeyStatus) {
  const api = {
    key: {
      status: vi.fn(async () => status),
      save: vi.fn<(k: string, o?: { force?: boolean }) => Promise<SaveResult>>(),
      clear: vi.fn(async (): Promise<KeyStatus> => ({ hasKey: false, source: 'none' }))
    }
  }
  window.api = api as unknown as Window['api'] // key-only mock
  return api
}

const main = (s: string) => document.querySelector(`main[data-screen="${s}"]`)

describe('App routing', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('opens on settings when there is no key', async () => {
    mockApi({ hasKey: false, source: 'none' })
    render(<App />)
    await screen.findByRole('heading', { name: 'Anthropic API key' })
    expect(main('settings')).not.toBeNull()
  })

  it('opens on home with a key, navigates to settings and back', async () => {
    mockApi({ hasKey: true, source: 'stored' })
    render(<App />)
    await screen.findByText('Case library coming in Phase 3')
    expect(main('home')).not.toBeNull()
    await userEvent.click(screen.getByTestId('open-settings'))
    expect(main('settings')).not.toBeNull()
    await userEvent.click(screen.getByTestId('back-btn'))
    expect(main('home')).not.toBeNull()
  })

  it('goes home after a valid save from first-run settings', async () => {
    const api = mockApi({ hasKey: false, source: 'none' })
    api.key.save.mockResolvedValue({ result: 'valid', status: { hasKey: true, source: 'stored' } })
    render(<App />)
    await userEvent.type(await screen.findByTestId('key-input'), KEY)
    await userEvent.click(screen.getByTestId('save-btn'))
    await screen.findByText('Case library coming in Phase 3')
    expect(main('home')).not.toBeNull()
  })
})
