import { useEffect, useRef, useState } from 'react'
import { useLangContext, type LangCode } from './i18n'
import type { MagiEnvItem, MagiProgress } from '../../shared/magi'

// ─────────────────────────────────────────────────────────────────────────────
// CCC-MAGI panel (formerly the Harness Wizard).
//
// Flow:
//   1. scan the session's workspace for an existing CCC-MAGI install
//      → if present: environment shows all-pass, jump to "maintaining"
//      → if absent: run the pre-install environment check
//   2. environment check (git / node≥18 / jq). Each failing item gets an
//      [Install] button that installs it in the background (brew)
//   3. once every item passes: [Install CCC-MAGI] runs `npx create-ccc-magi`
//   4. success → "CCC-MAGI is now maintaining your project"
// ─────────────────────────────────────────────────────────────────────────────

type Phase = 'scanning' | 'env' | 'installing-magi' | 'maintaining' | 'error'

interface Strings {
  scanning:        string
  envTitle:        string
  envHint:         string
  envOk:           string
  install:         string
  installing:      string
  recheck:         string
  installMagi:     string
  installingMagi:  string
  allPass:         string
  maintaining:     string
  alreadyInstalled:string
  errorTitle:      string
  retry:           string
  close:           string
}

const STRINGS: Record<LangCode, Strings> = {
  en: {
    scanning:         'Scanning the workspace…',
    envTitle:         'Environment check',
    envHint:          'CCC-MAGI installs via npx and needs these first.',
    envOk:            'ready',
    install:          'Install',
    installing:       'Installing…',
    recheck:          'Re-check',
    installMagi:      'Install CCC-MAGI',
    installingMagi:   'Installing CCC-MAGI…',
    allPass:          'All checks passed',
    maintaining:      'CCC-MAGI is now maintaining your project.',
    alreadyInstalled: 'CCC-MAGI is already installed here.',
    errorTitle:       'Something went wrong',
    retry:            'Retry',
    close:            'Close',
  },
  zh: {
    scanning:         '正在扫描工作目录…',
    envTitle:         '环境检测',
    envHint:          'CCC-MAGI 通过 npx 安装，需要先具备以下环境。',
    envOk:            '已就绪',
    install:          '安装',
    installing:       '正在安装…',
    recheck:          '重新检测',
    installMagi:      '安装 CCC-MAGI',
    installingMagi:   '正在安装 CCC-MAGI…',
    allPass:          '全部通过',
    maintaining:      'CCC-MAGI 正在正常维护你的项目。',
    alreadyInstalled: '此项目已安装 CCC-MAGI。',
    errorTitle:       '出错了',
    retry:            '重试',
    close:            '关闭',
  },
  ko: {
    scanning:         '작업 폴더를 스캔하는 중…',
    envTitle:         '환경 검사',
    envHint:          'CCC-MAGI는 npx로 설치되며 먼저 다음 환경이 필요합니다.',
    envOk:            '준비됨',
    install:          '설치',
    installing:       '설치 중…',
    recheck:          '다시 검사',
    installMagi:      'CCC-MAGI 설치',
    installingMagi:   'CCC-MAGI 설치 중…',
    allPass:          '모든 검사 통과',
    maintaining:      'CCC-MAGI가 프로젝트를 정상적으로 관리하고 있습니다.',
    alreadyInstalled: '이 프로젝트에는 CCC-MAGI가 이미 설치되어 있습니다.',
    errorTitle:       '문제가 발생했습니다',
    retry:            '다시 시도',
    close:            '닫기',
  },
}

interface HarnessWizardProps {
  workspace: string
}

