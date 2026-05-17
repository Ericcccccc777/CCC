import { describe, it, expect } from 'vitest'
import { DeepSeekClient, type BalanceHttpTransport } from '../src/main/api/DeepSeekClient'

class FakeTransport implements BalanceHttpTransport {
  next: { status: number; body: string } | Error = { status: 200, body: '{}' }
  calls: Array<{ url: string; headers: Record<string, string> }> = []
  async get(url: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
    this.calls.push({ url, headers })
    if (this.next instanceof Error) throw this.next
    return this.next
  }
}

class DeepSeekClientTests {
  static run(): void {
    describe('DeepSeekClient.fetchBalance', () => {
      it('200 with single non-zero CNY entry → ok snapshot', async () => {
        const http = new FakeTransport()
        http.next = {
          status: 200,
          body: JSON.stringify({ is_available: true, balance_infos: [
            { currency: 'CNY', total_balance: '9.94', granted_balance: '0.00', topped_up_balance: '9.94' },
          ]}),
        }
        const client = new DeepSeekClient(http, () => 1234)
        const r = await client.fetchBalance('deepseek', 'sk-test')
        expect(r.ok).toBe(true)
        if (r.ok) {
          expect(r.snapshot).toEqual({
            providerId: 'deepseek',
            balance:    9.94,
            currency:   'CNY',
            fetchedAt:  1234,
          })
        }
      })

      it('multi-currency: picks the first entry with total_balance > 0', async () => {
        const http = new FakeTransport()
        http.next = {
          status: 200,
          body: JSON.stringify({ balance_infos: [
            { currency: 'USD', total_balance: '0.00' },
            { currency: 'CNY', total_balance: '9.94' },
          ]}),
        }
        const client = new DeepSeekClient(http, () => 0)
        const r = await client.fetchBalance('deepseek', 'sk-')
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.snapshot.currency).toBe('CNY')
      })

      it('all zero balances: falls back to the first entry (so UI still shows something)', async () => {
        const http = new FakeTransport()
        http.next = {
          status: 200,
          body: JSON.stringify({ balance_infos: [
            { currency: 'USD', total_balance: '0.00' },
            { currency: 'CNY', total_balance: '0.00' },
          ]}),
        }
        const client = new DeepSeekClient(http, () => 0)
        const r = await client.fetchBalance('deepseek', 'sk-')
        expect(r.ok).toBe(true)
        if (r.ok) {
          expect(r.snapshot.currency).toBe('USD')
          expect(r.snapshot.balance).toBe(0)
        }
      })

      it('sends Bearer auth + Accept JSON headers', async () => {
        const http = new FakeTransport()
        http.next = { status: 200, body: JSON.stringify({ balance_infos: [{ currency: 'CNY', total_balance: '1' }] }) }
        const client = new DeepSeekClient(http, () => 0)
        await client.fetchBalance('deepseek', '  sk-spaces  ')
        expect(http.calls[0]?.headers['authorization']).toBe('Bearer sk-spaces')
        expect(http.calls[0]?.headers['accept']).toBe('application/json')
        expect(http.calls[0]?.url).toBe('https://api.deepseek.com/user/balance')
      })

      it('401 → auth error', async () => {
        const http = new FakeTransport()
        http.next = { status: 401, body: '' }
        const client = new DeepSeekClient(http)
        const r = await client.fetchBalance('deepseek', 'sk-bad')
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.reason).toBe('auth')
      })

      it('500 → http error', async () => {
        const http = new FakeTransport()
        http.next = { status: 500, body: 'oops' }
        const client = new DeepSeekClient(http)
        const r = await client.fetchBalance('deepseek', 'sk-')
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.reason).toBe('http')
      })

      it('network throw → network error', async () => {
        const http = new FakeTransport()
        http.next = new Error('ECONNRESET')
        const client = new DeepSeekClient(http)
        const r = await client.fetchBalance('deepseek', 'sk-')
        expect(r.ok).toBe(false)
        if (!r.ok) {
          expect(r.reason).toBe('network')
          expect(r.message).toBe('ECONNRESET')
        }
      })

      it('non-JSON 200 body → parse error', async () => {
        const http = new FakeTransport()
        http.next = { status: 200, body: '<html>nope</html>' }
        const client = new DeepSeekClient(http)
        const r = await client.fetchBalance('deepseek', 'sk-')
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.reason).toBe('parse')
      })

      it('empty balance_infos → no-balance-infos error', async () => {
        const http = new FakeTransport()
        http.next = { status: 200, body: JSON.stringify({ balance_infos: [] }) }
        const client = new DeepSeekClient(http)
        const r = await client.fetchBalance('deepseek', 'sk-')
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.reason).toBe('no-balance-infos')
      })

      it('non-numeric total_balance → parse error', async () => {
        const http = new FakeTransport()
        http.next = { status: 200, body: JSON.stringify({ balance_infos: [{ currency: 'CNY', total_balance: 'abc' }] }) }
        const client = new DeepSeekClient(http)
        const r = await client.fetchBalance('deepseek', 'sk-')
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.reason).toBe('parse')
      })
    })
  }
}

DeepSeekClientTests.run()
