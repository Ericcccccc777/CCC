// Multi-provider account-balance client. Given a providerId it looks up the
// provider descriptor (endpoint + response shape) and fetches the current
// balance over Bearer auth, normalising the differing response schemas into a
// single ApiBalanceSnapshot. Two shapes are supported today:
//   - 'deepseek' : { balance_infos: [{ currency, total_balance }, …] }
//   - 'moonshot' : { code, data: { available_balance, … }, status }  (Kimi)

import { request as httpsRequest, RequestOptions } from 'https'
import type { ApiBalanceSnapshot } from '../../shared/api-usage'
import { apiProviderDescriptor, type ApiProviderId } from '../../shared/api-provider'

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
interface DeepSeekBalanceResponse {
  is_available?: boolean
  balance_infos?: BalanceInfo[]
}
interface MoonshotBalanceResponse {
  code?:   number
  status?: boolean
  data?: {
    available_balance?: number
    voucher_balance?:   number
    cash_balance?:      number
  }
}

export class ApiBalanceClient {
  private readonly transport: BalanceHttpTransport
  private readonly clock:     () => number

  constructor(transport: BalanceHttpTransport = nodeHttpsBalanceTransport, clock: () => number = Date.now) {
    this.transport = transport
    this.clock     = clock
  }

  // Fetches the current balance for the given provider + key. Routes to the
  // right endpoint + parser via the provider descriptor.
  async fetchBalance(providerId: ApiProviderId, apiKey: string): Promise<BalanceFetchOutcome> {
    const descriptor = apiProviderDescriptor(providerId)
    const headers = {
      'authorization': `Bearer ${apiKey.trim()}`,
      'accept':        'application/json',
    }
    let resp: { status: number; body: string }
    try {
      resp = await this.transport.get(descriptor.balanceUrl, headers)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, reason: 'network', message: msg }
    }
    if (resp.status === 401 || resp.status === 403) {
      return { ok: false, reason: 'auth', message: `${descriptor.label} rejected the key (${resp.status})` }
    }
    if (resp.status < 200 || resp.status >= 300) {
      return { ok: false, reason: 'http', message: `${descriptor.label} returned ${resp.status}` }
    }
    return descriptor.balanceShape === 'moonshot'
      ? this.parseMoonshot(providerId, descriptor.defaultCurrency, resp.body)
      : this.parseDeepSeek(providerId, resp.body)
  }

  private parseDeepSeek(providerId: ApiProviderId, body: string): BalanceFetchOutcome {
    let parsed: DeepSeekBalanceResponse
    try {
      parsed = JSON.parse(body) as DeepSeekBalanceResponse
    } catch {
      return { ok: false, reason: 'parse', message: 'Balance response was not JSON' }
    }
    const infos = Array.isArray(parsed.balance_infos) ? parsed.balance_infos : []
    if (infos.length === 0) {
      return { ok: false, reason: 'no-balance-infos', message: 'Balance response had no balance_infos array' }
    }
    const chosen  = pickCurrencyEntry(infos)
    const balance = parseFloat(chosen.total_balance)
    if (!Number.isFinite(balance)) {
      return { ok: false, reason: 'parse', message: `total_balance not a number: ${chosen.total_balance}` }
    }
    return {
      ok: true,
      snapshot: { providerId, balance, currency: chosen.currency, fetchedAt: this.clock() },
    }
  }

  private parseMoonshot(providerId: ApiProviderId, currency: string, body: string): BalanceFetchOutcome {
    let parsed: MoonshotBalanceResponse
    try {
      parsed = JSON.parse(body) as MoonshotBalanceResponse
    } catch {
      return { ok: false, reason: 'parse', message: 'Balance response was not JSON' }
    }
    // Moonshot signals success with code:0 + status:true. Reject any response
    // that explicitly reports failure (code!=0 or status:false) even on a 200 —
    // that's the API rejecting the call (bad/insufficient-permission key). When
    // both markers are absent we fall through to the balance check below and
    // accept only if a finite available_balance is present, so a genuinely
    // malformed body can't become a successful snapshot.
    if ((typeof parsed.code === 'number' && parsed.code !== 0) || parsed.status === false) {
      return { ok: false, reason: 'http', message: `Balance response reported code ${parsed.code ?? 'error'}` }
    }
    const balance = parsed.data?.available_balance
    if (typeof balance !== 'number' || !Number.isFinite(balance)) {
      return { ok: false, reason: 'parse', message: 'available_balance missing or not a number' }
    }
    return {
      ok: true,
      snapshot: { providerId, balance, currency, fetchedAt: this.clock() },
    }
  }
}

// Pick the DeepSeek entry: first with parseFloat(total_balance) > 0; fall back
// to the first entry overall so a user with a fully-exhausted account still
// gets a snapshot (showing 0) rather than an error.
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
