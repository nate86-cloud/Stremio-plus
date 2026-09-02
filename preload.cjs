const { contextBridge, ipcRenderer } = require('electron')

// Exposes a minimal, safe API to the renderer (React) process. Only this
// API is reachable from page JavaScript — nothing else from Node.js or
// Electron is exposed, keeping contextIsolation's security boundary intact.
// ── No raw ipcRenderer is ever exposed to window ─────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  // Fetches a URL from the main process instead of the renderer, so it
  // isn't subject to the renderer's CORS restrictions — mirrors how the
  // official Stremio desktop app avoids CORS issues with addon servers.
  // Returns { ok, status, json } or { ok: false, error } — mirrors enough
  // of the Fetch Response shape that calling code barely has to change.
  fetchAddon: (url, options) => {
    if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return Promise.reject(new Error('Invalid URL'))
    // Only allow plain serializable options; AbortSignal/dispatcher are stripped in addonFetch already
    const safeOpts = options && typeof options === 'object' ? { ...options } : {}
    delete safeOpts.signal
    delete safeOpts.dispatcher
    return ipcRenderer.invoke('fetch-addon', url, safeOpts)
  },
  setHardwareDecoding: (enabled) => {
    if (typeof enabled !== 'boolean') return Promise.reject(new Error('enabled must be boolean'))
    return ipcRenderer.invoke('set-hardware-decoding', enabled)
  },
  getHardwareDecodingStatus: () => ipcRenderer.invoke('get-hardware-decoding-status'),
  updateServerSettings: (patch) => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return Promise.reject(new Error('patch must be an object'))
    return ipcRenderer.invoke('update-server-settings', patch)
  },
  getServerSettings: () => ipcRenderer.invoke('get-server-settings'),
  relaunchApp: () => ipcRenderer.invoke('relaunch-app'),
  // Best-effort launch of the official Stremio streaming server (see
  // electron.js for the full explanation of why this is "best-effort" —
  // this app doesn't own or bundle that service, so this can only try
  // conventional install paths, not guarantee a running server).
  launchStreamingServer: () => ipcRenderer.invoke('launch-streaming-server'),


  platform: process.platform,

  // Custom title bar window controls (needed because frame:false removes
  // all native close/minimize/maximize chrome — see electron.js).
  // These use ipcRenderer.send, not invoke: they're fire-and-forget
  // commands to the main process with no return value expected.
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window-maximize-toggle'),
  closeWindow: () => ipcRenderer.send('window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // Subscribes to native window focus/blur so the renderer can dim the UI
  // when the app loses focus, matching native macOS window behavior.
  // Returns an unsubscribe function, following the common
  // addEventListener-style pattern for renderer-side cleanup in a
  // useEffect. The raw ipcRenderer 'on' callback receives an IPC event
  // object as its first arg before the actual payload — that's stripped
  // here so the renderer callback just gets the boolean it cares about.
  onWindowFocusChanged: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, isFocused) => callback(isFocused)
    ipcRenderer.on('window-focus-changed', listener)
    return () => ipcRenderer.removeListener('window-focus-changed', listener)
  },

  onWindowMaximizedChanged: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, isMaximized) => callback(isMaximized)
    ipcRenderer.on('window-maximized-changed', listener)
    return () => ipcRenderer.removeListener('window-maximized-changed', listener)
  },


  // Opens a URL in the OS default browser rather than inside this app's
  // Electron process — used for add-on /configure pages, which serve
  // untrusted third-party HTML.
  openExternalUrl: (url) => {
    if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return Promise.resolve({ ok: false, error: 'Invalid URL' })
    return ipcRenderer.invoke('open-external-url', url)
  },

  // ── App updater (electron-updater) ─────────────────────────────────
  // Renderer can check status, trigger manual check, and listen for download progress.
  // No raw autoUpdater is exposed — only strictly defined actions.
  checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('updater:quit-and-install'),
  getUpdaterStatus: () => ipcRenderer.invoke('updater:get-status'),
  onUpdaterStatus: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('updater:status', listener)
    return () => ipcRenderer.removeListener('updater:status', listener)
  },
})