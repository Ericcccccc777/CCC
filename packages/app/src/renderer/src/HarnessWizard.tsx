import { useEffect, useMemo, useState } from 'react'
import {
  defaultHarnessConfig, migrateConfig,
  PROJECT_TYPE_LABELS,
  type HarnessConfig, type CodingRule, type CodingRuleCategory, type ProjectType,
} from './harness-types'
import { defaultRuleSet, defaultDoD } from './coding-rules'
import { useLang } from './i18n'
import type { Translations } from './i18n'

// ─────────────────────────────────────────────────────────────────────────────
// Section catalogue
// ─────────────────────────────────────────────────────────────────────────────

type SectionId  = 'basics' | 'architecture'
type WizardMode = 'beginner' | 'pro'

interface SectionMeta {
  id:       SectionId
  label:    string
  hint:     string
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable form primitives
// ─────────────────────────────────────────────────────────────────────────────

interface TextFieldProps {
  label:        string
  value:        string
  onChange:     (v: string) => void
  multiline?:   boolean
  placeholder?: string
  hint?:        string
}

function TextField({ label, value, onChange, multiline, placeholder, hint }: TextFieldProps): JSX.Element {
  return (
    <label className="hw-field">
      <span className="hw-field-label">{label}</span>
      {multiline
        ? <textarea
            className="hw-field-input hw-field-textarea"
            value={value}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
            rows={4}
          />
        : <input
            className="hw-field-input"
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
          />
      }
      {hint && <span className="hw-field-hint">{hint}</span>}
    </label>
  )
}

interface SelectFieldProps<T extends string> {
  label:    string
  value:    T
  options:  ReadonlyArray<{ value: T; label: string }>
  onChange: (v: T) => void
}

function SelectField<T extends string>({ label, value, options, onChange }: SelectFieldProps<T>): JSX.Element {
  return (
    <label className="hw-field">
      <span className="hw-field-label">{label}</span>
      <select className="hw-field-input" value={value} onChange={e => onChange(e.target.value as T)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

interface StringListProps {
  label:        string
  values:       string[]
  onChange:     (v: string[]) => void
  placeholder?: string
  addLabel:     string
}

function StringList({ label, values, onChange, placeholder, addLabel }: StringListProps): JSX.Element {
  const set    = (i: number, v: string): void => onChange(values.map((x, idx) => idx === i ? v : x))
  const add    = (): void => onChange([...values, ''])
  const remove = (i: number): void => onChange(values.filter((_, idx) => idx !== i))
  return (
    <div className="hw-field">
      <span className="hw-field-label">{label}</span>
      <div className="hw-list">
        {values.map((v, i) => (
          <div key={i} className="hw-list-row">
            <input
              className="hw-field-input"
              type="text"
              value={v}
              placeholder={placeholder}
              onChange={e => set(i, e.target.value)}
            />
            <button type="button" className="hw-row-remove" aria-label="Remove row" onClick={() => remove(i)}>✕</button>
          </div>
        ))}
        <button type="button" className="hw-add-btn" onClick={add}>{addLabel}</button>
      </div>
    </div>
  )
}

interface CommandsKVProps {
  value:    Record<string, string>
  onChange: (v: Record<string, string>) => void
  t:        Translations
}

function CommandsKV({ value, onChange, t }: CommandsKVProps): JSX.Element {
  const entries = Object.entries(value)
  const setKey = (i: number, k: string): void => {
    const next: Record<string, string> = {}
    entries.forEach(([oldK, v], idx) => { next[idx === i ? k : oldK] = v })
    onChange(next)
  }
  const setVal = (i: number, v: string): void => {
    const next: Record<string, string> = {}
    entries.forEach(([k, oldV], idx) => { next[k] = idx === i ? v : oldV })
    onChange(next)
  }
  const add = (): void => onChange({ ...value, [`new${entries.length}`]: '' })
  const remove = (i: number): void => {
    const next: Record<string, string> = {}
    entries.forEach(([k, v], idx) => { if (idx !== i) next[k] = v })
    onChange(next)
  }
  return (
    <div className="hw-field">
      <span className="hw-field-label">{t.hwCommands}</span>
      <span className="hw-field-hint">{t.hwCommandsHint}</span>
      <div className="hw-list">
        {entries.map(([k, v], i) => (
          <div key={i} className="hw-list-row hw-kv-row">
            <input className="hw-field-input hw-kv-key" type="text" value={k} placeholder={t.hwCommandKey} onChange={e => setKey(i, e.target.value)} />
            <input className="hw-field-input" type="text" value={v} placeholder={t.hwCommandValue} onChange={e => setVal(i, e.target.value)} />
            <button type="button" className="hw-row-remove" aria-label="Remove command" onClick={() => remove(i)}>✕</button>
          </div>
        ))}
        <button type="button" className="hw-add-btn" onClick={add}>{t.hwAddCommand}</button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section forms
// ─────────────────────────────────────────────────────────────────────────────

function BasicsForm({ value, onChange }: { value: HarnessConfig['basics']; onChange: (v: HarnessConfig['basics']) => void }): JSX.Element {
  const t = useLang()
  const set = <K extends keyof HarnessConfig['basics']>(k: K, v: HarnessConfig['basics'][K]): void =>
    onChange({ ...value, [k]: v })
  return (
    <>
      <TextField label={t.hwProjectName} value={value.name} onChange={v => set('name', v)} placeholder="My Project" />
      <TextField label={t.hwProjectDesc} value={value.description} onChange={v => set('description', v)} multiline placeholder={t.hwProjectDescPlaceholder} hint={t.hwProjectDescHint} />
      <SelectField label={t.hwProjectType} value={value.projectType} onChange={v => set('projectType', v)} options={PROJECT_TYPE_LABELS} />
      <TextField label={t.hwStack} value={value.stack} onChange={v => set('stack', v)} placeholder="Next.js + Supabase, or Python + FastAPI…" />
      <SelectField
        label={t.hwPackageManager}
        value={value.packageManager}
        onChange={v => set('packageManager', v)}
        options={[
          { value: 'npm',   label: 'npm' },
          { value: 'pnpm',  label: 'pnpm' },
          { value: 'yarn',  label: 'yarn' },
          { value: 'bun',   label: 'bun' },
          { value: 'other', label: 'other' },
        ]}
      />
      <TextField label={t.hwRuntime} value={value.runtime} onChange={v => set('runtime', v)} placeholder="Node 20 / Python 3.12 / …" />
      <CommandsKV value={value.commands} onChange={v => set('commands', v)} t={t} />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Architecture form: coding rules + DoD + commitConvention
// ─────────────────────────────────────────────────────────────────────────────

interface RuleRowProps {
  rule:     CodingRule
  onToggle: (id: string | undefined) => void
}

function RuleRow({ rule, onToggle }: RuleRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`hw-rule${rule.enabled ? ' is-on' : ''}`}>
      <div className="hw-rule-head">
        <input
          type="checkbox"
          className="hw-rule-check"
          checked={rule.enabled}
          onChange={() => onToggle(rule.id)}
          aria-label={rule.title}
        />
        <button
          type="button"
          className="hw-rule-title"
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
        >
          {rule.title}
        </button>
      </div>
      {expanded && <div className="hw-rule-body">{rule.text}</div>}
    </div>
  )
}

interface RuleGroupProps {
  title:     string
  rules:     ReadonlyArray<CodingRule>
  toggle:    (id: string | undefined) => void
  toggleAll: (enable: boolean) => void
  checkAll:  string
  uncheckAll:string
}

function RuleGroup({ title, rules, toggle, toggleAll, checkAll, uncheckAll }: RuleGroupProps): JSX.Element {
  const [open, setOpen] = useState(true)
  const allOn  = rules.every(r => r.enabled)
  const allOff = rules.every(r => !r.enabled)
  return (
    <div className="hw-rule-group">
      <div className="hw-rule-group-head">
        <button type="button" className="hw-rule-group-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          {open ? '▾' : '▸'} {title} <span className="hw-rule-group-count">({rules.filter(r => r.enabled).length} / {rules.length})</span>
        </button>
        <button type="button" className="hw-rule-group-bulk" onClick={() => toggleAll(!allOn)} disabled={allOn && allOff}>
          {allOn ? uncheckAll : checkAll}
        </button>
      </div>
      {open && rules.map(r => <RuleRow key={r.id ?? r.title} rule={r} onToggle={toggle} />)}
    </div>
  )
}

interface CustomRuleEditorProps {
  rules:    ReadonlyArray<CodingRule>
  onChange: (next: CodingRule[]) => void
  t:        Translations
}

function CustomRuleEditor({ rules, onChange, t }: CustomRuleEditorProps): JSX.Element {
  const setAt = (i: number, patch: Partial<CodingRule>): void =>
    onChange(rules.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const remove = (i: number): void =>
    onChange(rules.filter((_, idx) => idx !== i))
  const add = (): void =>
    onChange([...rules, { title: '', text: '', enabled: true, source: 'user-defined' }])
  return (
    <div className="hw-rule-group">
      <div className="hw-rule-group-head">
        <span className="hw-rule-group-toggle">{t.hwCustomRulesTitle}</span>
      </div>
      {rules.map((r, i) => (
        <div key={i} className="hw-custom-rule">
          <div className="hw-custom-rule-head">
            <input
              type="checkbox"
              className="hw-rule-check"
              checked={r.enabled}
              onChange={e => setAt(i, { enabled: e.target.checked })}
              aria-label="Enable rule"
            />
            <input
              className="hw-field-input hw-custom-rule-title"
              type="text"
              value={r.title}
              placeholder={t.hwRuleTitlePlaceholder}
              onChange={e => setAt(i, { title: e.target.value })}
            />
            <button type="button" className="hw-row-remove" aria-label="Remove rule" onClick={() => remove(i)}>✕</button>
          </div>
          <textarea
            className="hw-field-input hw-field-textarea"
            value={r.text}
            placeholder={t.hwRuleTextPlaceholder}
            rows={3}
            onChange={e => setAt(i, { text: e.target.value })}
          />
        </div>
      ))}
      <button type="button" className="hw-add-btn" onClick={add}>{t.hwAddCustomRule}</button>
    </div>
  )
}

function ArchitectureForm({ value, onChange }: { value: HarnessConfig['architecture']; onChange: (v: HarnessConfig['architecture']) => void }): JSX.Element {
  const t = useLang()
  const rules = value.codingRules

  const CATEGORY_LABELS: Record<CodingRuleCategory, string> = {
    discipline:    t.catDiscipline,
    typescript:    t.catTypescript,
    react:         t.catReact,
    css:           t.catCss,
    testing:       t.catTesting,
    git:           t.catGit,
    security:      t.catSecurity,
    architecture:  t.catArchitecture,
    performance:   t.catPerformance,
    documentation: t.catDocumentation,
  }

  const toggleById = (id: string | undefined): void => {
    if (!id) return
    onChange({
      ...value,
      codingRules: rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r),
    })
  }

  const replaceCustom = (next: CodingRule[]): void =>
    onChange({
      ...value,
      codingRules: [...rules.filter(r => r.source !== 'user-defined'), ...next],
    })

  const setBulkEnabled = (matcher: (r: CodingRule) => boolean, enabled: boolean): void => {
    onChange({
      ...value,
      codingRules: rules.map(r => matcher(r) ? { ...r, enabled } : r),
    })
  }

  const defaults = rules.filter(r => r.source === 'builtin-default')
  const optional = rules.filter(r => r.source === 'builtin-optional')
  const custom   = rules.filter(r => r.source === 'user-defined')

  const groups = new Map<CodingRuleCategory, CodingRule[]>()
  for (const r of optional) {
    if (!r.category) continue
    const arr = groups.get(r.category) ?? []
    arr.push(r)
    groups.set(r.category, arr)
  }

  return (
    <>
      <p className="hw-section-blurb">{t.hwArchBlurb}</p>

      <RuleGroup
        title={t.hwDefaultRules}
        rules={defaults}
        toggle={toggleById}
        toggleAll={(enable) => setBulkEnabled(r => r.source === 'builtin-default', enable)}
        checkAll={t.hwCheckAll}
        uncheckAll={t.hwUncheckAll}
      />

      {Array.from(groups.entries()).map(([cat, rs]) => (
        <RuleGroup
          key={cat}
          title={CATEGORY_LABELS[cat]}
          rules={rs}
          toggle={toggleById}
          toggleAll={(enable) => setBulkEnabled(r => r.source === 'builtin-optional' && r.category === cat, enable)}
          checkAll={t.hwCheckAll}
          uncheckAll={t.hwUncheckAll}
        />
      ))}

      <CustomRuleEditor rules={custom} onChange={replaceCustom} t={t} />

      <StringList
        label={t.hwDefinitionOfDone}
        values={value.definitionOfDone}
        onChange={v => onChange({ ...value, definitionOfDone: v })}
        placeholder="One item per row…"
        addLabel={t.hwAdd}
      />

      <SelectField
        label={t.hwCommitConvention}
        value={value.commitConvention}
        onChange={v => onChange({ ...value, commitConvention: v })}
        options={[
          { value: 'conventional', label: 'Conventional Commits' },
          { value: 'free',         label: 'Free-form' },
        ]}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode select page
// ─────────────────────────────────────────────────────────────────────────────

function ModeSelectPage({ onSelect }: { onSelect: (mode: WizardMode) => void }): JSX.Element {
  const t = useLang()
  return (
    <div className="hw-mode-select">
      <div className="hw-mode-select-header">
        <p className="hw-mode-select-title">{t.hwModeSelectTitle}</p>
        <p className="hw-mode-select-subtitle">{t.hwModeSelectSubtitle}</p>
      </div>
      <div className="hw-mode-cards">
        <button className="hw-mode-card" onClick={() => onSelect('beginner')}>
          <span className="hw-mode-card-label">{t.hwModeBeginnerLabel}</span>
          <span className="hw-mode-card-hint">{t.hwModeBeginnerHint}</span>
        </button>
        <button className="hw-mode-card" onClick={() => onSelect('pro')}>
          <span className="hw-mode-card-label">{t.hwModeProLabel}</span>
          <span className="hw-mode-card-hint">{t.hwModeProHint}</span>
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Beginner form
// ─────────────────────────────────────────────────────────────────────────────

const MIN_DESCRIPTION_LEN = 50

interface BeginnerFormProps {
  generating:  boolean
  status:      string
  onGenerate:  (name: string, description: string, projectType: ProjectType) => Promise<void>
  onSwitchPro: () => void
}

function BeginnerForm({ generating, status, onGenerate, onSwitchPro }: BeginnerFormProps): JSX.Element {
  const t = useLang()
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [projectType, setProjectType] = useState<ProjectType>('other')

  const descLen = description.trim().length
  const canGen  = name.trim().length > 0 && descLen >= MIN_DESCRIPTION_LEN && !generating

  return (
    <div className="hw-beginner">
      <div className="hw-beginner-form">
        <label className="hw-field">
          <span className="hw-field-label">{t.hwProjectName}</span>
          <input
            className="hw-field-input"
            type="text"
            value={name}
            placeholder="My Project"
            onChange={e => setName(e.target.value)}
            disabled={generating}
          />
        </label>
        <label className="hw-field">
          <span className="hw-field-label">{t.hwProjectDesc}</span>
          <span className="hw-field-hint">{t.hwProjectDescHint}</span>
          <textarea
            className="hw-field-input hw-field-textarea hw-beginner-desc"
            value={description}
            placeholder={t.hwProjectDescPlaceholder}
            rows={7}
            onChange={e => setDescription(e.target.value)}
            disabled={generating}
          />
          <span className={`hw-beginner-charcount${descLen < MIN_DESCRIPTION_LEN ? ' is-short' : ''}`}>
            {descLen} / {MIN_DESCRIPTION_LEN} {t.hwCharsMinimum}
          </span>
        </label>
        <SelectField
          label={t.hwProjectType}
          value={projectType}
          onChange={v => setProjectType(v)}
          options={PROJECT_TYPE_LABELS}
        />
      </div>
      <div className="hw-beginner-footer">
        <button
          className="hw-generate-btn"
          disabled={!canGen}
          onClick={() => void onGenerate(name.trim(), description.trim(), projectType)}
          title={
            !name.trim()
              ? t.hwFillNameFirst
              : descLen < MIN_DESCRIPTION_LEN
                ? t.hwMinCharsFormat(MIN_DESCRIPTION_LEN - descLen)
                : ''
          }
        >
          {generating ? t.hwGenerating : t.hwGenerate}
        </button>
        {status && <div className="hw-status">{status}</div>}
        <button type="button" className="hw-mode-switch-link" onClick={onSwitchPro}>
          {t.hwSwitchGuided}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE.md exists confirmation modal
// ─────────────────────────────────────────────────────────────────────────────

interface ClaudeMdConflictModalProps {
  onChoose: (choice: 'overwrite' | 'append' | 'cancel') => void
}

function ClaudeMdConflictModal({ onChoose }: ClaudeMdConflictModalProps): JSX.Element {
  const t = useLang()
  return (
    <div className="hw-modal-backdrop">
      <div className="hw-modal">
        <div className="hw-modal-title">{t.hwClaudeMdTitle}</div>
        <div className="hw-modal-question">{t.hwClaudeMdQuestion}</div>
        <div className="hw-modal-options">
          <button className="hw-modal-option" onClick={() => onChoose('overwrite')}>
            <span>{t.hwClaudeMdOverwrite}</span>
            <span className="hw-modal-option-hint">{t.hwClaudeMdOverwriteHint}</span>
          </button>
          <button className="hw-modal-option" onClick={() => onChoose('append')}>
            <span>{t.hwClaudeMdAppend}</span>
            <span className="hw-modal-option-hint">{t.hwClaudeMdAppendHint}</span>
          </button>
          <button className="hw-modal-option" onClick={() => onChoose('cancel')}>
            <span>{t.hwClaudeMdCancel}</span>
            <span className="hw-modal-option-hint">{t.hwClaudeMdCancelHint}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main wizard
// ─────────────────────────────────────────────────────────────────────────────

interface HarnessWizardProps {
  workspace: string
}

export function HarnessWizard({ workspace }: HarnessWizardProps): JSX.Element {
  const t = useLang()
  const [config,       setConfig]       = useState<HarnessConfig>(defaultHarnessConfig())
  const [active,       setActive]       = useState<SectionId>('basics')
  const [status,       setStatus]       = useState<string>('')
  const [generating,   setGenerating]   = useState(false)
  const [mode,         setMode]         = useState<WizardMode | null>(null)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [pendingClaudeMdChoice, setPendingClaudeMdChoice] = useState<null | { onChoose: (c: 'overwrite' | 'append' | 'cancel') => void }>(null)

  const SECTIONS: ReadonlyArray<SectionMeta> = [
    { id: 'basics',       label: t.hwSectionBasics, hint: t.hwSectionBasicsHint },
    { id: 'architecture', label: t.hwSectionArch,   hint: t.hwSectionArchHint },
  ]

  // Load existing config on mount → if found, go straight to edit view
  useEffect(() => {
    let cancelled = false
    void window.ccc?.harnessLoad(workspace).then(loaded => {
      if (cancelled) return
      if (loaded) {
        setConfig(migrateConfig(loaded))
        setConfigLoaded(true)
      }
    })
    return () => { cancelled = true }
  }, [workspace])

  // Seed default rules + DoD when entering a mode for a fresh config
  const enterMode = (m: WizardMode): void => {
    setMode(m)
    setConfig(c => {
      if (c.architecture.codingRules.length > 0) return c
      return {
        ...c,
        architecture: {
          ...c.architecture,
          codingRules:      defaultRuleSet(c.basics.projectType),
          definitionOfDone: defaultDoD(c.basics.projectType),
        },
      }
    })
  }

  // Run Generate / Update — synchronous template render in main process
  const runGenerate = async (cfg: HarnessConfig): Promise<void> => {
    setGenerating(true)
    setStatus(t.hwStatusWriting)
    try {
      // First-time write with existing CLAUDE.md → ask user what to do
      if (!cfg.meta.outputPath) {
        const probe = await window.ccc?.harnessCheck(workspace)
        if (probe?.hasClaudeMd && !probe.hasConfig) {
          const choice = await new Promise<'overwrite' | 'append' | 'cancel'>(resolve => {
            setPendingClaudeMdChoice({ onChoose: resolve })
          })
          setPendingClaudeMdChoice(null)
          if (choice === 'cancel') {
            setGenerating(false)
            setStatus(t.hwStatusCancelled)
            return
          }
          cfg = {
            ...cfg,
            meta: { ...cfg.meta, outputPath: choice === 'append' ? 'ccc-claude-md' : 'claude-md' },
          }
        } else {
          cfg = { ...cfg, meta: { ...cfg.meta, outputPath: 'claude-md' } }
        }
      }
      const result = await window.ccc?.harnessGenerate(workspace, cfg)
      setConfig(cfg)
      setConfigLoaded(true)
      const extra = result?.appendedTo ? ` (+ import added to ${result.appendedTo})`
                  : result?.backedUpFrom ? ` (old → ${result.backedUpFrom})`
                  : ''
      setStatus(`Generated → ${result?.path ?? '?'}${extra}`)
    } catch (e) {
      setStatus(`Generate failed: ${(e as Error).message}`)
    } finally {
      setGenerating(false)
    }
  }

  const onGenerateBeginner = async (name: string, description: string, projectType: ProjectType): Promise<void> => {
    const defaults = defaultHarnessConfig()
    const cfg: HarnessConfig = {
      ...defaults,
      basics: { ...defaults.basics, name, description, projectType },
      architecture: {
        codingRules:      defaultRuleSet(projectType),
        definitionOfDone: defaultDoD(projectType),
        commitConvention: 'conventional',
      },
    }
    await runGenerate(cfg)
  }

  const onUpdate = async (): Promise<void> => {
    await runGenerate(config)
  }

  const sectionForms = useMemo(() => ({
    basics:       <BasicsForm       value={config.basics}       onChange={v => setConfig(c => ({ ...c, basics: v }))} />,
    architecture: <ArchitectureForm value={config.architecture} onChange={v => setConfig(c => ({ ...c, architecture: v }))} />,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [config])

  const activeMeta    = SECTIONS.find(s => s.id === active) ?? SECTIONS[0]!
  const basicsHasName = config.basics.name.trim().length > 0
  const canUpdate     = basicsHasName && !generating

  const titlebarEl = (
    <div className="hw-titlebar">
      <div className="hw-titlebar-drag">
        <span className="hw-titlebar-title">{t.hwTitle}</span>
        <span className="hw-titlebar-workspace" title={workspace}>{workspace}</span>
      </div>
      <button className="hw-titlebar-close" aria-label="Close wizard" onClick={() => window.ccc?.closeHarnessWindow()}>✕</button>
    </div>
  )

  // Phase: no existing config and no mode chosen yet
  if (!configLoaded && mode === null) {
    return (
      <div className="hw-window">
        {titlebarEl}
        <ModeSelectPage onSelect={enterMode} />
      </div>
    )
  }

  // Phase: beginner form
  if (!configLoaded && mode === 'beginner') {
    return (
      <div className="hw-window">
        {titlebarEl}
        <BeginnerForm
          generating={generating}
          status={status}
          onGenerate={onGenerateBeginner}
          onSwitchPro={() => enterMode('pro')}
        />
        {pendingClaudeMdChoice && <ClaudeMdConflictModal onChoose={pendingClaudeMdChoice.onChoose} />}
      </div>
    )
  }

  // Phase: pro form (filling new) OR edit view (existing config)
  const isEditMode = configLoaded
  return (
    <div className="hw-window">
      {titlebarEl}
      <div className="hw-body">
        <aside className="hw-sidebar">
          {!isEditMode && (
            <div className="hw-pro-banner">
              {t.hwProBanner}
              <button type="button" className="hw-mode-switch-link" onClick={() => enterMode('beginner')}>
                {t.hwSwitchManual}
              </button>
            </div>
          )}
          <nav className="hw-nav">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                className={`hw-nav-item${active === s.id ? ' is-active' : ''}`}
                onClick={() => setActive(s.id)}
              >
                <span className="hw-nav-label">{s.label}</span>
              </button>
            ))}
          </nav>
          <div className="hw-sidebar-footer">
            <button
              className="hw-generate-btn"
              disabled={!canUpdate}
              onClick={() => void onUpdate()}
              title={!basicsHasName ? t.hwFillNameFirst : ''}
            >
              {generating ? t.hwWriting : (isEditMode ? t.hwUpdate : t.hwGenerate)}
            </button>
            {status && <div className="hw-status">{status}</div>}
          </div>
        </aside>

        <main className="hw-main">
          <header className="hw-section-head">
            <h2 className="hw-section-title">{activeMeta.label}</h2>
            <span className="hw-section-hint">{activeMeta.hint}</span>
          </header>
          <div className="hw-section-form">
            {sectionForms[active]}
          </div>
        </main>
      </div>

      {pendingClaudeMdChoice && <ClaudeMdConflictModal onChoose={pendingClaudeMdChoice.onChoose} />}
    </div>
  )
}
