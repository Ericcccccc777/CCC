import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RemoteControlPopup } from '@renderer/components/RemoteControlPopup'

class RemoteControlPopupTests {
  static makeProps(overrides: Partial<Parameters<typeof RemoteControlPopup>[0]> = {}) {
    return {
      sessionName: 'my-session',
      sessionId:   1,
      busy:        false,
      onActivate:  vi.fn(),
      onClose:     vi.fn(),
      ...overrides,
    }
  }

  static run(): void {
    describe('RemoteControlPopup', () => {
      describe('menu view', () => {
        it('renders the centered session name as the only header text', () => {
          render(<RemoteControlPopup {...RemoteControlPopupTests.makeProps()} />)
          expect(screen.getByText('my-session')).toBeDefined()
          expect(screen.queryByText('Remote Control')).toBeNull()
        })

        it('top-right close button calls onClose', () => {
          const onClose = vi.fn()
          render(<RemoteControlPopup {...RemoteControlPopupTests.makeProps({ onClose })} />)
          fireEvent.click(screen.getByLabelText('Close'))
          expect(onClose).toHaveBeenCalledOnce()
        })

        it('renders both option cards', () => {
          render(<RemoteControlPopup {...RemoteControlPopupTests.makeProps()} />)
          expect(screen.getByLabelText('Phone remote control via QR code')).toBeDefined()
          expect(screen.getByLabelText('Local phone mirror')).toBeDefined()
        })

        it('local mirror card is enabled (not disabled)', () => {
          render(<RemoteControlPopup {...RemoteControlPopupTests.makeProps()} />)
          const mirror = screen.getByLabelText('Local phone mirror') as HTMLButtonElement
          expect(mirror.disabled).toBe(false)
        })
      })

      describe('Claude App option (not busy)', () => {
        it('calls onActivate exactly once and shows the QR view', () => {
          const onActivate = vi.fn()
          render(<RemoteControlPopup {...RemoteControlPopupTests.makeProps({ onActivate })} />)
          fireEvent.click(screen.getByLabelText('Phone remote control via QR code'))
          expect(onActivate).toHaveBeenCalledOnce()
          // QR frame rendered
          expect(document.querySelector('.remote-popup-qr-frame svg')).not.toBeNull()
        })

        it('Done button calls onClose', () => {
          const onClose = vi.fn()
          render(<RemoteControlPopup {...RemoteControlPopupTests.makeProps({ onClose })} />)
          fireEvent.click(screen.getByLabelText('Phone remote control via QR code'))
          fireEvent.click(screen.getByText('Done'))
          expect(onClose).toHaveBeenCalledOnce()
        })

        it('Back button returns to the menu view', () => {
          render(<RemoteControlPopup {...RemoteControlPopupTests.makeProps()} />)
          fireEvent.click(screen.getByLabelText('Phone remote control via QR code'))
          fireEvent.click(screen.getByText('Back'))
          expect(screen.getByLabelText('Phone remote control via QR code')).toBeDefined()
          expect(document.querySelector('.remote-popup-qr-frame')).toBeNull()
        })
      })

      describe('Claude App option (busy)', () => {
        it('does NOT call onActivate when session is busy', () => {
          const onActivate = vi.fn()
          render(<RemoteControlPopup {...RemoteControlPopupTests.makeProps({ busy: true, onActivate })} />)
          fireEvent.click(screen.getByLabelText('Phone remote control via QR code'))
          expect(onActivate).not.toHaveBeenCalled()
        })

        it('shows the busy message instead of the QR view', () => {
          render(<RemoteControlPopup {...RemoteControlPopupTests.makeProps({ busy: true })} />)
          fireEvent.click(screen.getByLabelText('Phone remote control via QR code'))
          expect(screen.getByText(/currently responding/i)).toBeDefined()
          expect(document.querySelector('.remote-popup-qr-frame')).toBeNull()
        })

        it('Back button returns to the menu view from the busy view', () => {
          render(<RemoteControlPopup {...RemoteControlPopupTests.makeProps({ busy: true })} />)
          fireEvent.click(screen.getByLabelText('Phone remote control via QR code'))
          fireEvent.click(screen.getByText('Back'))
          expect(screen.getByLabelText('Phone remote control via QR code')).toBeDefined()
        })
      })

      describe('Local Mirror option', () => {
        it('calls window.ccc.getLocalMirrorUrl on click and shows mirror QR when resolved', async () => {
          const mockUrl = 'http://192.168.1.5:54321/view/1'
          ;(window as unknown as Record<string, unknown>).ccc = {
            ...((window as unknown as Record<string, unknown>).ccc ?? {}),
            getLocalMirrorUrl: vi.fn().mockResolvedValue(mockUrl),
          }
          render(<RemoteControlPopup {...RemoteControlPopupTests.makeProps()} />)
          fireEvent.click(screen.getByLabelText('Local phone mirror'))
          // After the async call resolves the QR frame appears
          await screen.findByText(mockUrl)
          expect(document.querySelector('.remote-popup-qr-frame svg')).not.toBeNull()
        })
      })
    })
  }
}

RemoteControlPopupTests.run()
