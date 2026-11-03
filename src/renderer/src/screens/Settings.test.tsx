import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { KeyStatus, SaveOutcome, SaveResult } from '../../../shared/ipc'
import Settings from './Settings'

const KEY = 'paste-key-' + 'q'.repeat(6)
const NONE: KeyStatus = { hasKey: false, source: 'none' }

function setup(status: KeyStatus = NONE, outcome?: SaveOutcome) {
  const save = vi.fn(async (): Promise<SaveResult> => ({
    result: outcome ?? 'valid',
    status: outcome === 'valid' ? { hasKey: true, source: 'stored' } : NONE
  }))
  const clear = vi.fn(async (): Promise<KeyStatus> => NONE)
  window.api = { key: { status: vi.fn(async () => status), save, clear } }
  const props = { onStatus: vi.fn(), onDone: vi.fn(), onBack: vi.fn() }
  const r = render(<Settings status={status} {...props} />)
  return { save, clear, props, ...r }
}

async function typeAndSave() {
  await userEvent.type(screen.getByTestId('key-input'), KEY)
  await userEvent.click(screen.getByTestId('save-btn'))
}

const msg = () => screen.findByTestId('key-message')

describe('Settings', () => {
  it('uses a password input and saves with exactly one argument', async () => {
    const { save } = setup(NONE, 'valid')
    expect(screen.getByTestId('key-input')).toHaveProperty('type', 'password')
    expect(screen.getByTestId('save-btn').textContent).toBe('Save & verify')
    await typeAndSave()
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0]).toEqual([KEY])
  })

  it('shows rejection for an invalid key with no save-anyway', async () => {
    setup(NONE, 'invalid')
    await typeAndSave()
    expect((await msg()).textContent).toBe('Anthropic rejected that key.')
    expect(document.querySelector('main[data-screen="settings"]')).not.toBeNull()
    expect(screen.queryByTestId('save-anyway-btn')).toBeNull()
  })

  it('offers save anyway when the key could not be verified', async () => {
    const { save } = setup(NONE, 'unverified')
    await typeAndSave()
    expect((await msg()).textContent).toBe("Couldn't verify the key. Check your connection.")
    await userEvent.click(screen.getByTestId('save-anyway-btn'))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(save.mock.calls[1]).toEqual([KEY, { force: true }])
  })

  it('shows the unavailable message', async () => {
    setup(NONE, 'unavailable')
    await typeAndSave()
    expect((await msg()).textContent).toBe('Secure storage is unavailable. Key not saved.')
  })

  it('shows the empty message', async () => {
    setup(NONE, 'empty')
    await userEvent.click(screen.getByTestId('save-btn'))
    expect((await msg()).textContent).toBe('Paste a key first.')
  })

  it('clears the draft and calls onDone after a valid save, never showing the key', async () => {
    const { props } = setup(NONE, 'valid')
    await typeAndSave()
    await waitFor(() => expect(props.onDone).toHaveBeenCalled())
    expect(props.onStatus).toHaveBeenCalledWith({ hasKey: true, source: 'stored' })
    expect((screen.getByTestId('key-input') as HTMLInputElement).value).toBe('')
    expect(document.body.textContent).not.toContain(KEY)
  })

  it.each([
    ['stored', 'Stored encrypted in macOS Keychain'],
    ['env', 'Loaded from ANTHROPIC_API_KEY'],
    ['dotenv', 'Loaded from .env']
  ] as const)('shows saved state for source %s', async (source, text) => {
    setup({ hasKey: true, source })
    expect(screen.getByTestId('key-status').textContent).toBe('Key saved ✓')
    expect(screen.getByTestId('key-source').textContent).toBe(text)
    expect(screen.getByTestId('replace-btn')).toBeTruthy()
    expect(screen.getByTestId('clear-btn')).toBeTruthy()
    expect(screen.queryByTestId('key-input')).toBeNull()
    await userEvent.click(screen.getByTestId('replace-btn'))
    expect(screen.getByTestId('key-input')).toBeTruthy()
  })

  it('clears the key and returns to the paste field', async () => {
    const status: KeyStatus = { hasKey: true, source: 'stored' }
    const { clear, props, rerender } = setup(status)
    await userEvent.click(screen.getByTestId('clear-btn'))
    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1))
    expect(props.onStatus).toHaveBeenCalledWith(NONE)
    rerender(<Settings status={NONE} {...props} />)
    expect(screen.getByTestId('key-status').textContent).toBe('No key saved')
    expect(screen.getByTestId('key-input')).toBeTruthy()
  })

  it('shows back only when a key exists', () => {
    setup(NONE)
    expect(screen.queryByTestId('back-btn')).toBeNull()
  })
})
