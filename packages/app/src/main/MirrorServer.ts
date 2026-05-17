import * as http from 'http'
import * as os from 'os'
import { AddressInfo } from 'net'
import { existsSync, readFileSync } from 'fs'
import { randomUUID } from 'crypto'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

interface SessionEntry {
  transcriptPath: string
  token:          string  // UUID v4, unique per session, never leaves CCC except via the QR-code URL
}

function getLocalIp(): string {
  for (const addrs of Object.values(os.networkInterfaces())) {
    if (!addrs) continue
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address
    }
  }
  return '127.0.0.1'
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>')
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .filter(c => c['type'] === 'text')
      .map(c => String(c['text'] ?? ''))
      .join('')
  }
  return ''
}

function parseTranscript(path: string): ChatMessage[] {
  try {
    const lines = readFileSync(path, 'utf8').split('\n')
    const msgs: ChatMessage[] = []
    for (const line of lines) {
      const t = line.trim()
      if (!t) continue
      try {
        const obj = JSON.parse(t) as Record<string, unknown>
        // Unwrap optional message envelope
        const inner = (obj['message'] && typeof obj['message'] === 'object'
          ? obj['message'] as Record<string, unknown>
          : obj)
        const role  = inner['role']
        const isUser      = role === 'user'   || obj['type'] === 'human' || obj['type'] === 'user'
        const isAssistant = role === 'assistant' || obj['type'] === 'assistant'
        if (!isUser && !isAssistant) continue
        const text = extractText(inner['content'] ?? obj['content'])
        if (text.trim()) msgs.push({ role: isUser ? 'user' : 'assistant', text: text.trim() })
      } catch { /* skip bad lines */ }
    }
    return msgs
  } catch {
    return []
  }
}

function buildHtml(msgs: ChatMessage[], sessionId: number): string {
  const bubbles = msgs.map(m => {
    const cls   = m.role === 'user' ? 'u' : 'a'
    const label = m.role === 'user' ? 'You' : 'Claude'
    return `<div class="m ${cls}"><div class="b">${escHtml(m.text)}</div><div class="l">${label}</div></div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Claude · Session ${sessionId}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#e0e0e0;font:15px/1.55 -apple-system,system-ui,sans-serif;padding-bottom:28px}
header{position:sticky;top:0;background:#111;border-bottom:1px solid #1e1e1e;padding:11px 15px;font-size:13px;display:flex;justify-content:space-between;align-items:center}
header b{color:#ccc;font-weight:600}
#cnt{padding:12px;display:flex;flex-direction:column;gap:10px}
.m{display:flex;flex-direction:column;max-width:86%}
.m.u{align-self:flex-end;align-items:flex-end}
.m.a{align-self:flex-start;align-items:flex-start}
.b{padding:10px 14px;border-radius:18px;white-space:pre-wrap;word-break:break-word;font-size:15px}
.m.u .b{background:#1a4a8a;border-bottom-right-radius:4px}
.m.a .b{background:#1c1c1c;border:1px solid #2a2a2a;border-bottom-left-radius:4px}
.l{font-size:11px;color:#555;padding:3px 4px}
.empty{text-align:center;color:#444;margin-top:48px;font-size:13px}
#tick{font-size:11px;color:#555}
</style>
</head>
<body>
<header><b>Session ${sessionId}</b><span id="tick">—</span></header>
<div id="cnt">
${msgs.length === 0
  ? '<p class="empty">No messages yet. Conversation will appear here.</p>'
  : bubbles}
</div>
<script>
var s=4,el=document.getElementById('tick');
function tick(){s--;if(s<=0){location.reload();}else{el.textContent='Refresh in '+s+'s';setTimeout(tick,1000);}}
setTimeout(tick,1000);
window.scrollTo(0,document.body.scrollHeight);
</script>
</body>
</html>`
}

export class MirrorServer {
  private server    = http.createServer((req, res) => this.handle(req, res))
  private port      = 0
  private sessions  = new Map<number, SessionEntry>()

  // Phone-mirror URLs are reachable on the local network so the user can
  // load them on a phone that is NOT 127.0.0.1. Without a secret, anyone
  // sharing the Wi-Fi could enumerate /view/1, /view/2, … and read
  // session transcripts in real time. We gate every request on a UUID v4
  // token issued at registerSession() time and embedded in the URL
  // (which is the QR code the phone scans). The token is never logged,
  // never persisted, and dies with the session. STABILITY_RULES.md §2.4.
  registerSession(sessionId: number, transcriptPath: string): void {
    const existing = this.sessions.get(sessionId)
    // Reuse the existing token on re-registration so a sleep/wake cycle
    // doesn't invalidate an open QR scan on the phone.
    const token = existing?.token ?? randomUUID()
    this.sessions.set(sessionId, { transcriptPath, token })
  }

  unregisterSession(sessionId: number): void {
    this.sessions.delete(sessionId)
  }

  start(): Promise<number> {
    return new Promise(resolve => {
      this.server.listen(0, '0.0.0.0', () => {
        this.port = (this.server.address() as AddressInfo).port
        resolve(this.port)
      })
    })
  }

  stop(): void {
    this.server.close()
    this.sessions.clear()
  }

  getMirrorUrl(sessionId: number): string {
    const entry = this.sessions.get(sessionId)
    // No token = no URL — the renderer should only call this for live
    // sessions, so this fallback only fires in race conditions.
    const tokenSuffix = entry ? `?t=${entry.token}` : ''
    return `http://${getLocalIp()}:${this.port}/view/${sessionId}${tokenSuffix}`
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return }

    // Parse `/view/<id>?t=<token>` — URL.parse is overkill; the path is
    // tightly constrained so a single regex is enough.
    const m = req.url?.match(/^\/view\/(\d+)(?:\?t=([0-9a-f-]{36}))?/i)
    if (!m) { res.writeHead(404); res.end('Not found'); return }

    const sessionId = parseInt(m[1], 10)
    const token     = m[2] ?? ''
    const entry     = this.sessions.get(sessionId)

    // 404 (not 401/403) for the same reason the path-not-found case does:
    // we don't want LAN scanners to learn that sessionId N exists.
    if (!entry || token !== entry.token) {
      res.writeHead(404); res.end('Not found'); return
    }

    const msgs = existsSync(entry.transcriptPath) ? parseTranscript(entry.transcriptPath) : []

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(buildHtml(msgs, sessionId))
  }
}
