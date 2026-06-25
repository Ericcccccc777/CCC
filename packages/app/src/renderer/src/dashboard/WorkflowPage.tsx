import type { HarnessSummary, HarnessCheckpoint } from '../../../shared/harness'
import type { LangCode } from '../i18n'
import type { DashStrings } from './strings'
import { fmt } from './strings'
import { TOTAL_STAGES } from './util'

// Page 3 — Workflow. (A) static教学: the 9 stages + 3 lanes. (B) live: a
// per-active-feature 9-stage progress bar from each checkpoint.

const STAGE_NAMES: Record<LangCode, string[]> = {
  en: ['Draft spec', 'Finalize', 'Schema', 'Plan', 'Implement', 'Tests', 'Smoke test', 'Commit', 'Watch'],
  zh: ['起草规格', '定稿', '数据结构', '执行计划', '实现', '测试', '冒烟测试', '提交', '观察'],
  ko: ['Draft spec', 'Finalize', 'Schema', 'Plan', 'Implement', 'Tests', 'Smoke test', 'Commit', 'Watch'],
}
const LANES: Record<LangCode, Array<[string, string]>> = {
  en: [['Full', 'new feature / intent change'], ['Stability-fix', 'bug fix, test-first'], ['Trivial', '< 20 LOC']],
  zh: [['完整', '新功能 / 意图变更'], ['稳定性修复', '改 bug，先写测试'], ['轻量', '< 20 行']],
  ko: [['Full', 'new feature'], ['Stability-fix', 'bug fix'], ['Trivial', '< 20 LOC']],
}

type StageState = 'done' | 'current' | 'skipped' | 'todo'

function stageState(cp: HarnessCheckpoint, n: number): StageState {
  if ((cp.stages_completed ?? []).includes(n)) return 'done'
  if ((cp.stages_skipped ?? []).includes(n)) return 'skipped'
  if (cp.current_stage === n) return 'current'
  return 'todo'
}

function verdictClass(v?: string): string {
  switch ((v ?? '').toUpperCase()) {
    case 'PASS':     return 'is-pass'
    case 'CONCERNS': return 'is-concerns'
    case 'FAIL':     return 'is-fail'
    case 'WAIVED':   return 'is-waived'
    default:         return ''
  }
}

function FeatureProgress({ cp, s, lang }: { cp: HarnessCheckpoint; s: DashStrings; lang: LangCode }): JSX.Element {
  const names = STAGE_NAMES[lang] ?? STAGE_NAMES.en
  const sip = cp.stage_in_progress
  return (
    <div className="dash-wf-feature">
      <div className="dash-wf-feature-head">
        <span className="dash-wf-feature-name">{cp.feature ?? cp.feature_slug}</span>
        {cp.lane ? <span className="dash-chip">{s.lane}: {cp.lane}</span> : null}
        <span className="dash-chip is-stage">{fmt(s.stageOf, { n: cp.current_stage ?? 1 })}</span>
      </div>
      <div className="dash-wf-bar">
        {Array.from({ length: TOTAL_STAGES }, (_, i) => i + 1).map(n => (
          <div key={n} className={`dash-wf-step is-${stageState(cp, n)}`} title={names[n - 1]}>
            <span className="dash-wf-step-n">{n}</span>
            <span className="dash-wf-step-label">{names[n - 1]}</span>
          </div>
        ))}
      </div>
      {sip && (sip.files_total ?? 0) > 0 && (
        <div className="dash-wf-files">
          {fmt(s.filesProgress, { done: sip.files_done_list?.length ?? 0, total: sip.files_total ?? 0 })}
          {sip.resume_hint ? <span className="dash-wf-resume">· {s.resumeHint}: {sip.resume_hint}</span> : null}
        </div>
      )}
      {(cp.audits ?? []).length > 0 && (
        <div className="dash-wf-audits">
          <span className="dash-wf-sub">{s.audits}:</span>
          {(cp.audits ?? []).map((a, i) => (
            <span key={i} className={`dash-chip ${verdictClass(a.verdict)}`}>
              S{a.stage} {a.verdict}{typeof a.risk === 'number' ? ` · ${a.risk}` : ''}
            </span>
          ))}
        </div>
      )}
      {(cp.decisions ?? []).length > 0 && (
        <ul className="dash-wf-decisions">
          {(cp.decisions ?? []).slice(-3).map((d, i) => (
            <li key={i}><span className="dash-wf-dec-stage">S{d.stage}</span> {d.decision}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function WorkflowPage({ summary, s, lang }: { summary: HarnessSummary; s: DashStrings; lang: LangCode }): JSX.Element {
  const names = STAGE_NAMES[lang] ?? STAGE_NAMES.en
  const lanes = LANES[lang] ?? LANES.en
  const cps = summary.checkpoints ?? []
  return (
    <div className="dash-page">
      <section className="dash-section">
        <h3 className="dash-h3">{s.theNineStages}</h3>
        <div className="dash-stage-flow">
          {names.map((nm, i) => (
            <div key={i} className="dash-stage-pill">
              <span className="dash-stage-pill-n">{i + 1}</span>{nm}
            </div>
          ))}
        </div>
      </section>

      <section className="dash-section">
        <h3 className="dash-h3">{s.theThreeLanes}</h3>
        <div className="dash-lanes">
          {lanes.map(([name, desc], i) => (
            <div key={i} className="dash-lane">
              <div className="dash-lane-name">{name}</div>
              <div className="dash-lane-desc">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="dash-section">
        <h3 className="dash-h3">{s.liveProgress}</h3>
        {cps.length === 0
          ? <div className="dash-muted">{s.noCheckpoints}</div>
          : cps.map((cp, i) => <FeatureProgress key={cp.feature ?? i} cp={cp} s={s} lang={lang} />)}
      </section>
    </div>
  )
}
