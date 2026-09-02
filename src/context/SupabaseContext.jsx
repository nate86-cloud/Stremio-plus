import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useCloudAuth } from './CloudAuthContext'
import { pushStore, pullAllStores, flushPendingPushes, writeLocal } from '../services/cloudSync'

const SupabaseContext = createContext({
  isSyncing: false,
  lastSyncedAt: null,
  syncNow: async () => {},
})

export function SupabaseProvider({ children }) {
  const { user, isCloudConfigured } = useCloudAuth()
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)

  // Initial pull on login — now pulls all 7 stores (profiles + perProfile maps)
  useEffect(() => {
    if (!isCloudConfigured || !user?.id) return

    let cancelled = false
    setIsSyncing(true)
    pullAllStores(user.id)
      .then(() => {
        if (cancelled) return
        setLastSyncedAt(Date.now())
        // Hydrate derived local keys from cloud userSettings (cross-device carryover)
        try {
          const raw = localStorage.getItem('stremio_user_settings')
          if (raw) {
            const parsed = JSON.parse(raw)
            // Streaming server URL: only if local empty (LAN IP guard)
            const cloudUrl = parsed?.streamingSettings?.streamingServerUrl
            if (cloudUrl && typeof cloudUrl === 'string' && cloudUrl.trim()) {
              const localRaw = localStorage.getItem('stremio_streaming_server_settings')
              const local = localRaw ? JSON.parse(localRaw) : {}
              if (!local.streamingServerUrl || !local.streamingServerUrl.trim()) {
                localStorage.setItem(
                  'stremio_streaming_server_settings',
                  JSON.stringify({ ...local, streamingServerUrl: cloudUrl.trim() })
                )
                window.dispatchEvent(new CustomEvent('stremio:streaming-server-url-changed'))
              }
            }
            // Subtitle preferences: hydrate from cloud user_settings
            if (parsed?.subtitlePreferences) {
              try {
                localStorage.setItem('stremio_subtitle_preferences', JSON.stringify(parsed.subtitlePreferences))
                window.dispatchEvent(new CustomEvent('stremio:subtitle-preferences-changed', { detail: parsed.subtitlePreferences }))
              } catch {}
            }
          }
        } catch {}
        // Notify profile + progress consumers that pull hydrated localStorage
        try {
          window.dispatchEvent(new CustomEvent('stremio:profiles-pulled'))
          window.dispatchEvent(new CustomEvent('stremio:watch-progress-changed'))
          window.dispatchEvent(new CustomEvent('stremio:viewing-log-changed'))
        } catch {}
      })
      .catch((err) => {
        console.warn('[SupabaseContext] Initial pull failed:', err)
      })
      .finally(() => {
        if (!cancelled) setIsSyncing(false)
      })

    return () => { cancelled = true }
  }, [user?.id, isCloudConfigured])

  // Periodic background flush every 30s
  useEffect(() => {
    if (!isCloudConfigured || !user?.id) return
    const interval = setInterval(async () => {
      try {
        await flushPendingPushes(user.id)
        setLastSyncedAt(Date.now())
      } catch (err) {
        console.warn('[SupabaseContext] Background sync heartbeat failed:', err)
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [user?.id, isCloudConfigured])

  // Listen for local changes → debounced push per store
  useEffect(() => {
    if (!isCloudConfigured || !user?.id) return

    const timers = {}

    function debouncePush(storeName, delay = 1000) {
      if (timers[storeName]) clearTimeout(timers[storeName])
      timers[storeName] = setTimeout(() => {
        pushStore(storeName, user.id).catch(() => {})
        setLastSyncedAt(Date.now())
      }, delay)
    }

    const handleUserSettingsChange = (e) => {
      if (e.detail) {
        writeLocal('userSettings', e.detail)
        try {
          const cloudUrl = e.detail?.streamingSettings?.streamingServerUrl
          if (cloudUrl !== undefined) {
            const localRaw = localStorage.getItem('stremio_streaming_server_settings')
            const local = localRaw ? JSON.parse(localRaw) : {}
            const nextUrl = cloudUrl && typeof cloudUrl === 'string' ? cloudUrl.trim() : ''
            if ((local.streamingServerUrl || '') !== nextUrl) {
              localStorage.setItem('stremio_streaming_server_settings', JSON.stringify({ ...local, streamingServerUrl: nextUrl }))
              window.dispatchEvent(new CustomEvent('stremio:streaming-server-url-changed'))
            }
          }
          if (e.detail?.subtitlePreferences) {
            try { localStorage.setItem('stremio_subtitle_preferences', JSON.stringify(e.detail.subtitlePreferences)) } catch {}
          }
        } catch {}
        debouncePush('userSettings', 800)
      }
    }

    const handleProfilesChanged = () => debouncePush('profiles', 800)
    const handleWatchProgressPersisted = () => debouncePush('watchProgress', 1200)
    // watched shares watchProgress store (same debounce), but we push both for safety
    const handleViewingLogChanged = () => debouncePush('viewingLog', 2000)
    const handleInstalledAddonsChanged = () => debouncePush('installedAddons', 800)
    const handleWatchedChanged = () => debouncePush('watched', 1200)
    const handlePlaybackQueueChanged = () => debouncePush('playbackQueue', 800)

    window.addEventListener('stremio:user-settings-changed', handleUserSettingsChange)
    window.addEventListener('stremio:profiles-changed', handleProfilesChanged)
    window.addEventListener('stremio:watch-progress-persisted', handleWatchProgressPersisted)
    window.addEventListener('stremio:watch-progress-changed', handleWatchedChanged) // watched uses same event
    window.addEventListener('stremio:viewing-log-changed', handleViewingLogChanged)
    window.addEventListener('stremio:installed-addons-changed', handleInstalledAddonsChanged)
    window.addEventListener('stremio:playback-queue-changed', handlePlaybackQueueChanged)

    return () => {
      for (const t of Object.values(timers)) clearTimeout(t)
      window.removeEventListener('stremio:user-settings-changed', handleUserSettingsChange)
      window.removeEventListener('stremio:profiles-changed', handleProfilesChanged)
      window.removeEventListener('stremio:watch-progress-persisted', handleWatchProgressPersisted)
      window.removeEventListener('stremio:watch-progress-changed', handleWatchedChanged)
      window.removeEventListener('stremio:viewing-log-changed', handleViewingLogChanged)
      window.removeEventListener('stremio:installed-addons-changed', handleInstalledAddonsChanged)
      window.removeEventListener('stremio:playback-queue-changed', handlePlaybackQueueChanged)
    }
  }, [user?.id, isCloudConfigured])

  const syncNow = useCallback(async (storeName) => {
    if (!isCloudConfigured || !user?.id) return { ok: false, reason: 'not-configured' }
    setIsSyncing(true)
    try {
      if (storeName) {
        const res = await pushStore(storeName, user.id)
        setLastSyncedAt(Date.now())
        return res
      } else {
        await flushPendingPushes(user.id)
        // Also pull to get remote changes
        await pullAllStores(user.id)
        try {
          window.dispatchEvent(new CustomEvent('stremio:profiles-pulled'))
          window.dispatchEvent(new CustomEvent('stremio:watch-progress-changed'))
          window.dispatchEvent(new CustomEvent('stremio:viewing-log-changed'))
        } catch {}
        setLastSyncedAt(Date.now())
        return { ok: true }
      }
    } finally {
      setIsSyncing(false)
    }
  }, [user?.id, isCloudConfigured])

  return (
    <SupabaseContext.Provider value={{ isSyncing, lastSyncedAt, syncNow }}>
      {children}
    </SupabaseContext.Provider>
  )
}

export function useSupabase() {
  return useContext(SupabaseContext)
}
