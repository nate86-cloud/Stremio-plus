import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.jsx'
import './index.css'
import { CloudAuthProvider } from './context/CloudAuthContext.jsx'
import { SupabaseProvider } from './context/SupabaseContext.jsx'
import { ProfileProvider } from './context/ProfileContext.jsx'
import { ThemeProvider } from './context/ThemeProvider.jsx'

// ─── Sentry (renderer) — init before any React render ────────────────────
// VITE_SENTRY_DSN is public per Sentry docs; if empty, Sentry stays disabled — app runs normally.
// Example: VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/123
const sentryDsn = import.meta.env.VITE_SENTRY_DSN
if (sentryDsn) {
  try {
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE || 'production',
      // Sample 10% of transactions + 0% replays unless you enable them
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0.5,
      integrations: (defaults) => defaults,
      // Don't send PII by default
      sendDefaultPii: false,
    })
    console.log('[sentry] Renderer initialized')
  } catch (err) {
    console.warn('[sentry] Renderer init failed:', err?.message || err)
  }
} else {
  console.log('[sentry] VITE_SENTRY_DSN not set — Sentry disabled in renderer')
}

function FallbackError({ error, resetError }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: 'white', padding: 24, textAlign: 'center' }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 16 }}>{error?.message || 'An unexpected error occurred.'}</p>
        <button
          onClick={resetError}
          style={{ background: 'white', color: 'black', borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 500 }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}

const SentryBoundary = sentryDsn ? Sentry.ErrorBoundary : ({ children }) => children

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SentryBoundary fallback={({ error, resetError }) => <FallbackError error={error} resetError={resetError} />} showDialog={false}>
      <ThemeProvider>
        <ProfileProvider>
          <CloudAuthProvider>
            <SupabaseProvider>
              <App />
            </SupabaseProvider>
          </CloudAuthProvider>
        </ProfileProvider>
      </ThemeProvider>
    </SentryBoundary>
  </React.StrictMode>
)