export function HarnessWizard({ workspace }: HarnessWizardProps): JSX.Element {
  const { lang } = useLangContext()
  const s = STRINGS[lang]

  const [phase,          setPhase]          = useState<Phase>('scanning')
  const [items,          setItems]          = useState<MagiEnvItem[]>([])
  const [installingId,   setInstallingId]   = useState<string | null>(null)
  const [alreadyHad,     setAlreadyHad]     = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [log,            setLog]            = useState<string[]>([])
  const logEndRef                           = useRef<HTMLDivElement>(null)

  const allOk = items.length > 0 && items.every(i => i.ok)

  // Stream backend install output into the log pane.
  useEffect(() => {
    const off = window.ccc?.onMagiProgress((p: MagiProgress) =>
      setLog(prev => [...prev, p.line].slice(-300)))
    return () => off?.()
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' })
  }, [log])

  // Initial scan: installed? → maintaining (env shown as all-pass). Else → env check.
  const scan = async (): Promise<void> => {
    setPhase('scanning')
    setError(null)
    try {
      const installed = (await window.ccc?.magiCheckInstalled(workspace))?.installed ?? false
      if (installed) {
        setAlreadyHad(true)
        setPhase('maintaining')
        return
      }
      const report = await window.ccc?.magiCheckEnv()
      setItems(report?.items ?? [])
      setPhase('env')
    } catch (e) {
      setError((e as Error).message)
      setPhase('error')
    }
  }

  useEffect(() => { void scan() }, [workspace])

  const recheckEnv = async (): Promise<void> => {
    const report = await window.ccc?.magiCheckEnv()
    setItems(report?.items ?? [])
  }

  const onInstallEnv = async (item: MagiEnvItem): Promise<void> => {
    if (installingId) return
    setInstallingId(item.id)
    setLog([])
    setError(null)
    try {
      const res = await window.ccc?.magiInstallEnv(item.id)
      if (!res?.ok) { setError(res?.error ?? 'install failed'); return }
      await recheckEnv()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setInstallingId(null)
    }
  }

  const onInstallMagi = async (): Promise<void> => {
    setPhase('installing-magi')
    setLog([])
    setError(null)
    try {
      const res = await window.ccc?.magiInstall(workspace)
      if (!res?.ok) { setError(res?.error ?? 'install failed'); setPhase('error'); return }
      setAlreadyHad(false)
      setPhase('maintaining')
    } catch (e) {
      setError((e as Error).message)
      setPhase('error')
    }
  }

  const close = (): void => window.ccc?.closeHarnessWindow()

  const showLog = log.length > 0 && (installingId !== null || phase === 'installing-magi' || phase === 'error')

  return (
    <div className="hw-window">
      <div className="hw-titlebar">
        <div className="hw-titlebar-drag">
          <span className="hw-titlebar-title">CCC-MAGI</span>
          <span className="hw-titlebar-workspace" title={workspace}>{workspace}</span>
        </div>
        <button className="hw-titlebar-close" aria-label={s.close} onClick={close}>✕</button>
      </div>

      <div className="magi-body">
        {phase === 'scanning' && (
          <div className="magi-scanning">
            <span className="magi-spinner" aria-hidden="true" />
            <span>{s.scanning}</span>
          </div>
        )}

        {phase !== 'scanning' && (
          <>
            <section className="magi-section">
              <div className="magi-section-head">
                <h3 className="magi-section-title">{s.envTitle}</h3>
                {(phase === 'maintaining' || allOk)
                  ? <span className="magi-badge is-ok">{s.allPass}</span>
                  : <span className="magi-section-hint">{s.envHint}</span>}
              </div>

              <ul className="magi-env-list">
                {(phase === 'maintaining' && alreadyHad ? FORCE_PASS : items).map(item => (
                  <li key={item.id} className={`magi-env-item${item.ok ? ' is-ok' : ' is-bad'}`}>
                    <span className="magi-env-icon" aria-hidden="true">{item.ok ? '✓' : '✕'}</span>
                    <span className="magi-env-label">{item.label}</span>
                    <span className="magi-env-detail">{item.ok ? (item.detail || s.envOk) : item.detail}</span>
                    {!item.ok && item.installable && phase === 'env' && (
                      <button
                        className="magi-env-install"
                        disabled={installingId !== null}
                        onClick={() => void onInstallEnv(item)}
                      >
                        {installingId === item.id ? s.installing : s.install}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {phase === 'env' && allOk && (
              <button className="magi-primary" onClick={() => void onInstallMagi()}>
                {s.installMagi}
              </button>
            )}

            {phase === 'installing-magi' && (
              <div className="magi-installing">
                <span className="magi-spinner" aria-hidden="true" />
                <span>{s.installingMagi}</span>
              </div>
            )}

            {phase === 'maintaining' && (
              <div className="magi-maintaining">
                <span className="magi-maintaining-icon" aria-hidden="true">✦</span>
                <div className="magi-maintaining-text">
                  <div className="magi-maintaining-title">{s.allPass}</div>
                  <div className="magi-maintaining-sub">
                    {alreadyHad ? s.alreadyInstalled : s.maintaining}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="magi-error">
                <div className="magi-error-title">{s.errorTitle}</div>
                <div className="magi-error-msg">{error}</div>
                <button className="magi-secondary" onClick={() => void scan()}>{s.retry}</button>
              </div>
            )}

            {showLog && (
              <pre className="magi-log">
                {log.join('\n')}
                <div ref={logEndRef} />
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// When CCC-MAGI is already installed we don't run the env probes — the panel
// just shows the three prerequisites as satisfied (per spec: skip detection).
const FORCE_PASS: MagiEnvItem[] = [
  { id: 'git',  label: 'Git',          ok: true, detail: '', installable: true },
  { id: 'node', label: 'Node.js ≥ 18', ok: true, detail: '', installable: true },
  { id: 'jq',   label: 'jq',           ok: true, detail: '', installable: true },
]
