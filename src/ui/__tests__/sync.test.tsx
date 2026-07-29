// @vitest-environment jsdom
//
// `/account`'s two non-training sections: the sync settings, and the way out of
// the read-only latch.
//
// Both exist because deleting the old settings screen would otherwise have left
// `src/persistence/sync.ts` unreachable and a corrupt document unrecoverable. The
// tests that matter most here are the two that assert an *absence*: the secret is
// never rendered back, and a remote holding sessions this device has never seen
// produces no button that would discard them.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateDoc } from '../../domain/types.ts'
import { prescribe, recordSession, toSessionResult } from '../../domain/schedule.ts'
import { parse, serialise } from '../../persistence/codec.ts'
import { SESSION_KEY } from '../../persistence/session.ts'
import { STORAGE_KEYS, emptyDoc, isReadOnly } from '../../persistence/store.ts'
import { SECRET_HEADER } from '../../persistence/sync.ts'
import { renderApp, resetBrowserState, seedUser } from './harness.tsx'

const USERNAME = 'alice'
const SECRET = 'a-deployment-secret-nobody-should-see'
const ADDRESS = 'http://192.168.1.20:8787'

function trained(count: number): StateDoc {
  const anchor = Date.parse('2026-01-01T07:00:00.000Z')
  let doc = emptyDoc(USERNAME)
  for (let index = 0; index < count; index += 1) {
    const at = new Date(anchor + index * 86_400_000).toISOString()
    doc = recordSession(doc, toSessionResult(prescribe(doc, 'medium'), at))
  }
  return doc
}

function withSync(doc: StateDoc, baseUrl: string, secret: string): StateDoc {
  return { ...doc, settings: { ...doc.settings, sync: { baseUrl, secret } } }
}

function storedDoc(): StateDoc {
  const result = parse(localStorage.getItem(STORAGE_KEYS.live(USERNAME)) ?? '', {
    username: USERNAME,
  })
  if (!result.ok) throw new Error(result.error)
  return result.doc
}

function field(label: string | RegExp): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement
}

/** A `GET /api/state` that answers with `remote`, or 404 when it is null. */
function serviceHolding(remote: StateDoc | null): ReturnType<typeof vi.fn> {
  return vi.fn(async () =>
    remote === null
      ? new Response('missing', { status: 404 })
      : new Response(serialise(remote), { status: 200 }),
  )
}

