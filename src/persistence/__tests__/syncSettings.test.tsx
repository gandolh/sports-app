// @vitest-environment jsdom
//
// The sync half of the Settings screen.
//
// Lives here for the same reason `settingsScreen.test.tsx` does: the component
// is in `src/ui/`, but brief 11 owns only the sync fields on it, and
// `src/ui/__tests__/` belongs to the shell brief.
//
// Two properties are worth a test and the markup is not one of them:
//
//   1. **A remote-ahead conflict prompts and changes nothing.** Both counts are
//      on screen, and neither the adopt handler nor the push handler is called
//      until the user clicks one. Asserted through call counts.
//   2. **The stored secret is never rendered.** Not in text, not as an input
//      value, not in an attribute. It can be replaced by typing, and leaving the
//      field blank keeps the one already stored — that is what "write-only in
//      the UI" means.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { StateDoc, SyncSettings } from '../../domain/types.ts'
import { emptyDoc } from '../store.ts'
import type { SyncStatus, checkSync } from '../sync.ts'
import { SettingsScreen } from '../../ui/SettingsScreen.tsx'

const STORED_SECRET = 'a-secret-nobody-should-see-on-screen'
const TARGET: SyncSettings = { baseUrl: 'http://127.0.0.1:8787', secret: STORED_SECRET }

function docWith(sessionsCompleted: number, sync: SyncSettings | null): StateDoc {
  const base = emptyDoc()
  return { ...base, sessionsCompleted, settings: { ...base.settings, sync } }
}

function stubCheck(status: SyncStatus): typeof checkSync {
  return vi.fn(() => Promise.resolve(status)) as unknown as typeof checkSync
}

function renderScreen(overrides: Partial<Parameters<typeof SettingsScreen>[0]> = {}) {
  const onImport = vi.fn()
  const onSyncSettingsChange = vi.fn()
  const onAdoptRemote = vi.fn()
  const onPushNow = vi.fn()
  const props = {
    doc: docWith(9, TARGET),
    onImport,
    lastSavedAt: null,
    readOnlyMessage: null,
    onSyncSettingsChange,
    onAdoptRemote,
    onPushNow,
    ...overrides,
  }
  render(<SettingsScreen {...props} />)
  return { onImport, onSyncSettingsChange, onAdoptRemote, onPushNow }
}

describe('the conflict prompt', () => {
  it('shows both counts and changes nothing until the user picks', async () => {
    const remote = docWith(12, TARGET)
    const handlers = renderScreen({
      checkSyncImpl: stubCheck({
        kind: 'conflict',
        localSessions: 9,
        remoteSessions: 12,
        remote,
      }),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Check the service' }))

    await waitFor(() =>
      screen.getByRole('heading', { name: /Both copies have sessions the other does not/ }),
    )

    // Both numbers, in plain text, so the choice can be made from the screen.
    const status = screen.getByRole('status')
    expect(status.textContent).toContain('12 sessions')
    expect(status.textContent).toContain('9')
    expect(status.textContent).toContain('Nothing has been changed.')

    // Nothing has happened in either direction.
    expect(handlers.onAdoptRemote).not.toHaveBeenCalled()
    expect(handlers.onPushNow).not.toHaveBeenCalled()

    // Each option is a separate, explicitly-labelled click.
    fireEvent.click(screen.getByRole('button', { name: /Use the service copy \(12 sessions\)/ }))
    expect(handlers.onAdoptRemote).toHaveBeenCalledTimes(1)
    expect(handlers.onAdoptRemote.mock.calls[0]?.[0]).toBe(remote)
    expect(handlers.onPushNow).not.toHaveBeenCalled()
  })

  it('offers the opposite choice too, so neither direction is the default', async () => {
    const handlers = renderScreen({
      checkSyncImpl: stubCheck({
        kind: 'conflict',
        localSessions: 9,
        remoteSessions: 12,
        remote: docWith(12, TARGET),
      }),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Check the service' }))
    const keep = await waitFor(() =>
      screen.getByRole('button', { name: /Keep this device \(9 sessions\)/ }),
    )

    fireEvent.click(keep)
    expect(handlers.onPushNow).toHaveBeenCalledTimes(1)
    expect(handlers.onAdoptRemote).not.toHaveBeenCalled()
  })

  it('treats local-ahead as safe and offers only the upload', async () => {
    renderScreen({
      checkSyncImpl: stubCheck({ kind: 'local-ahead', localSessions: 12, remoteSessions: 9 }),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Check the service' }))
    await waitFor(() => screen.getByRole('button', { name: /Upload this device/ }))

    expect(screen.getByRole('status').textContent).toContain('uploading loses nothing')
    expect(screen.queryByRole('button', { name: /discard/ })).toBeNull()
  })

  it('reports a failure without offering to change anything', async () => {
    renderScreen({
      checkSyncImpl: stubCheck({ kind: 'failed', reason: 'network', error: 'Failed to fetch' }),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Check the service' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Failed to fetch'))

    expect(screen.getByRole('status').textContent).toContain('nothing was changed')
    expect(screen.queryByRole('button', { name: /Upload this device/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Use the/ })).toBeNull()
  })
})

describe('the secret field is write-only', () => {
  it('never renders the stored secret', () => {
    renderScreen()

    expect(document.body.textContent).not.toContain(STORED_SECRET)
    expect(document.body.innerHTML).not.toContain(STORED_SECRET)

    const field = screen.getByLabelText('Shared secret') as HTMLInputElement
    expect(field.value).toBe('')
    // Masked, so it is not readable over a shoulder or in a screenshot either.
    expect(field.type).toBe('password')
    expect(field.placeholder).toMatch(/stored/)
  })

  it('keeps the stored secret when the field is left blank', () => {
    const handlers = renderScreen()

    fireEvent.change(screen.getByLabelText('Service address'), {
      target: { value: 'http://192.168.1.40:8787' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save sync settings' }))

    expect(handlers.onSyncSettingsChange).toHaveBeenCalledWith({
      baseUrl: 'http://192.168.1.40:8787',
      secret: STORED_SECRET,
    })
  })

  it('replaces the stored secret when something is typed', () => {
    const handlers = renderScreen()

    fireEvent.change(screen.getByLabelText('Shared secret'), { target: { value: 'the-new-one' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save sync settings' }))

    expect(handlers.onSyncSettingsChange).toHaveBeenCalledWith({
      baseUrl: TARGET.baseUrl,
      secret: 'the-new-one',
    })
    // Cleared from the field afterwards, so it is not left sitting on screen.
    expect((screen.getByLabelText('Shared secret') as HTMLInputElement).value).toBe('')
  })

  it('refuses to configure sync with no secret at all', () => {
    const handlers = renderScreen({ doc: docWith(0, null) })

    fireEvent.change(screen.getByLabelText('Service address'), {
      target: { value: 'http://127.0.0.1:8787' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save sync settings' }))

    expect(handlers.onSyncSettingsChange).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toMatch(/shared secret is required/)
  })

  it('turns sync off with an explicit null', () => {
    const handlers = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Stop syncing' }))
    expect(handlers.onSyncSettingsChange).toHaveBeenCalledWith(null)
  })

  it('warns that an export contains the secret', () => {
    renderScreen()
    expect(document.body.textContent).toContain('The secret is stored inside the document')
  })
})
