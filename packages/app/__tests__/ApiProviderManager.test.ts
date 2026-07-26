import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  ApiProviderManager,
  VaultUnavailableError,
  type CryptoVault,
  type HttpTransport,
} from '../src/main/api/ApiProviderManager'

class FakeVault implements CryptoVault {
  available = true
  isAvailable(): boolean { return this.available }
  encrypt(plaintext: string): Buffer {
    // Trivial reversible "encryption" — flip every byte. Good enough to
    // confirm the manager round-trips through the vault rather than
    // accidentally writing plaintext.
    return Buffer.from(plaintext).map(b => b ^ 0xff) as Buffer
  }
  decrypt(buffer: Buffer): string {
    return Buffer.from(buffer.map(b => b ^ 0xff)).toString('utf8')
  }
}

class FakeHttp implements HttpTransport {
  next: { status: number; body: string } | Error = { status: 200, body: '{}' }
  calls: Array<{ url: string; headers: Record<string, string>; body: string }> = []
  async post(url: string, headers: Record<string, string>, body: string): Promise<{ status: number; body: string }> {
    this.calls.push({ url, headers, body })
    if (this.next instanceof Error) throw this.next
    return this.next
  }
}

class ApiProviderManagerTests {
  static makeMgr(): { mgr: ApiProviderManager; vault: FakeVault; http: FakeHttp; dir: string } {
    const dir   = mkdtempSync(join(tmpdir(), 'ccc-apim-'))
    const vault = new FakeVault()
    const http  = new FakeHttp()
    const mgr   = new ApiProviderManager(dir, vault, http)
    return { mgr, vault, http, dir }
  }

