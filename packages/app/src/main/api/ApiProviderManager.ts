import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { request as httpsRequest, RequestOptions } from 'https'
import {
  DEEPSEEK_BASE_URL,
  type ApiProviderConfig,
  type ApiProviderId,
  type ApiProviderListEntry,
  type ApiTestResult,
} from '../../shared/api-provider'

// Vault abstraction — production wraps Electron's safeStorage; tests pass a
// fake. Keeps ApiProviderManager free of any electron import so it can run
// under Vitest without electron's stubs.
export interface CryptoVault {
  isAvailable(): boolean
  encrypt(plaintext: string): Buffer
  decrypt(buffer: Buffer): string
}

// Minimal HTTP transport for the Test button — injectable for tests.
export interface HttpTransport {
  post(url: string, headers: Record<string, string>, body: string): Promise<{ status: number; body: string }>
}

export class VaultUnavailableError extends Error {
  constructor() {
    super('Encrypted storage is not available on this system. API key cannot be saved.')
    this.name = 'VaultUnavailableError'
  }
}

interface PersistedFile {
  providers: ApiProviderConfig[]
}

export class ApiProviderManager {
  private readonly vault:        CryptoVault
  private readonly http:         HttpTransport
  private readonly configPath:   string
  private readonly keysDir:      string
  private cache:                 ApiProviderConfig[] | null = null

  constructor(userDataDir: string, vault: CryptoVault, http: HttpTransport = nodeHttpsTransport) {
    this.vault      = vault
    this.http       = http
    this.configPath = join(userDataDir, 'api-providers.json')
    this.keysDir    = join(userDataDir, 'api-keys')
  }

  list(): ApiProviderListEntry[] {
    return this.loadConfigs().map(c => ({
      id:       c.id,
      modelId:  c.modelId,
      hasKey:   this.keyExists(c.id),
      verified: typeof c.verifiedAt === 'number' && Number.isFinite(c.verifiedAt),
      ...(typeof c.verifiedAt === 'number' && Number.isFinite(c.verifiedAt) && { verifiedAt: c.verifiedAt }),
    }))
  }

  save(config: ApiProviderConfig, plaintextKey: string): void {
    if (!this.vault.isAvailable()) throw new VaultUnavailableError()
    if (!plaintextKey || plaintextKey.trim().length === 0) {
      throw new Error('API key cannot be empty.')
    }

    this.ensureKeysDir()
    const encrypted = this.vault.encrypt(plaintextKey)
    writeFileSync(this.keyPath(config.id), encrypted)

    const existing = this.loadConfigs()
    const idx      = existing.findIndex(c => c.id === config.id)
    if (idx >= 0) existing[idx] = config
    else          existing.push(config)
    this.persistConfigs(existing)
  }

  remove(id: ApiProviderId): void {
    const next = this.loadConfigs().filter(c => c.id !== id)
    this.persistConfigs(next)
    try { unlinkSync(this.keyPath(id)) } catch { /* may not exist */ }
  }

  // Updates only the modelId of an existing provider — leaves the encrypted
  // key untouched. Used by the Settings UI when the user picks a different
  // DeepSeek model from the dropdown without wanting to re-paste the key.
  // No-op if the provider does not exist.
  setModel(id: ApiProviderId, modelId: string): void {
    const list = this.loadConfigs()
    const idx  = list.findIndex(c => c.id === id)
    if (idx < 0) return
    list[idx] = { ...list[idx]!, modelId }
    this.persistConfigs(list)
  }

  markVerified(id: ApiProviderId, verifiedAt = Date.now()): void {
    const list = this.loadConfigs()
    const idx = list.findIndex(c => c.id === id)
    if (idx < 0) return
    list[idx] = { ...list[idx]!, verifiedAt }
    this.persistConfigs(list)
  }

  markUnverified(id: ApiProviderId): void {
    const list = this.loadConfigs()
    const idx = list.findIndex(c => c.id === id)
    if (idx < 0) return
    list[idx] = { id: list[idx]!.id, modelId: list[idx]!.modelId }
    this.persistConfigs(list)
  }

