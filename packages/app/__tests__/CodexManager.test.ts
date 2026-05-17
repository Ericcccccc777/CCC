import { describe, it, expect, beforeEach } from 'vitest'
import { CodexManager, parseCodexModels } from '../src/main/CodexManager'
import { FALLBACK_CODEX_MODELS } from '../src/shared/codex-cli'

// CodexManager uses child_process.exec for all operations. We exercise the
// public API against real exec() — on CI / dev machines without `codex`,
// detect() falls back to { installed: false, ... } which still validates
// the caching contract and return shapes. Installation and login are
// intentionally out of scope: CCC only detects a user-managed Codex CLI binary
// and model list.

class CodexManagerTests {
  static run(): void {
    describe('CodexManager', () => {
      let manager: CodexManager

      beforeEach(() => {
        manager = new CodexManager()
      })

      describe('detect (real exec)', () => {
        it('returns a valid CodexCliStatus shape', async () => {
          const status = await manager.detect()
          expect(status).toHaveProperty('installed')
          expect(status).toHaveProperty('loggedIn')
          expect(status).toHaveProperty('email')
          expect(status).toHaveProperty('models')
          expect(Array.isArray(status.models)).toBe(true)
        })

        it('returns the same result on second call (caching)', async () => {
          const first  = await manager.detect()
          const second = await manager.detect()
          expect(second).toEqual(first)
        })
      })

      describe('redetect', () => {
        it('clears cache and returns a valid status', async () => {
          await manager.detect()
          const status = await manager.redetect()
          expect(status).toHaveProperty('installed')
          expect(status).toHaveProperty('loggedIn')
          expect(status).toHaveProperty('models')
        })
      })

      describe('getModels', () => {
        it('returns fallback models before any detect call', () => {
          expect(manager.getModels()).toEqual(FALLBACK_CODEX_MODELS)
        })

        it('returns an array of objects with id and label', () => {
          const models = manager.getModels()
          expect(Array.isArray(models)).toBe(true)
          for (const m of models) {
            expect(typeof m.id).toBe('string')
            expect(typeof m.label).toBe('string')
          }
        })
      })

      describe('parseCodexModels', () => {
        it('matches Codex picker order by filtering hidden models and sorting by priority', () => {
          const models = parseCodexModels(JSON.stringify({
            models: [
              { slug: 'gpt-5.2', display_name: 'GPT-5.2', visibility: 'list', priority: 10 },
              { slug: 'codex-auto-review', display_name: 'Auto Review', visibility: 'hide', priority: 3 },
              { slug: 'gpt-5.3-codex-spark', display_name: 'Spark', visibility: 'list', priority: 7 },
              { slug: 'gpt-5.4-mini', display_name: 'Mini', visibility: 'list', priority: 4 },
            ],
          }))

          expect(models.map(m => m.id)).toEqual([
            'gpt-5.4-mini',
            'gpt-5.3-codex-spark',
            'gpt-5.2',
          ])
        })

        it('parses line-delimited fallback output', () => {
          expect(parseCodexModels('gpt-5.4\ngpt-5.4-mini'))
            .toEqual([
              { id: 'gpt-5.4', label: 'gpt-5.4' },
              { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
            ])
        })
      })
    })
  }
}

CodexManagerTests.run()
