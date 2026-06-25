import { describe, it, expect } from 'vitest'
import {
  CLAUDE_REASONING_EFFORTS,
  claudeEffortsForModel,
} from '../src/shared/claude-cli'

describe('claude-cli reasoning effort', () => {
  it('exposes the five API effort levels, lowest→highest capability', () => {
    expect(CLAUDE_REASONING_EFFORTS).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  })

  describe('claudeEffortsForModel — per-model gating', () => {
    it('Opus 4.8 supports the full set incl. xhigh + max', () => {
      expect(claudeEffortsForModel('claude-opus-4-8')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    })

    it('Fable 5 supports the full set incl. xhigh + max', () => {
      expect(claudeEffortsForModel('claude-fable-5')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    })

    it('Sonnet 4.6 supports max but NOT xhigh', () => {
      const efforts = claudeEffortsForModel('claude-sonnet-4-6')
      expect(efforts).toEqual(['low', 'medium', 'high', 'max'])
      expect(efforts).not.toContain('xhigh')
    })

    it('Haiku supports no effort levels (UI row hides)', () => {
      expect(claudeEffortsForModel('claude-haiku-4-5-20251001')).toEqual([])
    })

    it('is case-insensitive on the model id', () => {
      expect(claudeEffortsForModel('Claude-Haiku-4-5')).toEqual([])
      expect(claudeEffortsForModel('CLAUDE-SONNET-4-6')).not.toContain('xhigh')
    })

    it('falls through to the full set for unknown ids (unsupported level is a CLI no-op, not an error)', () => {
      expect(claudeEffortsForModel('some-future-model')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    })
  })
})
