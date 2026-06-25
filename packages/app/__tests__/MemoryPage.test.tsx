import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryPage } from '@renderer/dashboard/MemoryPage'
import { getStrings } from '@renderer/dashboard/strings'
import type { HarnessSummary } from '../src/shared/harness'

const s = getStrings('en')

const summary: HarnessSummary = {
  installed:    true,
  install:      null,
  constitution: null,
  workflowDoc:  null,
  checkpoints:  [],
  todolist:     null,
  memory: {
    scratchpad:   'Current objective: ship the memory page',
    observations: [{ kind: 'decision', summary: 'Use jsonl files for memory', feature: 'memory' }],
    snapshots:    [{ kind: 'session-snapshot', focus: 'OTP race condition', open_problems: ['retry storm'] }],
    archive:      [],
    conventions:  null,
  },
}

interface Bridge {
  harnessListSessions: ReturnType<typeof vi.fn>
  harnessReadSession:  ReturnType<typeof vi.fn>
  resumeSession:       ReturnType<typeof vi.fn>
}

function setBridge(over: Partial<Bridge> = {}): Bridge {
  const b: Bridge = {
    harnessListSessions: vi.fn().mockResolvedValue([
      { id: 'abc-123', title: 'Fix the login bug', messageCount: 12, mtimeMs: 1_700_000_000_000 },
    ]),
    harnessReadSession: vi.fn().mockResolvedValue([
      { role: 'user', text: 'please fix login', tools: [] },
      { role: 'assistant', text: 'fixed the login flow', tools: ['Bash'] },
    ]),
    resumeSession: vi.fn(),
    ...over,
  }
  ;(globalThis as unknown as { window: { ccc: Bridge } }).window.ccc = b
  return b
}

describe('MemoryPage', () => {
  let bridge: Bridge
  beforeEach(() => { bridge = setBridge() })

  it('Memory sub-tab shows CCC-MAGI tiers (working / recall / snapshots)', () => {
    render(<MemoryPage summary={summary} s={s} workspace="/ws" />)
    expect(screen.getByText(/ship the memory page/)).toBeDefined()       // working memory (scratchpad)
    expect(screen.getByText('Use jsonl files for memory')).toBeDefined() // recall observation
    expect(screen.getByText('OTP race condition')).toBeDefined()         // snapshot focus
  })

  it('History sub-tab lists sessions (like /resume) and opens one on click', async () => {
    render(<MemoryPage summary={summary} s={s} workspace="/ws" />)
    fireEvent.click(screen.getByText(s.memSubHistory))
    await waitFor(() => expect(bridge.harnessListSessions).toHaveBeenCalledWith('/ws'))
    fireEvent.click(await screen.findByText('Fix the login bug'))
    await waitFor(() => expect(bridge.harnessReadSession).toHaveBeenCalledWith('/ws', 'abc-123'))
    expect(await screen.findByText('fixed the login flow')).toBeDefined()
  })

  it('"Resume this session" calls resumeSession with the session id', async () => {
    render(<MemoryPage summary={summary} s={s} workspace="/ws" />)
    fireEvent.click(screen.getByText(s.memSubHistory))
    const resumeBtn = await screen.findByText(s.sessResume)
    fireEvent.click(resumeBtn)
    expect(bridge.resumeSession).toHaveBeenCalledWith('/ws', 'abc-123')
  })

  it('shows the empty state when no sessions exist', async () => {
    bridge = setBridge({ harnessListSessions: vi.fn().mockResolvedValue([]) })
    render(<MemoryPage summary={summary} s={s} workspace="/ws" />)
    fireEvent.click(screen.getByText(s.memSubHistory))
    expect(await screen.findByText(s.sessEmpty)).toBeDefined()
  })
})
