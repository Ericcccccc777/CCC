// Thin wrapper over DeepSeek's /user/balance endpoint — Bearer auth,
// returns the first balance_infos entry where total_balance > 0 (or
// the first entry if none, to avoid silently returning null when the
// account is exhausted but still valid). See CCC_API_PROVIDER_SPEC.md
// §5.2-5.3 + DECISION_LOG 2026-05-08-5.

import { request as httpsRequest, RequestOptions } from 'https'
import type { ApiBalanceSnapshot } from '../../shared/api-usage'
import type { ApiProviderId } from '../../shared/api-provider'

export interface BalanceHttpTransport {
  get(url: string, headers: Record<string, string>): Promise<{ status: number; body: string }>
}

export interface BalanceFetchResult {
  ok:       true
  snapshot: ApiBalanceSnapshot
}
export interface BalanceFetchError {
  ok:      false
  reason:  'auth' | 'network' | 'parse' | 'http' | 'no-balance-infos'
  message: string
}
export type BalanceFetchOutcome = BalanceFetchResult | BalanceFetchError

interface BalanceInfo {
  currency:           string
  total_balance:      string
  granted_balance?:   string
  topped_up_balance?: string
}
interface BalanceResponse {
  is_available?: boolean
  balance_infos?: BalanceInfo[]
}

export class DeepSeekClient {
  private readonly transport: BalanceHttpTransport
  private readonly clock:     () => number

  constructor(transport: BalanceHttpTransport = nodeHttpsBalanceTransport, clock: () => number = Date.now) {
    this.transport = transport
    this.clock     = clock
  }

  // Fetches the current balance for the given API key. Picks the
  // currency to track according to spec §5.3: first non-zero entry,
  // else first entry overall.
  async fetchBalance(providerId: ApiProviderId, apiKey: string): Promise<BalanceFetchOutcome> {
    const url     = 'https://api.deepseek.com/user/balance'
    const headers = {
      'authorization': `Bearer ${apiKey.trim()}`,
      'accept':        'application/json',
    }
    let resp: { status: number; body: string }
    try {
      resp = await this.transport.get(url, headers)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, reason: 'network', message: msg }
    }
    if (resp.status === 401 || resp.status === 403) {
      return { ok: false, reason: 'auth', message: `DeepSeek rejected the key (${resp.status})` }
    }
    if (resp.status < 200 || resp.status >= 300) {
      return { ok: false, reason: 'http', message: `DeepSeek returned ${resp.status}` }
    }
    let parsed: BalanceResponse
    try {
      parsed = JSON.parse(resp.body) as BalanceResponse
    } catch {
      return { ok: false, reason: 'parse', message: 'Balance response was not JSON' }
    }
    const infos = Array.isArray(parsed.balance_infos) ? parsed.balance_infos : []
    if (infos.length === 0) {
      return { ok: false, reason: 'no-balance-infos', message: 'Balance response had no balance_infos array' }
    }
    const chosen = pickCurrencyEntry(infos)
    const balance = parseFloat(chosen.total_balance)
    if (!Number.isFinite(balance)) {
      return { ok: false, reason: 'parse', message: `total_balance not a number: ${chosen.total_balance}` }
    }
    return {
      ok: true,
      snapshot: {
        providerId,
        balance,
        currency:  chosen.currency,
        fetchedAt: this.clock(),
      },
    }
  }
}

// Pick the entry per spec §5.3: first with parseFloat(total_balance) > 0;
// fall back to the first entry overall so a user with a fully-exhausted
// account still gets a snapshot (showing 0) rather than an error.
function pickCurrencyEntry(infos: BalanceInfo[]): BalanceInfo {
  for (const e of infos) {
    if (Number.isFinite(parseFloat(e.total_balance)) && parseFloat(e.total_balance) > 0) return e
  }
  return infos[0]!
}

const nodeHttpsBalanceTransport: BalanceHttpTransport = {
  get(url, headers): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const u = new URL(url)
      const opts: RequestOptions = {
        method:   'GET',
        hostname: u.hostname,
        port:     u.port || 443,
        path:     u.pathname + u.search,
        headers,
      }
      const req = httpsRequest(opts, res => {
        const chunks: Buffer[] = []
        res.on('data', c => chunks.push(c))
        res.on('end',  () => resolve({
          status: res.statusCode ?? 0,
          body:   Buffer.concat(chunks).toString('utf8'),
        }))
      })
      req.setTimeout(10000, () => req.destroy(new Error('Balance request timed out after 10s')))
      req.on('error', reject)
      req.end()
    })
  },
}