  // Returns the decrypted key for a configured provider, or null if either
  // the key file is missing or vault decryption fails (e.g. user re-keyed
  // their OS account between save and read).
  readKey(id: ApiProviderId): string | null {
    if (!this.vault.isAvailable()) return null
    const path = this.keyPath(id)
    if (!existsSync(path)) return null
    try {
      const buf = readFileSync(path)
      return this.vault.decrypt(buf)
    } catch {
      return null
    }
  }

  // Sends a 1-token messages.create to DeepSeek's Anthropic-compatible
  // endpoint. 200 = ok; 4xx with a clear status reports back; network
  // failures get a generic message. Cost: ~1 input token (DeepSeek may not
  // bill at all for this; if they do it is sub-cent).
  async test(config: ApiProviderConfig, plaintextKey: string): Promise<ApiTestResult> {
    if (!plaintextKey || plaintextKey.trim().length === 0) {
      return { ok: false, message: 'Empty key' }
    }
    const url = `${DEEPSEEK_BASE_URL}/v1/messages`
    // DeepSeek's Anthropic-compatible endpoint uses Bearer auth
    // (ANTHROPIC_AUTH_TOKEN), not the Anthropic-cloud `x-api-key` header.
    const headers = {
      'authorization':     `Bearer ${plaintextKey.trim()}`,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    }
    const body = JSON.stringify({
      model:      config.modelId,
      max_tokens: 1,
      messages:   [{ role: 'user', content: 'hi' }],
    })
    try {
      const resp = await this.http.post(url, headers, body)
      if (resp.status >= 200 && resp.status < 300) {
        return { ok: true, message: 'Connected' }
      }
      if (resp.status === 401 || resp.status === 403) {
        return { ok: false, message: 'Invalid API key' }
      }
      if (resp.status === 404) {
        return { ok: false, message: 'Model not found — try a different model id' }
      }
      return { ok: false, message: `DeepSeek returned ${resp.status}` }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, message: `Network error: ${msg}` }
    }
  }

  // ── internals ──

  private loadConfigs(): ApiProviderConfig[] {
    if (this.cache) return [...this.cache]
    if (!existsSync(this.configPath)) {
      this.cache = []
      return []
    }
    try {
      const raw = readFileSync(this.configPath, 'utf8')
      const parsed = JSON.parse(raw) as PersistedFile
      this.cache = Array.isArray(parsed.providers) ? parsed.providers : []
    } catch {
      this.cache = []
    }
    return [...this.cache]
  }

  private persistConfigs(list: ApiProviderConfig[]): void {
    this.ensureKeysDir()
    const payload: PersistedFile = { providers: list }
    writeFileSync(this.configPath, JSON.stringify(payload, null, 2), 'utf8')
    this.cache = [...list]
  }

  private ensureKeysDir(): void {
    if (!existsSync(this.keysDir)) mkdirSync(this.keysDir, { recursive: true })
  }

  private keyPath(id: ApiProviderId): string {
    return join(this.keysDir, `${id}.bin`)
  }

  private keyExists(id: ApiProviderId): boolean {
    return existsSync(this.keyPath(id))
  }
}

// Production HTTPS transport — bound at module scope to avoid per-call
// rebinding. Tests inject their own.
const nodeHttpsTransport: HttpTransport = {
  post(url, headers, body): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const u = new URL(url)
      const opts: RequestOptions = {
        method:   'POST',
        hostname: u.hostname,
        port:     u.port || 443,
        path:     u.pathname + u.search,
        headers:  { ...headers, 'content-length': Buffer.byteLength(body).toString() },
      }
      const req = httpsRequest(opts, res => {
        const chunks: Buffer[] = []
        res.on('data', c => chunks.push(c))
        res.on('end',  () => resolve({
          status: res.statusCode ?? 0,
          body:   Buffer.concat(chunks).toString('utf8'),
        }))
      })
      req.setTimeout(15000, () => req.destroy(new Error('Request timed out after 15s')))
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  },
}