  static run(): void {
    describe('ApiProviderManager', () => {
      describe('save / list / readKey', () => {
        let ctx: ReturnType<typeof ApiProviderManagerTests.makeMgr>
        beforeEach(() => { ctx = ApiProviderManagerTests.makeMgr() })

        it('initial list is empty', () => {
          expect(ctx.mgr.list()).toEqual([])
        })

        it('save persists config + encrypted key file', () => {
          ctx.mgr.save({ id: 'deepseek', modelId: 'deepseek-v4-flash' }, 'sk-test-12345')
          const list = ctx.mgr.list()
          expect(list).toHaveLength(1)
          expect(list[0]).toMatchObject({ id: 'deepseek', modelId: 'deepseek-v4-flash', hasKey: true, verified: false })
          expect(existsSync(join(ctx.dir, 'api-keys', 'deepseek.bin'))).toBe(true)
        })

        it('save persists verifiedAt when the renderer saved after a successful test', () => {
          ctx.mgr.save({ id: 'deepseek', modelId: 'deepseek-v4-flash', verifiedAt: 12345 }, 'sk-test-12345')
          expect(ctx.mgr.list()[0]).toMatchObject({
            id: 'deepseek', modelId: 'deepseek-v4-flash', hasKey: true, verified: true, verifiedAt: 12345,
          })
        })

        it('readKey decrypts the saved key', () => {
          ctx.mgr.save({ id: 'deepseek', modelId: 'deepseek-v4-flash' }, 'sk-roundtrip')
          expect(ctx.mgr.readKey('deepseek')).toBe('sk-roundtrip')
        })

        it('save overwrites existing provider config', () => {
          ctx.mgr.save({ id: 'deepseek', modelId: 'deepseek-v4-flash' },     'sk-a')
          ctx.mgr.save({ id: 'deepseek', modelId: 'deepseek-v4-pro' }, 'sk-b')
          const list = ctx.mgr.list()
          expect(list).toHaveLength(1)
          expect(list[0]?.modelId).toBe('deepseek-v4-pro')
          expect(ctx.mgr.readKey('deepseek')).toBe('sk-b')
        })

        it('persists across new manager instances (cold load)', () => {
          ctx.mgr.save({ id: 'deepseek', modelId: 'deepseek-v4-flash' }, 'sk-cold')
          const cold = new ApiProviderManager(ctx.dir, ctx.vault, ctx.http)
          expect(cold.list()).toMatchObject([{ id: 'deepseek', modelId: 'deepseek-v4-flash', hasKey: true, verified: false }])
          expect(cold.readKey('deepseek')).toBe('sk-cold')
        })

        it('list never leaks the key plaintext through ApiProviderListEntry', () => {
          ctx.mgr.save({ id: 'deepseek', modelId: 'deepseek-v4-flash' }, 'sk-secret')
          const list = ctx.mgr.list()
          // ApiProviderListEntry is the renderer-facing shape — must not
          // include any field whose value contains the plaintext key.
          for (const entry of list) {
            for (const v of Object.values(entry)) {
              expect(String(v)).not.toContain('sk-secret')
            }
          }
        })
      })

      describe('setModel', () => {
        it('updates modelId without touching the encrypted key', () => {
          const { mgr } = ApiProviderManagerTests.makeMgr()
          mgr.save({ id: 'deepseek', modelId: 'deepseek-v4-flash' }, 'sk-keep-me')
          mgr.setModel('deepseek', 'deepseek-v4-pro')
          expect(mgr.list()[0]?.modelId).toBe('deepseek-v4-pro')
          expect(mgr.readKey('deepseek')).toBe('sk-keep-me')
        })

        it('is a no-op for an unknown id', () => {
          const { mgr } = ApiProviderManagerTests.makeMgr()
          expect(() => mgr.setModel('deepseek', 'whatever')).not.toThrow()
          expect(mgr.list()).toEqual([])
        })
      })

      describe('verification markers', () => {
        it('markVerified records a successful stored-key test', () => {
          const { mgr } = ApiProviderManagerTests.makeMgr()
          mgr.save({ id: 'deepseek', modelId: 'deepseek-v4-flash' }, 'sk-good')
          mgr.markVerified('deepseek', 777)
          expect(mgr.list()[0]).toMatchObject({ verified: true, verifiedAt: 777 })
        })

        it('markUnverified clears a previous successful test marker', () => {
          const { mgr } = ApiProviderManagerTests.makeMgr()
          mgr.save({ id: 'deepseek', modelId: 'deepseek-v4-flash', verifiedAt: 777 }, 'sk-good')
          mgr.markUnverified('deepseek')
          expect(mgr.list()[0]).toMatchObject({ verified: false })
          expect(mgr.list()[0]?.verifiedAt).toBeUndefined()
        })
      })

      describe('remove', () => {
        it('removes config + key file', () => {
          const { mgr, dir } = ApiProviderManagerTests.makeMgr()
          mgr.save({ id: 'deepseek', modelId: 'deepseek-v4-flash' }, 'sk-x')
          mgr.remove('deepseek')
          expect(mgr.list()).toEqual([])
          expect(existsSync(join(dir, 'api-keys', 'deepseek.bin'))).toBe(false)
        })

        it('remove on non-existent id is a no-op', () => {
          const { mgr } = ApiProviderManagerTests.makeMgr()
          expect(() => mgr.remove('deepseek')).not.toThrow()
        })
      })

      describe('vault unavailable', () => {
        it('save throws VaultUnavailableError', () => {
          const { mgr, vault } = ApiProviderManagerTests.makeMgr()
          vault.available = false
          expect(() => mgr.save({ id: 'deepseek', modelId: 'deepseek-v4-flash' }, 'sk-x'))
            .toThrow(VaultUnavailableError)
        })

        it('readKey returns null', () => {
          const { mgr, vault } = ApiProviderManagerTests.makeMgr()
          mgr.save({ id: 'deepseek', modelId: 'deepseek-v4-flash' }, 'sk-x')
          vault.available = false
          expect(mgr.readKey('deepseek')).toBeNull()
        })
      })

      describe('save validation', () => {
        it('rejects empty key', () => {
          const { mgr } = ApiProviderManagerTests.makeMgr()
          expect(() => mgr.save({ id: 'deepseek', modelId: 'deepseek-v4-flash' }, ''))
            .toThrow(/empty/i)
        })

        it('rejects whitespace-only key', () => {
          const { mgr } = ApiProviderManagerTests.makeMgr()
          expect(() => mgr.save({ id: 'deepseek', modelId: 'deepseek-v4-flash' }, '   '))
            .toThrow(/empty/i)
        })
      })

      describe('test', () => {
        it('returns ok=true on 200', async () => {
          const { mgr, http } = ApiProviderManagerTests.makeMgr()
          http.next = { status: 200, body: '{}' }
          const r = await mgr.test({ id: 'deepseek', modelId: 'deepseek-v4-flash' }, 'sk-good')
          expect(r.ok).toBe(true)
          expect(r.message).toBe('Connected')
        })

        it('returns ok=false with "Invalid API key" on 401', async () => {
          const { mgr, http } = ApiProviderManagerTests.makeMgr()
          http.next = { status: 401, body: '{}' }
          const r = await mgr.test({ id: 'deepseek', modelId: 'deepseek-v4-flash' }, 'sk-bad')
          expect(r.ok).toBe(false)
          expect(r.message).toMatch(/invalid api key/i)
        })

        it('returns ok=false with model-not-found hint on 404', async () => {
          const { mgr, http } = ApiProviderManagerTests.makeMgr()
          http.next = { status: 404, body: '{}' }
          const r = await mgr.test({ id: 'deepseek', modelId: 'does-not-exist' }, 'sk-x')
          expect(r.ok).toBe(false)
          expect(r.message).toMatch(/model/i)
        })

        it('returns ok=false on network error', async () => {
          const { mgr, http } = ApiProviderManagerTests.makeMgr()
          http.next = new Error('ENETUNREACH')
          const r = await mgr.test({ id: 'deepseek', modelId: 'deepseek-v4-flash' }, 'sk-x')
          expect(r.ok).toBe(false)
          expect(r.message).toMatch(/network error/i)
        })

        it('returns ok=false for empty key without making a request', async () => {
          const { mgr, http } = ApiProviderManagerTests.makeMgr()
          const r = await mgr.test({ id: 'deepseek', modelId: 'deepseek-v4-flash' }, '')
          expect(r.ok).toBe(false)
          expect(http.calls).toHaveLength(0)
        })

        it('sends Authorization: Bearer + anthropic-version headers', async () => {
          const { mgr, http } = ApiProviderManagerTests.makeMgr()
          http.next = { status: 200, body: '{}' }
          await mgr.test({ id: 'deepseek', modelId: 'deepseek-v4-flash' }, 'sk-headers')
          expect(http.calls[0]?.headers['authorization']).toBe('Bearer sk-headers')
          expect(http.calls[0]?.headers['anthropic-version']).toBeTruthy()
          expect(http.calls[0]?.url).toContain('deepseek.com')
        })

        it('routes the Kimi provider to the moonshot Anthropic endpoint', async () => {
          const { mgr, http } = ApiProviderManagerTests.makeMgr()
          http.next = { status: 200, body: '{}' }
          const r = await mgr.test({ id: 'kimi', modelId: 'kimi-k3' }, 'sk-kimi')
          expect(r.ok).toBe(true)
          expect(http.calls[0]?.url).toBe('https://api.moonshot.cn/anthropic/v1/messages')
          expect(http.calls[0]?.headers['authorization']).toBe('Bearer sk-kimi')
        })
      })
    })
  }
}

ApiProviderManagerTests.run()
