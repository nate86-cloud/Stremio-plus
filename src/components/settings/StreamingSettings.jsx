import { useState, useEffect } from 'react'
import { Server, Save, Check, AlertCircle } from 'lucide-react'
import {
  DEFAULT_STREAMING_SERVER_BASE,
  DEFAULT_STREAMING_SETTINGS,
  getStreamingServerBaseUrl,
  readLocalSettings,
  saveStreamingSettings,
  isValidStreamingServerUrl,
  normalizeStreamingServerUrl,
  hydrateStreamingSettingsFromCloud,
  getProxyUrl,
  normalizeProxyUrl,
  isValidProxyUrl,
} from '../../utils/streamingSettings'

export default function StreamingSettings() {
  const [inputValue, setInputValue] = useState(() => {
    try {
      return readLocalSettings().streamingServerUrl || ''
    } catch {
      return ''
    }
  })
  const [effectiveUrl, setEffectiveUrl] = useState(() => {
    try {
      return getStreamingServerBaseUrl()
    } catch {
      return DEFAULT_STREAMING_SERVER_BASE
    }
  })
  const [isSaving, setIsSaving] = useState(false)
  const [saveState, setSaveState] = useState('idle') // idle | saved | error
  const [errorMsg, setErrorMsg] = useState('')

  const [proxyInput, setProxyInput] = useState(() => {
    try {
      return readLocalSettings().proxyUrl || readLocalSettings().stremThruProxyUrl || ''
    } catch {
      return ''
    }
  })
  const [proxyEffective, setProxyEffective] = useState(() => {
    try {
      return getProxyUrl()
    } catch {
      return ''
    }
  })
  const [isSavingProxy, setIsSavingProxy] = useState(false)
  const [proxySaveState, setProxySaveState] = useState('idle')
  const [proxyErrorMsg, setProxyErrorMsg] = useState('')

  // Hydrate from cloud-synced settings on mount and when userSettings changes
  useEffect(() => {
    function syncFromStorage() {
      try {
        hydrateStreamingSettingsFromCloud()
        const local = readLocalSettings()
        setInputValue(local.streamingServerUrl || '')
        setEffectiveUrl(getStreamingServerBaseUrl())
        setProxyInput(local.proxyUrl || local.stremThruProxyUrl || '')
        setProxyEffective(getProxyUrl())
      } catch {}
    }

    // Initial hydrate (covers cross-device pull that happened before mount)
    syncFromStorage()

    // Listen for Supabase pull hydrating streamingSettings via user_settings
    function handleStorage(e) {
      if (e.key === 'stremio_streaming_server_settings' || e.key === 'stremio_user_settings') {
        syncFromStorage()
      }
    }
    window.addEventListener('storage', handleStorage)

    // Also listen for local in-app changes (another tab or same-tab dispatch)
    function handleSettingsChanged() {
      syncFromStorage()
    }
    window.addEventListener('stremio:user-settings-changed', handleSettingsChanged)
    window.addEventListener('stremio:installed-addons-changed', handleSettingsChanged)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('stremio:user-settings-changed', handleSettingsChanged)
      window.removeEventListener('stremio:installed-addons-changed', handleSettingsChanged)
    }
  }, [])

  // Auto-clear saved/error feedback after delay
  useEffect(() => {
    if (saveState === 'saved' || saveState === 'error') {
      const t = setTimeout(() => {
        setSaveState('idle')
        if (saveState === 'error') setErrorMsg('')
      }, 3000)
      return () => clearTimeout(t)
    }
  }, [saveState])

  useEffect(() => {
    if (proxySaveState === 'saved' || proxySaveState === 'error') {
      const t = setTimeout(() => {
        setProxySaveState('idle')
        if (proxySaveState === 'error') setProxyErrorMsg('')
      }, 3000)
      return () => clearTimeout(t)
    }
  }, [proxySaveState])

  const isCustom = inputValue.trim() !== ''
  const displayEffective = effectiveUrl || DEFAULT_STREAMING_SERVER_BASE
  const hasChanged = (() => {
    try {
      const current = readLocalSettings().streamingServerUrl || ''
      return (current || '').trim() !== inputValue.trim()
    } catch {
      return true
    }
  })()

  async function handleSave() {
    const raw = inputValue.trim()

    if (raw && !isValidStreamingServerUrl(raw)) {
      setErrorMsg('Invalid URL — use http://host:port (e.g. http://192.168.1.10:11470)')
      setSaveState('error')
      return
    }

    setIsSaving(true)
    setSaveState('idle')
    setErrorMsg('')

    try {
      const normalized = raw ? normalizeStreamingServerUrl(raw) || raw : ''
      const result = await saveStreamingSettings({ streamingServerUrl: normalized })
      setEffectiveUrl(getStreamingServerBaseUrl())
      // Notify health check and other listeners immediately
      window.dispatchEvent(new CustomEvent('stremio:streaming-server-url-changed'))
      // Keep input as normalized display
      if (normalized !== raw) setInputValue(normalized)
      setSaveState('saved')
      // Briefly keep effectiveUrl in sync with server response if needed
      if (result?.settings?.streamingServerUrl !== undefined) {
        setInputValue(result.settings.streamingServerUrl || '')
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save streaming server URL')
      setSaveState('error')
    } finally {
      setIsSaving(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  async function handleProxySave() {
    const raw = proxyInput.trim()
    if (raw && !isValidProxyUrl(raw)) {
      setProxyErrorMsg('Invalid proxy URL — use http(s)://host:port')
      setProxySaveState('error')
      return
    }
    setIsSavingProxy(true)
    setProxySaveState('idle')
    setProxyErrorMsg('')
    try {
      const normalized = raw ? normalizeProxyUrl(raw) || raw : ''
      const result = await saveStreamingSettings({ proxyUrl: normalized, stremThruProxyUrl: normalized })
      setProxyEffective(getProxyUrl())
      if (normalized !== raw) setProxyInput(normalized)
      setProxySaveState('saved')
      window.dispatchEvent(new CustomEvent('stremio:proxy-url-changed'))
      if (result?.settings?.proxyUrl !== undefined) {
        setProxyInput(result.settings.proxyUrl || '')
      }
    } catch (err) {
      setProxyErrorMsg(err.message || 'Failed to save proxy URL')
      setProxySaveState('error')
    } finally {
      setIsSavingProxy(false)
    }
  }

  function handleProxyKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleProxySave()
    }
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
      {/* Header */}
      <div className="px-5 py-4 flex items-start gap-3 border-b border-black/5 dark:border-white/10">
        <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
          <Server className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold">Remote Streaming Server</h4>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
            Use a remote Stremio streaming daemon or custom IP/port. Leave empty to fall back to the local default.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="p-5 space-y-4">
        <div>
          <label htmlFor="streaming-server-url" className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5">
            Custom Streaming URL
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                id="streaming-server-url"
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value)
                  if (saveState !== 'idle') setSaveState('idle')
                }}
                onKeyDown={handleKeyDown}
                placeholder={DEFAULT_STREAMING_SERVER_BASE}
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-xl px-4 py-2.5 pr-10 text-sm bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 outline-none focus:ring-2 focus:ring-accent placeholder:text-neutral-400 transition-all"
              />
              {isCustom && (
                <button
                  onClick={() => {
                    setInputValue('')
                    setSaveState('idle')
                    setErrorMsg('')
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  aria-label="Clear"
                  type="button"
                >
                  ×
                </button>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="glass-capsule glass-interactive shrink-0 flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium bg-accent! text-white hover:bg-accent/90! disabled:opacity-60 transition-colors"
              type="button"
            >
              {isSaving ? (
                <>Saving…</>
              ) : saveState === 'saved' ? (
                <>
                  <Check className="w-4 h-4" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {hasChanged ? 'Save' : 'Update URL'}
                </>
              )}
            </button>
          </div>

          {/* Inline validation / feedback */}
          {saveState === 'error' && errorMsg && (
            <p className="flex items-center gap-1.5 text-xs text-red-500 mt-2">
              <AlertCircle className="w-3.5 h-3.5" />
              {errorMsg}
            </p>
          )}
          {saveState === 'saved' && !errorMsg && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mt-2">
              <Check className="w-3.5 h-3.5" />
              Streaming server URL updated — all stream requests will now route through the new base.
            </p>
          )}
          {saveState === 'idle' && isCustom && isValidStreamingServerUrl(inputValue) && hasChanged && (
            <p className="text-xs text-neutral-400 mt-2">Press Save to apply the new remote address.</p>
          )}
        </div>

        <div>
          <label htmlFor="proxy-url" className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5">
            Proxy / Debrid Integration (MediaFlow / StremThru)
          </label>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-1.5">Optional — route HLS/M3U8 through your proxy to bypass IP limits. Supports MediaFlow Proxy & StremThru.</p>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                id="proxy-url"
                type="text"
                value={proxyInput}
                onChange={(e) => {
                  setProxyInput(e.target.value)
                  if (proxySaveState !== 'idle') setProxySaveState('idle')
                }}
                onKeyDown={handleProxyKeyDown}
                placeholder="https://my-proxy.example.com"
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-xl px-4 py-2.5 pr-10 text-sm bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 outline-none focus:ring-2 focus:ring-accent placeholder:text-neutral-400 transition-all"
              />
              {proxyInput.trim() && (
                <button
                  onClick={() => {
                    setProxyInput('')
                    setProxySaveState('idle')
                    setProxyErrorMsg('')
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  aria-label="Clear"
                  type="button"
                >
                  ×
                </button>
              )}
            </div>
            <button
              onClick={handleProxySave}
              disabled={isSavingProxy}
              className="glass-capsule glass-interactive shrink-0 flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium bg-accent! text-white hover:bg-accent/90! disabled:opacity-60 transition-colors"
              type="button"
            >
              {isSavingProxy ? (
                <>Saving…</>
              ) : proxySaveState === 'saved' ? (
                <>
                  <Check className="w-4 h-4" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {proxyInput.trim() && getProxyUrl() !== proxyInput.trim() ? 'Save' : 'Update'}
                </>
              )}
            </button>
          </div>
          {proxySaveState === 'error' && proxyErrorMsg && (
            <p className="flex items-center gap-1.5 text-xs text-red-500 mt-2">
              <AlertCircle className="w-3.5 h-3.5" />
              {proxyErrorMsg}
            </p>
          )}
          {proxySaveState === 'saved' && !proxyErrorMsg && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mt-2">
              <Check className="w-3.5 h-3.5" />
              Proxy URL updated — HLS streams will now route through your proxy.
            </p>
          )}
          {proxyEffective && (
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1.5">Active proxy: <span className="font-mono">{proxyEffective}</span></p>
          )}
        </div>

        {/* Effective URL + fallback notice */}
        <div className="glass-clear rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Active server</p>
            <p className="text-sm font-mono truncate mt-0.5" title={displayEffective}>
              {displayEffective}
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {isCustom
                ? 'Custom remote daemon — streams and /settings will query this host.'
                : `Fallback to default local server (${DEFAULT_STREAMING_SETTINGS.streamingServerUrl || DEFAULT_STREAMING_SERVER_BASE})`}
            </p>
          </div>
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isCustom ? 'bg-accent shadow shadow-accent/30' : 'bg-emerald-500 shadow shadow-emerald-500/30'}`} />
        </div>

        {/* Quick presets for the URLs you provided — one-tap fill */}
        <div className="flex flex-wrap gap-2 px-1">
          <button
            type="button"
            onClick={() => setInputValue('http://localhost:11470')}
            className="text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 transition-colors"
          >
            Use localhost:11470
          </button>
          <button
            type="button"
            onClick={() => setInputValue('https://192-168-100-4.519b6502d940.stremio.rocks:12470')}
            className="text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 transition-colors"
            title="Stremio remote relay for 192.168.100.4"
          >
            Use 192.168.100.4 relay
          </button>
          <button
            type="button"
            onClick={() => setInputValue('')}
            className="text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 transition-colors"
            title="Clear to use local default"
          >
            Clear
          </button>
        </div>

        <p className="text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500 px-1">
          Tip: <span className="font-mono text-neutral-600 dark:text-neutral-300">http://localhost:11470</span> for local daemon,{' '}
          <span className="font-mono text-neutral-600 dark:text-neutral-300">https://192-168-100-4.519b6502d940.stremio.rocks:12470</span> for your remote relay, or{' '}
          <span className="font-mono text-neutral-600 dark:text-neutral-300">http://192.168.100.4:11470</span> for direct LAN. Must include host and port.
        </p>
      </div>
    </div>
  )
}
