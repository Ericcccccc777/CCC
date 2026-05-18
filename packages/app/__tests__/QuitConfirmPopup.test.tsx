import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuitConfirmPopup, type QuitConfirmPopupProps } from '@renderer/components/QuitConfirmPopup'

class QuitConfirmPopupTests {
  static makeProps(overrides: Partial<QuitConfirmPopupProps> = {}): QuitConfirmPopupProps {
    return {
      sessionCount: 0,
      onConfirm:    vi.fn(),
      onCancel:     vi.fn(),
      ...overrides,
    }
  }

  static run(): void {
    describe('QuitConfirmPopup', () => {
      it('renders title and zero-session body when sessionCount=0', () => {
        render(<QuitConfirmPopup {...QuitConfirmPopupTests.makeProps()} />)
        expect(screen.getByText('Quit CCC?')).toBeDefined()
        expect(screen.getByText('Close CCC and exit completely?')).toBeDefined()
      })

      it('renders the session-count body when sessionCount > 0', () => {
        render(<QuitConfirmPopup {...QuitConfirmPopupTests.makeProps({ sessionCount: 3 })} />)
        expect(screen.getByText(/3 active sessions/i)).toBeDefined()
      })

      it('singularises the session-count body for sessionCount=1', () => {
        render(<QuitConfirmPopup {...QuitConfirmPopupTests.makeProps({ sessionCount: 1 })} />)
        expect(screen.getByText(/1 active session/)).toBeDefined()
        // The plural-s should NOT be present.
        expect(screen.queryByText(/1 active sessions/)).toBeNull()
      })

      it('renders Cancel + Quit buttons', () => {
        render(<QuitConfirmPopup {...QuitConfirmPopupTests.makeProps()} />)
        expect(screen.getByText('Cancel')).toBeDefined()
        expect(screen.getByText('Quit')).toBeDefined()
      })

      it('clicking Quit fires onConfirm exactly once', () => {
        const onConfirm = vi.fn()
        render(<QuitConfirmPopup {...QuitConfirmPopupTests.makeProps({ onConfirm })} />)
        fireEvent.click(screen.getByText('Quit'))
        expect(onConfirm).toHaveBeenCalledTimes(1)
      })

      it('clicking Cancel fires onCancel exactly once', () => {
        const onCancel = vi.fn()
        render(<QuitConfirmPopup {...QuitConfirmPopupTests.makeProps({ onCancel })} />)
        fireEvent.click(screen.getByText('Cancel'))
        expect(onCancel).toHaveBeenCalledTimes(1)
      })

      it('pressing ESC fires onCancel', () => {
        const onCancel = vi.fn()
        render(<QuitConfirmPopup {...QuitConfirmPopupTests.makeProps({ onCancel })} />)
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(onCancel).toHaveBeenCalledTimes(1)
      })

      it('pressing Enter fires onConfirm', () => {
        const onConfirm = vi.fn()
        render(<QuitConfirmPopup {...QuitConfirmPopupTests.makeProps({ onConfirm })} />)
        fireEvent.keyDown(window, { key: 'Enter' })
        expect(onConfirm).toHaveBeenCalledTimes(1)
      })

      it('the Quit button carries the danger modifier class', () => {
        render(<QuitConfirmPopup {...QuitConfirmPopupTests.makeProps()} />)
        const btn = screen.getByText('Quit')
        expect(btn.className).toMatch(/quit-confirm-popup__btn--danger/)
      })
    })
  }
}

QuitConfirmPopupTests.run()
