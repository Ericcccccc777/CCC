import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApiProvidersPanel, type ApiProvidersPanelProps } from '@renderer/components/ApiProvidersPanel'
import type { ApiProviderListEntry } from '../src/shared/api-provider'

class ApiProvidersPanelTests {
  static makeProps(overrides: Partial<ApiProvidersPanelProps> = {}): ApiProvidersPanelProps {
    return {
      list:     vi.fn().mockResolvedValue([] as ApiProviderListEntry[]),
      save:     vi.fn().mockResolvedValue({ ok: true }),
      remove:   vi.fn().mockResolvedValue(undefined),
      test:     vi.fn().mockResolvedValue({ ok: true, message: 'Connected' }),
      ...overrides,
    }
  }

  static run(): void {
    describe('ApiProvidersPanel', () => {
      describe('empty state', () => {
        it('shows an Add button for every provider (DeepSeek + Kimi) when none configured', async () => {
          render(<ApiProvidersPanel {...ApiProvidersPanelTests.makeProps()} />)
          await waitFor(() => expect(screen.getByText(/Add DeepSeek/)).toBeDefined())
          expect(screen.getByText(/Add Kimi/)).toBeDefined()
        })

        it('opens the form when Add DeepSeek clicked', async () => {
          render(<ApiProvidersPanel {...ApiProvidersPanelTests.makeProps()} />)
          await waitFor(() => screen.getByText(/Add DeepSeek/))
          fireEvent.click(screen.getByText(/Add DeepSeek/))
          // Form fields appear
          expect(screen.getByPlaceholderText(/Paste your API key/i)).toBeDefined()
          expect(screen.getByText('Save')).toBeDefined()
          expect(screen.getByText('Cancel')).toBeDefined()
          expect(document.querySelector('.api-model-select')).toBeNull()
        })
      })

      describe('add form', () => {
        it('rejects save with empty key (no save call, error status shown)', async () => {
          const save = vi.fn().mockResolvedValue({ ok: true })
          render(<ApiProvidersPanel {...ApiProvidersPanelTests.makeProps({ save })} />)
          await waitFor(() => screen.getByText(/Add DeepSeek/))
          fireEvent.click(screen.getByText(/Add DeepSeek/))
          fireEvent.click(screen.getByText('Save'))
          await waitFor(() => expect(screen.getByText(/Enter a key first/i)).toBeDefined())
          expect(save).not.toHaveBeenCalled()
        })

        it('tests before saving, then saves with the typed key and a verification marker', async () => {
          const save = vi.fn().mockResolvedValue({ ok: true })
          const test = vi.fn().mockResolvedValue({ ok: true, message: 'Connected' })
          const list = vi.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValue([{ id: 'deepseek', modelId: 'deepseek-v4-flash', hasKey: true, verified: true }])
          render(<ApiProvidersPanel {...ApiProvidersPanelTests.makeProps({ save, test, list })} />)
          await waitFor(() => screen.getByText(/Add DeepSeek/))
          fireEvent.click(screen.getByText(/Add DeepSeek/))
          fireEvent.change(screen.getByPlaceholderText(/Paste your API key/i), { target: { value: 'sk-real' } })
          fireEvent.click(screen.getByText('Save'))
          await waitFor(() => expect(test).toHaveBeenCalledWith(
            { id: 'deepseek', modelId: 'deepseek-v4-flash' }, 'sk-real',
          ))
          await waitFor(() => expect(save).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'deepseek', modelId: 'deepseek-v4-flash', verifiedAt: expect.any(Number) }), 'sk-real',
          ))
          // Card replaces the form on success
          await waitFor(() => expect(screen.getByText('DeepSeek')).toBeDefined())
          expect(screen.getByText('Edit')).toBeDefined()
          expect(screen.getByText('Test')).toBeDefined()
          expect(screen.getByText('Remove')).toBeDefined()
          expect(document.querySelector('.api-model-select')).toBeNull()
        })

        it('does not save when the pre-save test fails', async () => {
          const save = vi.fn().mockResolvedValue({ ok: true })
          const test = vi.fn().mockResolvedValue({ ok: false, message: 'Invalid API key' })
          render(<ApiProvidersPanel {...ApiProvidersPanelTests.makeProps({ save, test })} />)
          await waitFor(() => screen.getByText(/Add DeepSeek/))
          fireEvent.click(screen.getByText(/Add DeepSeek/))
          fireEvent.change(screen.getByPlaceholderText(/Paste your API key/i), { target: { value: 'sk-bad' } })
          fireEvent.click(screen.getByText('Save'))
          await waitFor(() => expect(screen.getByText(/Invalid API key/i)).toBeDefined())
          expect(save).not.toHaveBeenCalled()
        })

        it('shows vault-unavailable message on save failure with that code', async () => {
          const save = vi.fn().mockResolvedValue({ ok: false, error: 'vault-unavailable' })
          render(<ApiProvidersPanel {...ApiProvidersPanelTests.makeProps({ save })} />)
          await waitFor(() => screen.getByText(/Add DeepSeek/))
          fireEvent.click(screen.getByText(/Add DeepSeek/))
          fireEvent.change(screen.getByPlaceholderText(/Paste your API key/i), { target: { value: 'sk-x' } })
          fireEvent.click(screen.getByText('Save'))
          await waitFor(() => expect(screen.getByText(/Encrypted storage unavailable/i)).toBeDefined())
        })

        it('Cancel closes the form without saving', async () => {
          const save = vi.fn()
          render(<ApiProvidersPanel {...ApiProvidersPanelTests.makeProps({ save })} />)
          await waitFor(() => screen.getByText(/Add DeepSeek/))
          fireEvent.click(screen.getByText(/Add DeepSeek/))
          fireEvent.click(screen.getByText('Cancel'))
          await waitFor(() => expect(screen.queryByPlaceholderText(/Paste your API key/i)).toBeNull())
          expect(save).not.toHaveBeenCalled()
        })

        it('Test (in form) calls test with typed key', async () => {
          const test = vi.fn().mockResolvedValue({ ok: true, message: 'Connected' })
          render(<ApiProvidersPanel {...ApiProvidersPanelTests.makeProps({ test })} />)
          await waitFor(() => screen.getByText(/Add DeepSeek/))
          fireEvent.click(screen.getByText(/Add DeepSeek/))
          fireEvent.change(screen.getByPlaceholderText(/Paste your API key/i), { target: { value: 'sk-test' } })
          fireEvent.click(screen.getByText('Test'))
          await waitFor(() => expect(test).toHaveBeenCalledWith(
            { id: 'deepseek', modelId: 'deepseek-v4-flash' }, 'sk-test',
          ))
        })

        it('the Kimi card tests + saves against the kimi provider + its default model', async () => {
          const save = vi.fn().mockResolvedValue({ ok: true })
          const test = vi.fn().mockResolvedValue({ ok: true, message: 'Connected' })
          render(<ApiProvidersPanel {...ApiProvidersPanelTests.makeProps({ save, test })} />)
          await waitFor(() => screen.getByText(/Add Kimi/))
          fireEvent.click(screen.getByText(/Add Kimi/))
          fireEvent.change(screen.getByPlaceholderText(/Paste your API key/i), { target: { value: 'sk-kimi' } })
          fireEvent.click(screen.getByText('Save'))
          await waitFor(() => expect(test).toHaveBeenCalledWith(
            { id: 'kimi', modelId: 'kimi-k2.6' }, 'sk-kimi',
          ))
          await waitFor(() => expect(save).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'kimi', modelId: 'kimi-k2.6', verifiedAt: expect.any(Number) }), 'sk-kimi',
          ))
        })
      })

      describe('configured state', () => {
        const configured = (modelId = 'deepseek-v4-flash'): ApiProviderListEntry[] =>
          [{ id: 'deepseek', modelId, hasKey: true, verified: true, verifiedAt: 12345 }]

        it('shows DeepSeek card with masked key and action buttons', async () => {
          render(<ApiProvidersPanel {...ApiProvidersPanelTests.makeProps({
            list: vi.fn().mockResolvedValue(configured()),
          })} />)
          await waitFor(() => expect(screen.getByText('DeepSeek')).toBeDefined())
          // Masked key uses the i18n placeholder dot string
          expect(document.querySelector('.api-card__key')?.textContent).toMatch(/•/)
          expect(screen.getByText('Edit')).toBeDefined()
          expect(screen.getByText('Test')).toBeDefined()
          expect(screen.getByText('Remove')).toBeDefined()
        })

        it('Test on configured card calls test with empty key (signals "use stored")', async () => {
          const test = vi.fn().mockResolvedValue({ ok: true, message: 'Connected' })
          render(<ApiProvidersPanel {...ApiProvidersPanelTests.makeProps({
            list: vi.fn().mockResolvedValue(configured('deepseek-v4-pro')),
            test,
          })} />)
          await waitFor(() => screen.getByText('DeepSeek'))
          fireEvent.click(screen.getByText('Test'))
          await waitFor(() => expect(test).toHaveBeenCalledWith(
            { id: 'deepseek', modelId: 'deepseek-v4-flash' }, '',
          ))
        })

        it('Test failure shows the returned error message', async () => {
          const test = vi.fn().mockResolvedValue({ ok: false, message: 'Invalid API key' })
          render(<ApiProvidersPanel {...ApiProvidersPanelTests.makeProps({
            list: vi.fn().mockResolvedValue(configured()),
            test,
          })} />)
          await waitFor(() => screen.getByText('DeepSeek'))
          fireEvent.click(screen.getByText('Test'))
          await waitFor(() => expect(screen.getByText(/Invalid API key/i)).toBeDefined())
        })

        it('Remove calls remove and reloads the empty state', async () => {
          const remove = vi.fn().mockResolvedValue(undefined)
          const list = vi.fn()
            .mockResolvedValueOnce(configured())
            .mockResolvedValue([])
          render(<ApiProvidersPanel {...ApiProvidersPanelTests.makeProps({ list, remove })} />)
          await waitFor(() => screen.getByText('DeepSeek'))
          fireEvent.click(screen.getByText('Remove'))
          await waitFor(() => expect(remove).toHaveBeenCalledWith('deepseek'))
          // DeepSeek card falls back to its empty "+ Add DeepSeek" affordance.
          await waitFor(() => expect(screen.getByText(/Add DeepSeek/)).toBeDefined())
        })

        it('Edit opens the key-only form without a model picker', async () => {
          render(<ApiProvidersPanel {...ApiProvidersPanelTests.makeProps({
            list: vi.fn().mockResolvedValue(configured('deepseek-v4-pro')),
          })} />)
          await waitFor(() => screen.getByText('DeepSeek'))
          fireEvent.click(screen.getByText('Edit'))
          await waitFor(() => expect(screen.getByText('Save')).toBeDefined())
          expect(document.querySelector('.api-form .api-model-select')).toBeNull()
        })
      })
    })
  }
}

ApiProvidersPanelTests.run()
