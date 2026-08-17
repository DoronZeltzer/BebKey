import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import './lib/i18n'
import App from './App.tsx'

// Sentry: only activate if VITE_SENTRY_DSN is set (no-op for local dev).
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    // Don't capture noisy "ResizeObserver loop limit exceeded" + extension errors
    ignoreErrors: [
      /ResizeObserver loop/i,
      /chrome-extension/i,
      /moz-extension/i,
    ],
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
