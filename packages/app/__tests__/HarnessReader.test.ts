import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
import { listSessions, readTranscriptById, readProjectStats } from '../src/main/HarnessReader'

// listSessions / readProjectStats read Claude Code transcripts out of
// ~/.claude/projects/<encoded-workspace>/, so the fixtures go there under a
// throwaway workspace path that no real project can collide with.
function encodeWorkspace(ws: string): string {
  return ws.replace(/[^a-zA-Z0-9]/g, '-')
}

const row = (o: Record<string, unknown>): string => JSON.stringify(o)
const userRow = (text: string, ts?: string): string =>
  row({ type: 'user', message: { role: 'user', content: text }, ...(ts && { timestamp: ts }) })
const asstRow = (text: string, tools: string[] = [], usage?: Record<string, number>): string =>
  row({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        ...(text ? [{ type: 'text', text }] : []),
        ...tools.map(name => ({ type: 'tool_use', name })),
      ],
      ...(usage && { usage }),
    },
    timestamp: '2026-08-19T10:00:00Z',
  })

class HarnessReaderTests {
  static workspace(): string {
    const ws = mkdtempSync(join(tmpdir(), 'ccc-hr-ws-'))
    mkdirSync(join(homedir(), '.claude', 'projects', encodeWorkspace(ws)), { recursive: true })
    return ws
  }

  static write(ws: string, id: string, lines: string[]): string {
    const p = join(homedir(), '.claude', 'projects', encodeWorkspace(ws), `${id}.jsonl`)
    writeFileSync(p, lines.join('\n'), 'utf8')
    return p
  }

  static run(): void {
    describe('HarnessReader transcripts', () => {
      let ws: string
      beforeEach(() => { ws = HarnessReaderTests.workspace() })

      describe('listSessions', () => {
        it('titles a session from its first user message and counts display rows', () => {
          HarnessReaderTests.write(ws, 'aaa', [
            userRow('  build   the   thing  '),
            asstRow('sure', ['Bash']),
            userRow('second'),
          ])
          const [s] = listSessions(ws)
          expect(s!.title).toBe('build the thing')
          expect(s!.messageCount).toBe(3)
        })

        // tool_result rows arrive as user-role messages with no text; they are
        // not shown, so they must not be counted or used as a title.
        it('skips rows the UI never displays', () => {
          HarnessReaderTests.write(ws, 'bbb', [
            row({ type: 'summary', summary: 'meta' }),
            row({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'x' }] } }),
            userRow('real question'),
          ])
          const [s] = listSessions(ws)
          expect(s!.title).toBe('real question')
          expect(s!.messageCount).toBe(1)
        })

        it('truncates a long title to 80 chars', () => {
          HarnessReaderTests.write(ws, 'ccc', [userRow('x'.repeat(200))])
          expect(listSessions(ws)[0]!.title).toHaveLength(80)
        })

        it('falls back to — when no user message has text', () => {
          HarnessReaderTests.write(ws, 'ddd', [asstRow('only assistant')])
          expect(listSessions(ws)[0]!.title).toBe('—')
        })

        it('tolerates blank lines, malformed rows, and no trailing newline', () => {
          HarnessReaderTests.write(ws, 'eee', ['', '{ not json', userRow('ok'), ''])
          const [s] = listSessions(ws)
          expect(s!.title).toBe('ok')
          expect(s!.messageCount).toBe(1)
        })

        it('returns [] for a workspace with no transcripts', () => {
          expect(listSessions(HarnessReaderTests.workspace())).toEqual([])
        })
      })

      describe('readTranscriptById', () => {
        it('returns the rows in order with roles and tools', () => {
          HarnessReaderTests.write(ws, 'fff', [userRow('hi'), asstRow('yo', ['Read', 'Edit'])])
          const msgs = readTranscriptById(ws, 'fff')
          expect(msgs.map(m => m.role)).toEqual(['user', 'assistant'])
          expect(msgs[1]!.tools).toEqual(['Read', 'Edit'])
        })

        it('refuses a traversing id', () => {
          expect(readTranscriptById(ws, '../../etc/passwd')).toEqual([])
          expect(readTranscriptById(ws, 'a/b')).toEqual([])
        })
      })

      describe('readProjectStats', () => {
        it('sums tokens, tool calls and messages across sessions', () => {
          HarnessReaderTests.write(ws, 'g1', [
            userRow('q', '2026-08-19T10:00:00Z'),
            asstRow('a', ['Bash'], { input_tokens: 10, output_tokens: 5 }),
          ])
          HarnessReaderTests.write(ws, 'g2', [asstRow('b', ['Bash', 'Read'], { input_tokens: 1, output_tokens: 2 })])

          const st = readProjectStats(ws)
          expect(st.sessionCount).toBe(2)
          expect(st.messageCount).toBe(3)
          expect(st.toolCalls).toBe(3)
          expect(st.tokens.input).toBe(11)
          expect(st.tokens.output).toBe(7)
          expect(st.topTools.find(t => t.name === 'Bash')?.count).toBe(2)
        })

        // The scan is cached on mtime+size so a dashboard re-open doesn't
        // re-parse unchanged history. An APPENDED transcript must still re-scan.
        it('re-scans a transcript after it changes, and is stable when it does not', () => {
          const p = HarnessReaderTests.write(ws, 'h1', [userRow('one')])
          expect(readProjectStats(ws).messageCount).toBe(1)
          expect(readProjectStats(ws).messageCount).toBe(1)   // cache hit, same answer

          writeFileSync(p, [userRow('one'), userRow('two')].join('\n'), 'utf8')
          expect(readProjectStats(ws).messageCount).toBe(2)
        })

        // Same byte length, different content, touched mtime — the key must
        // notice via mtime even though size is unchanged.
        it('re-scans a same-size edit', () => {
          const p = HarnessReaderTests.write(ws, 'h2', [userRow('aaa'), asstRow('x', ['Bash'])])
          expect(readProjectStats(ws).toolCalls).toBe(1)

          writeFileSync(p, [userRow('aaa'), asstRow('x', ['Read'])].join('\n'), 'utf8')
          const future = new Date(Date.now() + 5_000)
          utimesSync(p, future, future)
          expect(readProjectStats(ws).topTools.find(t => t.name === 'Read')?.count).toBe(1)
        })
      })
    })
  }
}

HarnessReaderTests.run()
