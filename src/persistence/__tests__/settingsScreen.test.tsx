// @vitest-environment jsdom
//
// Export / import UI tests.
//
// The component lives in `src/ui/`, but its test lives here because brief 05
// owns `src/persistence/__tests__/**` and only the export/import half of
// `SettingsScreen.tsx` — brief 06 owns `src/ui/__tests__/` and the shell.
//
// What is worth testing here is not the markup. It is that **import cannot
// happen by accident**: a valid file only ever reaches `onImport` after an
// explicit confirmation of a summary, and an invalid file never reaches it at
// all. Both are asserted through `onImport` call counts rather than by reading
// the DOM for reassurance.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { StateDoc } from '../../domain/types.ts'
import { LADDERS } from '../../domain/ladders.ts'
import { midProgram } from '../../domain/__tests__/fixtures.ts'
import { serialise } from '../codec.ts'
import { SettingsScreen, exportFilename } from '../../ui/SettingsScreen.tsx'

// ─── Download capture ───────────────────────────────────────────────────────

interface CapturedDownload {
  readonly filename: string
  readonly blob: Blob
}

let downloads: CapturedDownload[] = []
let blobs: Blob[] = []
const realClick = HTMLAnchorElement.prototype.click

beforeEach(() => {
  downloads = []
  blobs = []
  URL.createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob)
    return `blob:mock/${blobs.length - 1}`
  }) as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn()
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement): void {
    const index = Number(this.href.split('/').pop())
    const blob = blobs[index]
    if (blob) downloads.push({ filename: this.download, blob })
  }
})

afterEach(() => {
  HTMLAnchorElement.prototype.click = realClick
  vi.restoreAllMocks()
})

function chooseFile(name: string, contents: string): void {
  const input = screen.getByLabelText('Choose a state file')
  const file = new File([contents], name, { type: 'application/json' })
  fireEvent.change(input, { target: { files: [file] } })
}

// ─── Storage state ──────────────────────────────────────────────────────────

describe('storage state', () => {
  it('shows sessions completed, the last save time, and the persistence grant', () => {
    const doc: StateDoc = {
      ...midProgram,
      settings: { ...midProgram.settings, persistGranted: true },
    }
    render(
      <SettingsScreen
        doc={doc}
        onImport={vi.fn()}
        lastSavedAt="2026-07-20T08:00:00.000Z"
        readOnlyMessage={null}
      />,
    )
    expect(screen.getByText(String(midProgram.sessionsCompleted))).toBeTruthy()
    expect(screen.getByText(/granted/)).toBeTruthy()
    // A real save time, not "never".
    expect(screen.queryByText('never')).toBeNull()
    expect(screen.getByText(new Date('2026-07-20T08:00:00.000Z').toLocaleString())).toBeTruthy()
  })

  it('says the browser declined persistence, and why that matters', () => {
    const doc: StateDoc = {
      ...midProgram,
      settings: { ...midProgram.settings, persistGranted: false },
    }
    render(<SettingsScreen doc={doc} onImport={vi.fn()} lastSavedAt={null} readOnlyMessage={null} />)
    expect(screen.getByText(/can be evicted/)).toBeTruthy()
    expect(screen.getByText('never')).toBeTruthy()
  })
})

// ─── Export ─────────────────────────────────────────────────────────────────

describe('export', () => {
  it('names the file by session count, not by date', () => {
    expect(exportFilename(midProgram)).toBe(
      `sports-app-${midProgram.sessionsCompleted}-sessions.json`,
    )
    expect(exportFilename({ ...midProgram, sessionsCompleted: 0 })).toBe(
      'sports-app-0-sessions.json',
    )
  })

  it('downloads the serialised document under that name', async () => {
    render(
      <SettingsScreen
        doc={midProgram}
        onImport={vi.fn()}
        lastSavedAt={null}
        readOnlyMessage={null}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`Export sports-app-${midProgram.sessionsCompleted}-sessions\\.json`),
      }),
    )

    expect(downloads).toHaveLength(1)
    expect(downloads[0]?.filename).toBe(
      `sports-app-${midProgram.sessionsCompleted}-sessions.json`,
    )
    // And the bytes are exactly what the codec produced — the export file is the
    // backup, so it must be the same text the store holds.
    await expect(downloads[0]?.blob.text()).resolves.toBe(serialise(midProgram))
  })

  it('offers the unreadable stored text for repair, byte-identical', async () => {
    const broken = serialise(midProgram).replace('"cyclePosition": 9', '"cyclePosition": 9,,')
    render(
      <SettingsScreen
        doc={null}
        onImport={vi.fn()}
        unreadableText={broken}
        lastSavedAt={null}
        readOnlyMessage={'read-only: the saved document could not be parsed'}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Download the unreadable file/ }))
    await expect(downloads[0]?.blob.text()).resolves.toBe(broken)
    expect(downloads[0]?.filename).toBe('sports-app-unreadable.json')
  })
})