beforeEach(() => {
  cleanup()
  resetBrowserState()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ─── Saving ─────────────────────────────────────────────────────────────────

describe('the sync settings form', () => {
  it('writes the address and the secret into the document', async () => {
    seedUser(trained(2))
    await renderApp('/account')

    fireEvent.change(field('Service address'), { target: { value: ADDRESS } })
    fireEvent.change(field('Secret'), { target: { value: SECRET } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(storedDoc().settings.sync).toEqual({ baseUrl: ADDRESS, secret: SECRET }),
    )
    // The training history is untouched by a settings write.
    expect(storedDoc().history).toHaveLength(2)
  })

  it('never renders the stored secret back, in any form', async () => {
    seedUser(withSync(trained(2), ADDRESS, SECRET))
    const { container } = await renderApp('/account')

    // Not as text, not as a value attribute, not in the serialised markup.
    expect(container.innerHTML).not.toContain(SECRET)
    expect(document.body.textContent).not.toContain(SECRET)
    expect(field(/Replace the secret/).value).toBe('')
    // It says that one exists, which is not the same as showing it.
    expect(document.body.textContent).toContain('A secret is stored.')
  })

  it('keeps the stored secret when the field is left blank', async () => {
    seedUser(withSync(trained(1), 'http://old.example:8787', SECRET))
    await renderApp('/account')

    fireEvent.change(field('Service address'), { target: { value: ADDRESS } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(storedDoc().settings.sync?.baseUrl).toBe(ADDRESS))
    expect(storedDoc().settings.sync?.secret).toBe(SECRET)
  })

  it('empties the field after a save, so the typed secret does not linger', async () => {
    seedUser(trained(1))
    await renderApp('/account')

    fireEvent.change(field('Secret'), { target: { value: SECRET } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(storedDoc().settings.sync?.secret).toBe(SECRET))
    expect(field(/Replace the secret/).value).toBe('')
  })

  it('rejects an address that is not a full http address, and saves nothing', async () => {
    seedUser(trained(1))
    await renderApp('/account')

    fireEvent.change(field('Service address'), { target: { value: '192.168.1.20:8787' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/That is not a full address/)).toBeTruthy()
    expect(storedDoc().settings.sync).toBeNull()
  })

  it('accepts an empty address, which is the same-origin case', async () => {
    seedUser(withSync(trained(1), ADDRESS, ''))
    await renderApp('/account')

    fireEvent.change(field('Service address'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(storedDoc().settings.sync).toEqual({ baseUrl: '', secret: '' }))
  })

  it('stops syncing by removing the settings entirely, which takes the secret with them', async () => {
    seedUser(withSync(trained(1), ADDRESS, SECRET))
    await renderApp('/account')

    fireEvent.click(screen.getByRole('button', { name: 'Stop syncing' }))

    await waitFor(() => expect(storedDoc().settings.sync).toBeNull())
    expect(localStorage.getItem(STORAGE_KEYS.live(USERNAME))).not.toContain(SECRET)
    expect(screen.queryByRole('button', { name: 'Stop syncing' })).toBeNull()
  })
})

// ─── Checking ───────────────────────────────────────────────────────────────

describe('the connection check', () => {
  it('reports being in sync, and sends the secret in the header rather than the URL', async () => {
    const doc = withSync(trained(3), ADDRESS, SECRET)
    seedUser(doc)
    const fetchImpl = serviceHolding(doc)
    vi.stubGlobal('fetch', fetchImpl)

    await renderApp('/account')
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))

    const status = await screen.findByTestId('sync-status')
    expect(status.textContent).toContain('In sync')
    expect(status.textContent).toContain('3 sessions')

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`${ADDRESS}/api/state?user=alice`)
    expect(url).not.toContain(SECRET)
    expect((init.headers as Record<string, string>)[SECRET_HEADER]).toBe(SECRET)
  })

  it('tests the address currently in the field, not the one last saved', async () => {
    seedUser(withSync(trained(1), 'http://stale.example:8787', ''))
    const fetchImpl = serviceHolding(null)
    vi.stubGlobal('fetch', fetchImpl)

    await renderApp('/account')
    fireEvent.change(field('Service address'), { target: { value: ADDRESS } })
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))

    await screen.findByTestId('sync-status')
    expect(fetchImpl.mock.calls[0]?.[0]).toContain(ADDRESS)
  })

  it('offers a backup when the service is empty, because that loses nothing', async () => {
    const doc = withSync(trained(2), ADDRESS, '')
    seedUser(doc)
    const puts: RequestInit[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        if (init.method === 'PUT') {
          puts.push(init)
          return new Response('{}', { status: 200 })
        }
        return new Response('missing', { status: 404 })
      }),
    )

    await renderApp('/account')
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))

    expect((await screen.findByTestId('sync-status')).textContent).toContain('Reached, and empty')
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }))

    await screen.findByText(/The service now holds this device/)
    expect(puts).toHaveLength(1)
  })

  it('states a conflict in both numbers and offers nothing that would resolve it', async () => {
    // The remote is ahead: it holds sessions this device has never seen.
    seedUser(withSync(trained(2), ADDRESS, ''))
    vi.stubGlobal('fetch', serviceHolding(withSync(trained(5), ADDRESS, '')))

    await renderApp('/account')
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))

    const status = await screen.findByTestId('sync-status')
    expect(status.textContent).toContain('The service is ahead')
    expect(status.textContent).toContain('5 sessions')
    expect(status.textContent).toContain('2 sessions')
    // No upload, which would bury the remote's five, and no download, which
    // would discard the local two.
    expect(screen.queryByRole('button', { name: 'Back up now' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Download|Adopt|Replace/ })).toBeNull()
    expect(storedDoc().history).toHaveLength(2)
  })

  it('reports a service that cannot be reached, and blocks nothing', async () => {
    seedUser(withSync(trained(1), ADDRESS, ''))
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Failed to fetch'))),
    )

    await renderApp('/account')
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))

    expect((await screen.findByTestId('sync-status')).textContent).toContain('No answer')
    // The account page is still the account page.
    expect(screen.getByText('Total work ever')).toBeTruthy()
  })
})

// ─── The escape hatch ───────────────────────────────────────────────────────

describe('a corrupt document', () => {
  const BROKEN = '{ "schemaVersion": 3, this is not JSON'

  function seedCorrupt(): void {
    localStorage.setItem(SESSION_KEY, USERNAME)
    localStorage.setItem(STORAGE_KEYS.live(USERNAME), BROKEN)
  }

  it('offers the untouched bytes for download before offering to replace them', async () => {
    // jsdom implements neither of these. The spy on `click` is also what stops
    // jsdom logging an unimplemented navigation for the anchor.
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:stub')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }))
    const clicks: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this)
    })
    seedCorrupt()

    await renderApp('/account')

    expect(screen.getByText('Recovery')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Download the file' }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob
    expect(await blob.text()).toBe(BROKEN)
    expect(clicks[0]?.getAttribute('download')).toBe('alice-training-history.json')
    // And nothing was written on the way.
    expect(localStorage.getItem(STORAGE_KEYS.live(USERNAME))).toBe(BROKEN)
  })

  it('needs a second, explicit tap before it replaces anything', async () => {
    seedCorrupt()
    await renderApp('/account')

    fireEvent.click(screen.getByRole('button', { name: 'Replace it with an empty history' }))
    // One tap changes the label. It does not write.
    expect(localStorage.getItem(STORAGE_KEYS.live(USERNAME))).toBe(BROKEN)
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByRole('button', { name: 'Yes, replace it' })).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.live(USERNAME))).toBe(BROKEN)
  })

  it('replaces it on the second tap and lifts the read-only latch', async () => {
    seedCorrupt()
    await renderApp('/account')
    expect(isReadOnly(USERNAME)).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Replace it with an empty history' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, replace it' }))

    await waitFor(() => expect(storedDoc().history).toHaveLength(0))
    expect(isReadOnly(USERNAME)).toBe(false)
    // The page is now an ordinary account page, and the recovery section is gone.
    expect(await screen.findByText('Total work ever')).toBeTruthy()
    expect(screen.queryByText('Recovery')).toBeNull()
  })

  it('does not offer the sync form, because the settings live in the unreadable file', async () => {
    seedCorrupt()
    await renderApp('/account')
    expect(screen.queryByLabelText('Service address')).toBeNull()
  })
})
