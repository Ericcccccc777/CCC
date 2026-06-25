import { useEffect, useRef, useState } from 'react'
import { useLangContext, type LangCode } from './i18n'
import type { MagiEnvItem, MagiProgress } from '../../shared/magi'

// ─────────────────────────────────────────────────────────────────────────────
// CCC-MAGI install wizard (the harness panel).
//
// Install-only surface now. Once CCC-MAGI is installed, the console (dashboard)
// is the single surface — main's openHarnessWindow opens the dashboard directly
// for installed workspaces, and the "Update CCC-MAGI" control lives in the
// dashboard Overview. So this panel never shows an "already installed" page:
//
//   1. scan the workspace → if already installed: open the console + close.
//   2. else run the env check (git / node≥18 / jq). Each failing item gets an
//      [Install] button that installs it in the background (brew).
//   3. once every item passes: [Install CCC-MAGI] runs `npx create-ccc-magi`.
//   4. success → open the console (dashboard) + close this window.
// ─────────────────────────────────────────────────────────────────────────────

type Phase = 'scanning' | 'env' | 'installing-magi' | 'error'

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

  // Once installed, the console is the single surface: open it and dismiss this
  // window so the "already installed" page never appears.
  const openConsoleAndClose = (): void => {
    window.ccc?.openDashboard(workspace)
    window.ccc?.closeHarnessWindow()
  }

  // Initial scan: installed? → jump straight to the console. Else → env check.
  const scan = async (): Promise<void> => {
    setPhase('scanning')
    setError(null)
    try {
      const installed = (await window.ccc?.magiCheckInstalled(workspace))?.installed ?? false
      if (installed) {
        openConsoleAndClose()
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
      // Installed → go straight to the console; don't show an interstitial.
      openConsoleAndClose()
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
                {allOk
                  ? <span className="magi-badge is-ok">{s.allPass}</span>
                  : <span className="magi-section-hint">{s.envHint}</span>}
              </div>

              <ul className="magi-env-list">
                {items.map(item => (
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