// ─── Import ─────────────────────────────────────────────────────────────────

describe('import', () => {
  it('shows a confirmation summary and does not replace anything yet', async () => {
    const onImport = vi.fn()
    render(
      <SettingsScreen doc={midProgram} onImport={onImport} lastSavedAt={null} readOnlyMessage={null} />,
    )

    const incoming: StateDoc = { ...midProgram, sessionsCompleted: 12 }
    chooseFile('sports-app-12-sessions.json', serialise(incoming))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Replace everything with/ })).toBeTruthy()
    })
    expect(screen.getByText(/12 completed sessions/)).toBeTruthy()
    // Per-ladder rungs, 1-based for a human reading the dialog.
    expect(screen.getByRole('row', { name: /push/ }).textContent).toContain(
      `rung 4 of ${LADDERS.push.rungs.length}`,
    )
    // Nothing has been replaced.
    expect(onImport).not.toHaveBeenCalled()
  })

  it('replaces only after the confirmation is clicked', async () => {
    const onImport = vi.fn()
    render(
      <SettingsScreen doc={midProgram} onImport={onImport} lastSavedAt={null} readOnlyMessage={null} />,
    )
    chooseFile('backup.json', serialise(midProgram))
    await waitFor(() => screen.getByRole('button', { name: 'Replace my data' }))

    fireEvent.click(screen.getByRole('button', { name: 'Replace my data' }))
    expect(onImport).toHaveBeenCalledTimes(1)
    expect(onImport.mock.calls[0]?.[0]).toEqual(midProgram)
  })

  it('replaces nothing when cancelled', async () => {
    const onImport = vi.fn()
    render(
      <SettingsScreen doc={midProgram} onImport={onImport} lastSavedAt={null} readOnlyMessage={null} />,
    )
    chooseFile('backup.json', serialise(midProgram))
    await waitFor(() => screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onImport).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Replace my data' })).toBeNull()
  })

  it('warns when an older backup would discard sessions — the realistic mistake', async () => {
    render(
      <SettingsScreen doc={midProgram} onImport={vi.fn()} lastSavedAt={null} readOnlyMessage={null} />,
    )
    const older: StateDoc = {
      ...midProgram,
      sessionsCompleted: 4,
      history: midProgram.history.slice(0, 4),
    }
    chooseFile('sports-app-4-sessions.json', serialise(older))

    await waitFor(() => {
      const discarded = midProgram.sessionsCompleted - 4
      expect(screen.getByText(new RegExp(`would discard ${discarded} sessions`))).toBeTruthy()
    })
  })

  it('rejects a truncated file, says nothing changed, and replaces nothing', async () => {
    const onImport = vi.fn()
    render(
      <SettingsScreen doc={midProgram} onImport={onImport} lastSavedAt={null} readOnlyMessage={null} />,
    )
    chooseFile('truncated.json', serialise(midProgram).slice(0, 400))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /truncated\.json was not imported/ })).toBeTruthy()
    })
    expect(screen.getByText(/existing data is untouched/)).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('not valid JSON')
    expect(onImport).not.toHaveBeenCalled()
  })

  it('rejects an unrelated JSON file by name', async () => {
    const onImport = vi.fn()
    render(
      <SettingsScreen doc={midProgram} onImport={onImport} lastSavedAt={null} readOnlyMessage={null} />,
    )
    chooseFile('package.json', '{"name":"something-else","version":"1.0.0"}')

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('schemaVersion')
    })
    expect(onImport).not.toHaveBeenCalled()
  })

  it('rejects a file whose rung index is out of range for the real ladders', async () => {
    const onImport = vi.fn()
    render(
      <SettingsScreen doc={midProgram} onImport={onImport} lastSavedAt={null} readOnlyMessage={null} />,
    )
    const bad: StateDoc = {
      ...midProgram,
      ladders: {
        ...midProgram.ladders,
        core: { ...midProgram.ladders.core, rungIndex: LADDERS.core.rungs.length + 3 },
      },
    }
    chooseFile('hand-edited.json', serialise(bad))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('ladders.core.rungIndex')
    })
    expect(onImport).not.toHaveBeenCalled()
  })

  it('still allows an import while read-only — that is the repair path', async () => {
    const onImport = vi.fn()
    render(
      <SettingsScreen
        doc={null}
        onImport={onImport}
        unreadableText={'{ broken'}
        lastSavedAt={null}
        readOnlyMessage={'read-only: the saved document could not be parsed'}
      />,
    )
    chooseFile('repaired.json', serialise(midProgram))
    await waitFor(() => screen.getByRole('button', { name: 'Replace my data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Replace my data' }))
    expect(onImport).toHaveBeenCalledTimes(1)
  })
})
