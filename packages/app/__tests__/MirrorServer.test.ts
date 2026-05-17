import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as http from 'http'
import { writeFileSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { MirrorServer } from '../src/main/MirrorServer'

// MirrorServer is reachable on the LAN by design (the phone scans a QR code
// from off-host). Without per-session tokens, anyone sharing the Wi-Fi could
// enumerate /view/<id> and read session transcripts. These tests pin the
// token-gated behavior so a future refactor cannot regress to the
// pre-2026-05-14 LAN-open state. See STABILITY_RULES.md §2.4.
class MirrorServerTests {
  static async fetch(port: number, path: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', c => chunks.push(c as Buffer))
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          body:   Buffer.concat(chunks).toString('utf8'),
        }))
      }).on('error', reject)
    })
  }

  static run(): void {
    describe('MirrorServer', () => {
      let server: MirrorServer
      let port:   number
      let tmpDir: string
      let transcriptPath: string

      beforeEach(async () => {
        tmpDir = mkdtempSync(join(tmpdir(), 'ccc-mirror-test-'))
        transcriptPath = join(tmpDir, 'transcript.jsonl')
        writeFileSync(transcriptPath, JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'hello world' },
        }) + '\n', 'utf8')
        server = new MirrorServer()
        port   = await server.start()
      })

      afterEach(() => {
        server.stop()
      })

      it('rejects /view/<id> without a token', async () => {
        server.registerSession(42, transcriptPath)
        const res = await MirrorServerTests.fetch(port, '/view/42')
        expect(res.status).toBe(404)
      })

      it('rejects /view/<id> with a wrong token', async () => {
        server.registerSession(42, transcriptPath)
        const wrongToken = '00000000-0000-4000-8000-000000000000'
        const res = await MirrorServerTests.fetch(port, `/view/42?t=${wrongToken}`)
        expect(res.status).toBe(404)
      })

      it('serves /view/<id> when the URL carries the correct token', async () => {
        server.registerSession(42, transcriptPath)
        const url = server.getMirrorUrl(42)
        const tokenMatch = url.match(/\?t=([0-9a-f-]{36})$/)
        expect(tokenMatch).not.toBeNull()
        const token = tokenMatch![1]
        const res = await MirrorServerTests.fetch(port, `/view/42?t=${token}`)
        expect(res.status).toBe(200)
        expect(res.body).toContain('hello world')
      })

      it('rejects /view/<id> for an unregistered session even with a syntactically valid token', async () => {
        const validShape = '12345678-1234-4234-8234-123456789abc'
        const res = await MirrorServerTests.fetch(port, `/view/99?t=${validShape}`)
        expect(res.status).toBe(404)
      })

      it('re-registering the same sessionId preserves the token (so live QR scans survive sleep/wake)', () => {
        server.registerSession(7, transcriptPath)
        const first  = server.getMirrorUrl(7)
        server.registerSession(7, transcriptPath)
        const second = server.getMirrorUrl(7)
        expect(first).toBe(second)
      })

      it('unregisterSession clears the token, so a stale URL becomes a 404', async () => {
        server.registerSession(8, transcriptPath)
        const url = server.getMirrorUrl(8)
        const token = url.match(/\?t=([0-9a-f-]{36})$/)![1]
        server.unregisterSession(8)
        const res = await MirrorServerTests.fetch(port, `/view/8?t=${token}`)
        expect(res.status).toBe(404)
      })

      it('issues distinct tokens to different sessions', () => {
        server.registerSession(1, transcriptPath)
        server.registerSession(2, transcriptPath)
        const a = server.getMirrorUrl(1)
        const b = server.getMirrorUrl(2)
        const tokenA = a.match(/\?t=([0-9a-f-]{36})$/)![1]
        const tokenB = b.match(/\?t=([0-9a-f-]{36})$/)![1]
        expect(tokenA).not.toBe(tokenB)
      })
    })
  }
}

MirrorServerTests.run()
