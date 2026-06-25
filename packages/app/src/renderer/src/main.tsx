import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './App'
import { HarnessWizard } from './HarnessWizard'
import { Dashboard } from './Dashboard'
import { LangProvider } from './i18n'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

const params    = new URLSearchParams(window.location.search)
const view      = params.get('view')
const workspace = params.get('workspace') ?? ''

const root = createRoot(container)

if (view === 'harness') {
  root.render(<StrictMode><LangProvider><HarnessWizard workspace={workspace} /></LangProvider></StrictMode>)
} else if (view === 'dashboard') {
  root.render(<StrictMode><LangProvider><Dashboard workspace={workspace} /></LangProvider></StrictMode>)
} else {
  root.render(<StrictMode><LangProvider><App /></LangProvider></StrictMode>)
}
