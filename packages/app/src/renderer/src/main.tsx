import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './App'
import { LangProvider } from './i18n'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

const root = createRoot(container)
root.render(<StrictMode><LangProvider><App /></LangProvider></StrictMode>)
