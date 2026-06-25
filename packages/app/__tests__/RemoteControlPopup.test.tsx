import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RemoteControlPopup } from '@renderer/components/RemoteControlPopup'

function makeProps(overrides: Partial<Parameters<typeof RemoteControlPopup>[0]> = {}) {
  return {
    sessionName: 'my-session',
    busy:        false,
    available:   true,
    onActivate:  vi.fn(),
    onClose:     vi.fn(),
    ...overrides,
  }
}

describe('RemoteControlPopup (native Remote Control)', () => {
  it('intro shows the Enable button and a close that calls onClose', () => {
    const onClose = vi.fn()
    render(<RemoteControlPopup {...makeProps({ onClose })} />)
    expect(screen.getByText('Enable Remote Control')).toBeDefined()
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('enabling (not busy) calls onActivate once and shows the guide steps', () => {
    const onActivate = vi.fn()
    render(<RemoteControlPopup {...makeProps({ onActivate })} />)
    fireEvent.click(screen.getByText('Enable Remote Control'))
    expect(onActivate).toHaveBeenCalledOnce()
    expect(screen.getByText('Remote Control enabled')).toBeDefined()
    expect(screen.getByText(/Push when actions required/)).toBeDefined()  // mobile approval step
  })

  it('does NOT activate when the session is busy; shows the busy message', () => {
    const onActivate = vi.fn()
    render(<RemoteControlPopup {...makeProps({ busy: true, onActivate })} />)
    fireEvent.click(screen.getByText('Enable Remote Control'))
    expect(onActivate).not.toHaveBeenCalled()
    expect(screen.getByText(/currently responding/i)).toBeDefined()
  })

  it('guide Done calls onClose; Back returns to intro', () => {
    const onClose = vi.fn()
    render(<RemoteControlPopup {...makeProps({ onClose })} />)
    fireEvent.click(screen.getByText('Enable Remote Control'))
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('Enable Remote Control')).toBeDefined()  // back at intro
    fireEvent.click(screen.getByText('Enable Remote Control'))
    fireEvent.click(screen.getByText('Done'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('unavailable (Codex/API session) shows a note and no Enable button', () => {
    render(<RemoteControlPopup {...makeProps({ available: false })} />)
    expect(screen.getByText(/needs a Claude .* session/)).toBeDefined()
    expect(screen.queryByText('Enable Remote Control')).toBeNull()
  })
})
