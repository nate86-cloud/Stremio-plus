import { useEffect, useState, useCallback } from 'react'
import * as Sentry from '@sentry/react'

/**
 * Subscribes to electron-updater events bridged via preload.cjs (`window.electronAPI`).
 * - In Electron: shows checking / available / downloaded states, allows user to restart.
 * - Outside Electron (vite preview / browser): no-op, returns idle status.
 */
export function useUpdater() {
  const [status, setStatus] = useState({ type: 'idle' }) // idle | checking-for-update | update-available | update-not-available | download-progress | update-downloaded | error
  const [progress, setProgress] = useState(null)
  const [version, setVersion] = useState(null)
  const [error, setError] = useState(null)

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.onUpdaterStatus

  const checkForUpdates = useCallback(async () => {
    if (!isElectron) return { ok: false, error: 'Not in Electron' }
    try {
      const res = await window.electronAPI.checkForUpdates()
      if (!res?.ok) {
        setError(res?.error || 'Check failed')
        Sentry.captureMessage(`Updater check failed: ${res?.error}`, 'warning')
      }
      return res
    } catch (err) {
      const msg = err?.message || String(err)
      setError(msg)
      Sentry.captureException(err)
      return { ok: false, error: msg }
    }
  }, [isElectron])

  const quitAndInstall = useCallback(async () => {
    if (!isElectron) return
    try {
      await window.electronAPI.quitAndInstallUpdate()
    } catch (err) {
      Sentry.captureException(err)
      setError(err?.message || String(err))
    }
  }, [isElectron])

  useEffect(() => {
    if (!isElectron) return
    // Initial package info (optional)
    window.electronAPI.getUpdaterStatus?.().catch(() => {})

    const unsubscribe = window.electronAPI.onUpdaterStatus((payload) => {
      if (!payload || typeof payload !== 'object') return
      setStatus(payload)
      if (payload.version) setVersion(payload.version)
      if (payload.error) setError(payload.error)
      if (payload.progress) setProgress(payload.progress)
      if (payload.type === 'download-progress' && payload.progress) setProgress(payload.progress)
      if (payload.type === 'error') {
        Sentry.captureMessage(`Updater error: ${payload.error}`, 'warning')
      }
    })
    return () => {
      try { unsubscribe?.() } catch {}
    }
  }, [isElectron])

  return {
    status: status.type,
    raw: status,
    progress,
    version,
    error,
    isElectron,
    checkForUpdates,
    quitAndInstall,
    hasUpdate: status.type === 'update-available' || status.type === 'update-downloaded',
    isDownloaded: status.type === 'update-downloaded',
  }
}
