import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MagiUpdatePanel } from '@renderer/dashboard/MagiUpdatePanel'
import { getStrings } from '@renderer/dashboard/strings'

// The two-tier update flow, now living in the console (dashboard) Overview.
const s = getStrings('en')

function setMagiUpdate(magiUpdate: ReturnType<typeof vi.fn>): void {
  ;(globalThis as unknown as { window: { ccc: { magiUpdate: unknown } } }).window.ccc = { magiUpdate }
}

describe('MagiUpdatePanel (console update flow)', () => {
  it('safe update (changed) calls flag-less and shows the updated note', async () => {
    const magiUpdate = vi.fn().mockResolvedValue({ ok: true })
    setMagiUpdate(magiUpdate)
    render(<MagiUpdatePanel workspace="/tmp/demo" s={s} />)
    fireEvent.click(screen.getByText(s.updateMagi))
    await waitFor(() => expect(magiUpdate).toHaveBeenCalledWith('/tmp/demo', false))
    expect(await screen.findByText(s.updateDone, { exact: false })).toBeDefined()
  })

  it('no-change update shows "already up to date"', async () => {
    const magiUpdate = vi.fn().mockResolvedValue({ ok: true, noChanges: true })
    setMagiUpdate(magiUpdate)
    render(<MagiUpdatePanel workspace="/tmp/demo" s={s} />)
    fireEvent.click(screen.getByText(s.updateMagi))
    expect(await screen.findByText(s.updateUpToDate, { exact: false })).toBeDefined()
  })

  it('dirty tree → explains why + offers a Force update that re-runs with force=true', async () => {
    const magiUpdate = vi.fn()
      .mockResolvedValueOnce({ ok: false, needsForce: true })  // safe refused (dirty tree)
      .mockResolvedValueOnce({ ok: true })                      // force succeeds
    setMagiUpdate(magiUpdate)
    render(<MagiUpdatePanel workspace="/tmp/demo" s={s} />)
    fireEvent.click(screen.getByText(s.updateMagi))
    const force = await screen.findByText(s.updateForce)
    // the dirty-tree explanation + commit tip are shown so the step is clear
    expect(screen.getByText(s.updateDirtyTitle, { exact: false })).toBeDefined()
    expect(screen.getByText(s.updateCommitTip)).toBeDefined()
    await waitFor(() => expect(magiUpdate).toHaveBeenNthCalledWith(1, '/tmp/demo', false))
    fireEvent.click(force)
    await waitFor(() => expect(magiUpdate).toHaveBeenNthCalledWith(2, '/tmp/demo', true))
    expect(await screen.findByText(s.updateDone, { exact: false })).toBeDefined()
  })

  it('other failure shows the error message and a retry', async () => {
    const magiUpdate = vi.fn().mockResolvedValue({ ok: false, error: 'network down' })
    setMagiUpdate(magiUpdate)
    render(<MagiUpdatePanel workspace="/tmp/demo" s={s} />)
    fireEvent.click(screen.getByText(s.updateMagi))
    expect(await screen.findByText('network down', { exact: false })).toBeDefined()
    expect(screen.getByText(s.updateRetry)).toBeDefined()
  })
})
