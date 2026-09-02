import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { spawn, fork } from 'child_process'
import { pathToFileURL } from 'url'
import dotenv from 'dotenv'

// Load .env into process.env for main (Vite loads it for renderer separately)
try { dotenv.config() } catch {}

// ─── Sentry (main) — must init before app ready ──────────────────────────
// DSN is public (client-side) per Sentry docs; keep it in env, never commit a real DSN to repo.
// Set VITE_SENTRY_DSN (renderer, Vite) or SENTRY_DSN (main, Node/Electron). If empty, Sentry stays disabled — app runs normally.
let SentryMain = null
try {
  const sentryMod = await import('@sentry/electron/main')
  SentryMain = sentryMod
  const dsn = process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN || ''
  if (dsn) {
    sentryMod.init({
      dsn,
      environment: process.env.NODE_ENV || (app.isPackaged ? 'production' : 'development'),
      // Only send errors in packaged builds unless explicitly enabled in dev
      enabled: true,
      tracesSampleRate: 0.1,
      // Electron-specific: don't send PII by default
      sendDefaultPii: false,
    })
    console.log('[sentry] Main process initialized')
  } else {
    console.log('[sentry] Main DSN not set (SENTRY_DSN / VITE_SENTRY_DSN) — Sentry disabled in main')
  }
} catch (err) {
  console.warn('[sentry] Failed to init main:', err?.message || err)
}

// ─── electron-updater (auto-update) ─────────────────────────────────────
// Uses electron-log for file logging; updater is disabled in dev (unpackaged) to avoid noisy failures.
let autoUpdater = null
let updaterLog
try {
  const logMod = await import('electron-log')
  updaterLog = logMod.default || logMod
  // electron-log is CommonJS — ensure transports exist before use
  if (updaterLog?.transports?.file) updaterLog.transports.file.level = 'info'
  const updMod = await import('electron-updater')
  // electron-updater exports autoUpdater as named; handle both CJS and ESM shapes
  autoUpdater = updMod.autoUpdater || updMod.default?.autoUpdater || updMod.default
  if (autoUpdater && updaterLog) {
    autoUpdater.logger = updaterLog
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    // Do not downgrade — keep latest
    autoUpdater.allowDowngrade = false
    console.log('[updater] Initialized (isPackaged:', app.isPackaged, ')')
  }
} catch (err) {
  console.warn('[updater] Failed to init (updates disabled):', err?.message || err)
}


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)


// Tracked so the window-control IPC handlers (minimize/maximize/close)
// below can act on the actual window rather than re-deriving it — with
// frame:false there's no native chrome to click, so every control action
// has to be routed through here from the renderer's custom title bar.
let mainWindow = null
let streamingServerProcess = null


// ─── Hardware-accelerated decoding: read the user's saved preference ──────
//
// This has to happen synchronously, at module load time, before
// app.whenReady() — Electron/Chromium's GPU process is initialized
// extremely early, and both app.disableHardwareAcceleration() and
// app.commandLine.appendSwitch() are no-ops (or throw) once the app is
// ready. There is no way to toggle this at runtime; a change only takes
// effect on the next launch. See handleSetHardwareDecoding below for how
// the renderer is told this.
//
// localStorage isn't reachable from the main process (it's a renderer/DOM
// API), so the preference is mirrored to a small JSON file in Electron's
// userData directory whenever the renderer changes it, and read back here
// synchronously on the next launch.
function getHardwareSettingsFile() {
  try {
    return path.join(app.getPath('userData'), 'hardware-settings.json')
  } catch {
    // Fallback before app ready — use temp dir; will be re-read after ready if needed
    return path.join(__dirname, 'hardware-settings.json')
  }
}


function readHardwareSettings() {
  try {
    const file = getHardwareSettingsFile()
    const raw = fs.readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw)
    return { hardwareDecoding: parsed.hardwareDecoding !== false } // default true
  } catch {
    // First launch, or file doesn't exist/is corrupt — default to
    // hardware acceleration enabled, matching Electron's own default.
    return { hardwareDecoding: true }
  }
}


function writeHardwareSettings(settings) {
  try {
    const file = getHardwareSettingsFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(settings), 'utf-8')
  } catch (err) {
    console.warn('Failed to persist hardware acceleration setting:', err)
  }
}

const SERVER_SETTINGS_FILE = path.join(__dirname, 'stremio-server', 'server-settings.json')
function getUserServerSettingsFile() {
  try {
    return path.join(app.getPath('userData'), 'server-settings.json')
  } catch {
    return path.join(__dirname, 'server-settings.json')
  }
}

function readServerSettings() {
  try {
    const userFile = getUserServerSettingsFile()
    for (const file of [SERVER_SETTINGS_FILE, userFile]) {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf-8')
        return JSON.parse(raw)
      }
    }
  } catch {}
  return {}
}

function writeServerSettings(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('patch must be a plain object')
  }
  // Sanitize patch — block prototype pollution and only allow known server settings keys
  const ALLOWED_KEYS = new Set(['cacheSize', 'https', 'torrentProfile', 'transcodeProfile', 'serverUrl', 'appPath'])
  const sanitized = {}
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    // Allow only allowed keys; if key not in allowlist but value is primitive, still allow cautiously? For now strictly allow listed.
    // To avoid breaking future server keys, allow any key that is alphanumeric and value is string/number/boolean
    const isAllowed = ALLOWED_KEYS.has(key) || /^[a-zA-Z0-9_-]+$/.test(key)
    if (!isAllowed) {
      console.warn(`[security] Blocked disallowed server setting key: ${key}`)
      continue
    }
    if (value !== null && typeof value === 'object') {
      console.warn(`[security] Blocked non-primitive value for ${key}`)
      continue
    }
    // Basic type checks
    if (key === 'cacheSize' && typeof value !== 'number') continue
    if (key === 'https' && typeof value !== 'boolean') continue
    sanitized[key] = value
  }
  const current = readServerSettings()
  const updated = { ...current, ...sanitized }
  const userFile = getUserServerSettingsFile()
  for (const file of [SERVER_SETTINGS_FILE, userFile]) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify(updated, null, 2), 'utf-8')
      console.log(`[electron] Updated server settings at ${file}:`, sanitized)
    } catch (err) {
      console.warn(`[electron] Failed to write server settings to ${file}:`, err)
    }
  }
  return updated
}

const hardwareSettings = readHardwareSettings()


if (hardwareSettings.hardwareDecoding) {
  // Enabled (the default): nudge Chromium toward using it more
  // aggressively than its own conservative defaults, since Electron/
  // Chromium sometimes blocklists GPU-accelerated video decode on
  // certain drivers even when the hardware supports it fine.
  //   --ignore-gpu-blocklist   : don't disable GPU features just because
  //                              this GPU/driver combo isn't on Chromium's
  //                              known-good allowlist.
  //   --enable-gpu-rasterization : rasterize page content on the GPU
  //                              rather than the CPU.
  //   --enable-accelerated-video-decode : the actual flag that turns on
  //                              hardware video decode (VA-API on Linux,
  //                              D3D11/DXVA on Windows, VideoToolbox on
  //                              macOS — Chromium picks the right backend
  //                              per platform automatically).
  //   --enable-features=VaapiVideoDecoder : explicitly opts into the
  //                              VA-API decoder path on Linux, where it's
  //                              still gated behind a feature flag on some
  //                              Chromium builds.
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('enable-accelerated-video-decode')
  // Mitigate macOS TASK_SUPPRESSION_POLICY (task_policy_set invalid argument)
  // These two are safe and do not affect EGL/Metal initialization.
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  if (process.platform === 'linux') {
    app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder')
  }
} else {
  // Disabled: the one call that actually matters. This turns off GPU
  // compositing/rendering entirely (not just video decode) — Chromium
  // doesn't expose a "GPU off for video decode only, on for everything
  // else" mode, so respecting "off" fully means the whole GPU process is
  // disabled and rendering falls back to software.
  app.disableHardwareAcceleration()
}


function createWindow() {
  // App icon — generated from the glass play+plus design (public/icon.png
  // + public/icon.icns). Using the same asset for window chrome and dock
  // keeps branding consistent across platforms.
  const appIconPath = path.join(__dirname, 'public', process.platform === 'darwin' ? 'icon.icns' : 'icon.png')
  const windowIcon = fs.existsSync(appIconPath) ? appIconPath : path.join(__dirname, 'public', 'icon.png')

  // titleBarStyle only has any effect on macOS — Electron ignores it
  // entirely on Windows/Linux and falls back to the platform's normal
  // framed window with default minimize/maximize/close buttons still
  // showing. 'hiddenInset' is deliberately kept for macOS specifically
  // because it preserves the native traffic-light buttons (which macOS
  // users expect, and which are awkward to reimplement pixel-perfectly)
  // while still hiding the title bar's text/height. For every other
  // platform, frame:false produces a genuinely chromeless window so the
  // renderer's custom TitleBar (src/components/TitleBar.jsx) is the only
  // window chrome — matching what the window-minimize/maximize-toggle/
  // close IPC handlers below exist to support.
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    show: false,
    icon: windowIcon,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' }
      : { frame: false }),
    webPreferences: {
      // ── Security hardening ─────────────────────────────────
      // Enforce least-privilege renderer: no Node, no remote, isolated context, sandboxed.
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      preload: path.join(__dirname, 'preload.cjs'),
      backgroundThrottling: false,
    },
  })


  mainWindow = win

  win.once('ready-to-show', () => win.show())

  // ── Navigation & window-open hardening ────────────────────────────
  // Prevent renderer from navigating the app away from its own content (e.g. malicious <a> or window.location hijack)
  // and from opening arbitrary new BrowserWindows. All external links must go via shell.openExternal.
  const ALLOWED_ORIGINS = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ])
  // Dist file URL is allowed when packaged — pathToFileURL(prodFile).href
  const prodFileUrl = pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  const isAllowedNavigation = (url) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'file:') {
        // Only allow the bundled index.html (and its hash/query variants); deny file:// elsewhere.
        return url.startsWith(prodFileUrl) || url === prodFileUrl
      }
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        // In dev, allow localhost dev server; otherwise deny navigation — external URLs must use shell.openExternal.
        if (ALLOWED_ORIGINS.has(parsed.origin)) return true
        // Allow VITE_DEV_SERVER_URL if set
        if (process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL)) return true
        return false
      }
      return false
    } catch { return false }
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Deny creation of new windows (prevent window.open from creating an Electron window).
    // If it's an http(s) URL, open externally in OS browser instead.
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url).catch(() => {})
      }
    } catch {}
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault()
      // For http(s) attempts, offer to open externally rather than silently dropping
      try {
        const parsed = new URL(url)
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          shell.openExternal(url).catch(() => {})
        }
      } catch {}
      console.warn(`[security] Blocked will-navigate to ${url}`)
    }
  })

  // Also block redirects (e.g. meta refresh, location.replace)
  win.webContents.on('will-redirect', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault()
      console.warn(`[security] Blocked will-redirect to ${url}`)
    }
  })

  // Deny permission requests (camera, mic, geo, etc.) by default — app doesn't need them
  win.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    // Only allow minimal needed permissions; deny all by default
    const ALLOWED_PERMISSIONS = new Set([]) // none required currently
    callback(ALLOWED_PERMISSIONS.has(permission))
  })
  // Enforce same policy for permission checks (newer Electron)
  if (typeof win.webContents.session.setPermissionCheckHandler === 'function') {
    win.webContents.session.setPermissionCheckHandler((_wc, permission) => {
      const ALLOWED_PERMISSIONS = new Set([])
      return ALLOWED_PERMISSIONS.has(permission)
    })
  }

  // ── HTTP header CSP (defense-in-depth alongside <meta> in index.html) ──
  // Electron's file:// and http://localhost pages don't get server-sent CSP headers, so inject via onHeadersReceived.
  const cspValue = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https: http:",
    "media-src 'self' blob: https: http: http://127.0.0.1:11470 http://localhost:11470",
    "connect-src 'self' ws://localhost:5173 ws://127.0.0.1:5173 http://localhost:5173 http://127.0.0.1:5173 http://127.0.0.1:11470 http://localhost:11470 https://*.supabase.co https://api.strem.io https://v3-cinemeta.strem.io https://*.strem.io https://*.strem.fun https://*.githubusercontent.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.de.sentry.io https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join('; ')
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    // Only inject for the app's own pages (file:// and localhost dev server), not for addon fetches proxied via main
    try {
      const url = details.url || ''
      const isAppPage = url.startsWith('file://') || url.startsWith('http://localhost:5173') || url.startsWith('http://127.0.0.1:5173') || (process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL))
      if (isAppPage) {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [cspValue],
          },
        })
        return
      }
    } catch {}
    callback({ responseHeaders: details.responseHeaders })
  })

  // Graceful fallback for dev vs prod
  const devUrl = 'http://localhost:5173'
  const prodFile = path.join(__dirname, 'dist', 'index.html')

  // Handle GPU crashes that would otherwise leave a white screen (the EGL/Metal init failure)
  app.on('child-process-gone', (_event, details) => {
    if (details.type === 'GPU' && details.reason !== 'clean-exit') {
      console.warn(`[electron] GPU process gone: ${details.reason} (exitCode ${details.exitCode}) — window may need reload`)
    }
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[electron] did-fail-load ${validatedURL}: ${errorCode} ${errorDescription}`)
    if (validatedURL.startsWith(devUrl) && fs.existsSync(prodFile)) {
      console.log('[electron] Dev server not available, loading production build:', prodFile)
      win.loadURL(pathToFileURL(prodFile).href).catch(() => {})
    }
  })

  if (fs.existsSync(prodFile) && !process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(devUrl).catch((err) => {
      console.warn('[electron] loadURL failed:', err.message)
    })
  } else {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || devUrl).catch((err) => {
      console.warn('[electron] loadURL failed:', err.message)
    })
  }

  // Lets the renderer's custom TitleBar dim itself when the window loses
  // focus, matching native macOS title bar behavior — preload.cjs already
  // exposes onWindowFocusChanged for this; these are what actually drive it.
  win.on('focus', () => {
    win.webContents.send('window-focus-changed', true)
  })
  win.on('blur', () => {
    win.webContents.send('window-focus-changed', false)
  })


  // Pushes maximize/unmaximize state so the TitleBar's icon stays correct
  // even when the window is maximized by means other than clicking the
  // custom button itself — e.g. dragging to a screen edge (Windows'
  // native snap gesture) or double-clicking the title bar's drag region.
  win.on('maximize', () => {
    win.webContents.send('window-maximized-changed', true)
  })
  win.on('unmaximize', () => {
    win.webContents.send('window-maximized-changed', false)
  })
}


// Performs HTTP requests to Stremio addon servers from the main process
// rather than the renderer. Main-process requests aren't subject to the
// renderer's CORS policy, so addons that don't send CORS headers (which is
// most of them) still work here, exactly like the official Stremio
// desktop app.
// Handles manifests served as text/plain (e.g. raw.githubusercontent.com) which are still valid JSON —
// tries to parse text as JSON regardless of Content-Type so renderer always gets json when applicable.
ipcMain.handle('fetch-addon', async (event, url, options = {}) => {
  // ── Input validation ──────────────────────────────────────────
  // Only http/https URLs are allowed — block file:, data:, javascript:, etc.
  // and reject non-string / excessively long URLs to prevent SSRF or main-process abuse.
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
    return { ok: false, status: 0, error: 'Invalid URL' }
  }
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, status: 0, error: 'Invalid URL format' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, status: 0, error: 'Only http(s) URLs are allowed' }
  }
  // Strip any incoming options that could abuse fetch (signal already stripped in preload, but also block dispatcher injection)
  const { signal: _sig, dispatcher: _disp, ...safeOptions } = options || {}
  void _sig; void _disp
  // Allow self-signed certs for private LAN https (https://192.168.x.x) — Stremio's
  // local server often serves https with a self-signed cert; Node's fetch would
  // otherwise reject it with "self-signed certificate" and report "not available".
  const isPrivateHttps = /^https:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(url) || /^https:\/\/192-168-/.test(url)
  const fetchOptions = { ...safeOptions }
  if (isPrivateHttps) {
    // undici Agent that disables cert verification for this request only
    try {
      const { Agent: UndiciAgent } = await import('undici')
      fetchOptions.dispatcher = new UndiciAgent({ connect: { rejectUnauthorized: false } })
    } catch {
      // undici not available — fall back to env flag for this process
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    }
  }
  try {
    const response = await fetch(url, fetchOptions)
    const text = await response.text()
    let json = null
    let isJson = false
    try {
      const parsed = JSON.parse(text)
      if (parsed !== null && typeof parsed === 'object') {
        json = parsed
        isJson = true
      }
    } catch {
      // not JSON, treat as plain text
    }
    if (isJson) {
      return { ok: response.ok, status: response.status, json, text }
    }
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json') && json) {
      return { ok: response.ok, status: response.status, json, text }
    }
    return { ok: response.ok, status: response.status, text }
  } catch (err) {
    // For private https, retry once over plain http as last resort before reporting failure
    if (isPrivateHttps && url.startsWith('https://')) {
      const httpUrl = url.replace(/^https:\/\//, 'http://')
      try {
        const retry = await fetch(httpUrl, safeOptions)
        const text = await retry.text()
        let json = null
        let isJson = false
        try {
          const parsed = JSON.parse(text)
          if (parsed !== null && typeof parsed === 'object') { json = parsed; isJson = true }
        } catch {}
        if (isJson) return { ok: retry.ok, status: retry.status, json, text }
        return { ok: retry.ok, status: retry.status, text }
      } catch {}
    }
    return { ok: false, status: 0, error: err.message }
  }
})


// ─── Hardware-accelerated decoding IPC ─────────────────────────────────────
//
// Saves the renderer's toggle change to disk immediately, but does NOT
// (can't) apply it to the running session — the GPU process is already
// initialized. Returns { restartRequired } so the Settings UI can show an
// accurate "restart to apply" prompt only when the new value actually
// differs from what this session launched with, rather than nagging the
// user every single time they open Settings.
ipcMain.handle('set-hardware-decoding', (event, enabled) => {
  if (typeof enabled !== 'boolean') {
    return { ok: false, error: 'enabled must be boolean' }
  }
  writeHardwareSettings({ hardwareDecoding: enabled })
  const restartRequired = enabled !== hardwareSettings.hardwareDecoding
  return { ok: true, restartRequired }
})


// Lets the renderer confirm what this *currently running* session actually
// launched with — the source of truth for "is hardware acceleration on
// right now," as opposed to "what's saved for next launch."
ipcMain.handle('get-hardware-decoding-status', () => {
  // app.getGPUFeatureStatus() returns per-feature strings like
  // "enabled" / "disabled_software" / "unavailable_software" — checking
  // video_decode specifically is more honest than a single on/off flag,
  // since a driver can support GPU rendering but still fall back to
  // software decode for video specifically.
  let gpuFeatureStatus
  try {
    gpuFeatureStatus = app.getGPUFeatureStatus()
  } catch {
    gpuFeatureStatus = {}
  }


  return {
    hardwareDecodingPreference: hardwareSettings.hardwareDecoding,
    gpuFeatureStatus,
  }
})

ipcMain.handle('update-server-settings', (event, patch) => {
  try {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return { ok: false, error: 'patch must be a plain object' }
    }
    // Block prototype pollution keys before spreading
    if ('__proto__' in patch || 'constructor' in patch || 'prototype' in patch) {
      return { ok: false, error: 'Invalid patch keys' }
    }
    const updated = writeServerSettings(patch)
    return { ok: true, settings: updated }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('get-server-settings', () => {
  try {
    return { ok: true, settings: readServerSettings() }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})


// Cleanly restarts the app so a changed hardware-acceleration setting can
// take effect — app.relaunch() queues a new launch, app.exit() ends the
// current process immediately after (using exit rather than quit skips
// before-quit handlers/dialogs, which is correct here since the user has
// already confirmed via the Settings UI restart prompt).
ipcMain.handle('relaunch-app', () => {
  app.relaunch()
  app.exit(0)
})


// ─── Bundled Stremio streaming server (server.js) ─────────────────────────
// This app bundles Stremio's official server.js (open-source from
// https://github.com/Stremio/stremio-server, self-contained Node bundle at
// s3-eu-west-1.amazonaws.com/stremio-artifacts/four/*/server.js). Instead
// of requiring the user to have the desktop app installed or to type a
// remote URL, we spawn the bundled server on every launch automatically
// at 127.0.0.1:11470 — closest to native behavior, no user action.
//
// The bundle expects a CommonJS environment with global.window; we ship
// a tiny launcher.cjs that polyfills `global.window` before requiring
// server.js, and a stremio-server/package.json with {"type":"commonjs"}
// so Node treats server.js as CJS despite the parent package.json being
// {"type":"module"}.
function getBundledServerPaths() {
  // In packaged builds resources may be under process.resourcesPath/app.asar or extraResources
  const candidates = [
    path.join(__dirname, 'stremio-server'),
    path.join(process.resourcesPath || '', 'app.asar', 'stremio-server'),
    path.join(process.resourcesPath || '', 'stremio-server'),
    path.join(app.getAppPath(), 'stremio-server'),
  ]
  for (const base of candidates) {
    const serverJs = path.join(base, 'server.js')
    if (fs.existsSync(serverJs)) {
      return {
        dir: base,
        serverJs,
        launcher: path.join(base, 'launcher.cjs'),
        pkg: path.join(base, 'package.json'),
      }
    }
  }
  const base = path.join(__dirname, 'stremio-server')
  return {
    dir: base,
    serverJs: path.join(base, 'server.js'),
    launcher: path.join(base, 'launcher.cjs'),
    pkg: path.join(base, 'package.json'),
  }
}

function spawnBundledServer() {
  const { serverJs, launcher } = getBundledServerPaths()
  if (!fs.existsSync(serverJs)) {
    console.warn('[electron] Bundled server.js not found at', serverJs)
    return null
  }
  // Prefer launcher.cjs (polyfills window) if present, else server.js directly
  const entry = fs.existsSync(launcher) ? launcher : serverJs
  console.log('[electron] Auto-starting bundled Stremio server from:', entry)
  try {
    const child = fork(entry, [], {
      env: {
        ...process.env,
        NO_CORS: '1',
        APP_PATH: app.getPath('userData'),
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      silent: true,
    })
    child.stdout?.on('data', (d) => console.log(`[streaming-server stdout] ${String(d).trim()}`))
    child.stderr?.on('data', (d) => console.error(`[streaming-server stderr] ${String(d).trim()}`))
    child.on('error', (err) => console.error('[streaming-server] Bundled process error:', err))
    child.on('exit', (code, sig) => {
      console.log(`[streaming-server] Bundled process exit code=${code} sig=${sig}`)
      if (streamingServerProcess === child) streamingServerProcess = null
    })
    child.on('close', (code) => {
      console.log(`[streaming-server] Bundled process closed with code ${code}`)
      if (streamingServerProcess === child) streamingServerProcess = null
    })
    return child
  } catch (err) {
    console.error('[electron] Failed to spawn bundled server:', err)
    return null
  }
}

// ─── External Stremio Service fallback (conventional installs) ───────────
// Kept as fallback if bundled server is missing or fails to start.
function getCandidateServerPaths() {
  const home = app.getPath('home')
  if (process.platform === 'darwin') {
    return [
      '/Applications/Stremio.app/Contents/MacOS/Stremio Service',
      '/Applications/StremioService.app/Contents/MacOS/StremioService',
      path.join(home, 'Applications/Stremio.app/Contents/MacOS/Stremio Service'),
    ]
  }
  if (process.platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const localAppData = process.env['LOCALAPPDATA'] || path.join(home, 'AppData', 'Local')
    return [
      path.join(programFiles, 'StremioService', 'StremioService.exe'),
      path.join(programFilesX86, 'StremioService', 'StremioService.exe'),
      path.join(localAppData, 'Programs', 'StremioService', 'StremioService.exe'),
    ]
  }
  return [
    '/opt/stremio/streaming-server',
    '/usr/lib/stremio/streaming-server',
    path.join(home, '.local/share/stremio/streaming-server'),
  ]
}

function spawnExternalServer(foundPath) {
  console.log('[electron] Auto-starting external streaming server from:', foundPath)
  const child = spawn(foundPath, ['--port', '11470'], { detached: false, stdio: 'pipe' })
  child.stdout?.on('data', (d) => console.log(`[streaming-server stdout] ${String(d).trim()}`))
  child.stderr?.on('data', (d) => console.error(`[streaming-server stderr] ${String(d).trim()}`))
  child.on('error', (err) => console.error('[streaming-server] Process error:', err))
  child.on('close', (code) => {
    console.log(`[streaming-server] Process closed with code ${code}`)
    if (streamingServerProcess === child) streamingServerProcess = null
  })
  return child
}

function autoStartStreamingServer() {
  if (streamingServerProcess) return
  // 1) Prefer bundled server.js — always available, no user install needed
  const bundled = spawnBundledServer()
  if (bundled) {
    streamingServerProcess = bundled
    return
  }
  // 2) Fallback: try conventional external Stremio Service installs
  const candidates = getCandidateServerPaths()
  const foundPath = candidates.find((p) => { try { return fs.existsSync(p) } catch { return false } })
  if (!foundPath) {
    console.info('[electron] Streaming server auto-start skipped — bundled server missing and no external service at conventional paths. Streams will use remote URL if configured, else fail.')
    return
  }
  try {
    streamingServerProcess = spawnExternalServer(foundPath)
  } catch (err) {
    console.error('[electron] Failed to auto-start external streaming server:', err)
  }
}


function cleanUpStreamingServer() {
  if (streamingServerProcess) {
    console.log('[electron] Terminating local streaming server...')
    try {
      streamingServerProcess.kill()
    } catch (err) {
      console.error('[electron] Failed to kill streaming server:', err)
    }
    streamingServerProcess = null
  }
}


// Attempts to launch the streaming server — tries bundled server.js first (always available),
// then falls back to conventional external installs. Returns { ok, launched, path?, reason? }.
ipcMain.handle('launch-streaming-server', async () => {
  if (streamingServerProcess) {
    return { ok: true, launched: false, reason: 'already-running' }
  }

  // 1) Bundled server.js (preferred — no user install needed)
  const bundled = spawnBundledServer()
  if (bundled) {
    streamingServerProcess = bundled
    const { serverJs } = getBundledServerPaths()
    return { ok: true, launched: true, path: serverJs, bundled: true }
  }

  // 2) External service fallback
  const candidates = getCandidateServerPaths()
  const foundPath = candidates.find((candidatePath) => {
    try {
      return fs.existsSync(candidatePath)
    } catch {
      return false
    }
  })

  if (!foundPath) {
    return {
      ok: false,
      launched: false,
      reason: 'not-found',
      checkedPaths: candidates,
    }
  }

  try {
    streamingServerProcess = spawnExternalServer(foundPath)
    return { ok: true, launched: true, path: foundPath }
  } catch (err) {
    return {
      ok: false,
      launched: false,
      reason: 'spawn-failed',
      path: foundPath,
      error: err.message,
    }
  }
})


// ─── Open external URL in the OS default browser ───────────────────────
//
// Used for things like an add-on's /configure page (per the Stremio
// protocol convention: {addonBaseUrl}/configure) — that page is
// third-party, untrusted HTML served by whatever server the user
// installed an add-on from. Opening it in the OS default browser via
// shell.openExternal keeps it fully outside this app's Electron process
// and renderer, rather than loading arbitrary external content into a
// BrowserWindow this app controls (which a plain window.open() from the
// renderer could otherwise end up doing, depending on window-open
// handling).
ipcMain.handle('open-external-url', async (event, url) => {
  try {
    if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
      return { ok: false, error: 'Invalid URL' }
    }
    const parsed = new URL(url)
    // Only http/https — refuse file:, javascript:, or other schemes a
    // malicious or malformed manifest URL could otherwise smuggle in.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'Refused to open a non-http(s) URL.' }
    }
    await shell.openExternal(url)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})


// ─── Auto-updater (electron-updater) ─────────────────────────────────────
// Exposes minimal IPC so the React UI can show update status / trigger restart.
// Updates are checked automatically in packaged builds; in dev (unpackaged) this is a no-op.
function sendUpdaterStatus(payload) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', payload)
    }
  } catch {}
}

function setupAutoUpdater() {
  if (!autoUpdater) {
    console.log('[updater] autoUpdater not available — skipping setup')
    return
  }
  if (!app.isPackaged) {
    console.log('[updater] Skipping check in dev (app not packaged)')
    return
  }
  // Attach listeners once
  if (setupAutoUpdater._attached) return
  setupAutoUpdater._attached = true

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for update…')
    sendUpdaterStatus({ type: 'checking-for-update' })
  })
  autoUpdater.on('update-available', (info) => {
    console.log('[updater] Update available:', info?.version)
    sendUpdaterStatus({ type: 'update-available', version: info?.version, info })
    if (SentryMain) {
      try { SentryMain.captureMessage(`Update available: ${info?.version}`, 'info') } catch {}
    }
  })
  autoUpdater.on('update-not-available', (info) => {
    console.log('[updater] Update not available (current', info?.version, ')')
    sendUpdaterStatus({ type: 'update-not-available', version: info?.version })
  })
  autoUpdater.on('error', (err) => {
    console.warn('[updater] Error:', err?.message || err)
    sendUpdaterStatus({ type: 'error', error: err?.message || String(err) })
    if (SentryMain) {
      try { SentryMain.captureException(err) } catch {}
    }
  })
  autoUpdater.on('download-progress', (progress) => {
    // progress: { bytesPerSecond, percent, transferred, total }
    sendUpdaterStatus({ type: 'download-progress', progress })
  })
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] Update downloaded:', info?.version)
    sendUpdaterStatus({ type: 'update-downloaded', version: info?.version, info })
    // Don't auto-quit; let user trigger via UI or autoInstallOnAppQuit handles quit
  })

  // Kick off initial check after window is ready (short delay so window shows first)
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn('[updater] checkForUpdatesAndNotify failed:', err?.message || err)
    })
  }, 3000)

  // Periodic check every 6 hours in packaged builds
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }, 6 * 60 * 60 * 1000)
}

// IPC for renderer to control updater (all validated, no raw autoUpdater exposed)
ipcMain.handle('updater:check-for-updates', async () => {
  if (!autoUpdater) return { ok: false, error: 'Updater not available' }
  if (!app.isPackaged) return { ok: false, error: 'Updates only in packaged builds' }
  try {
    const result = await autoUpdater.checkForUpdates()
    return { ok: true, updateInfo: result?.updateInfo || null }
  } catch (err) {
    if (SentryMain) try { SentryMain.captureException(err) } catch {}
    return { ok: false, error: err?.message || String(err) }
  }
})
ipcMain.handle('updater:quit-and-install', () => {
  if (!autoUpdater) return { ok: false, error: 'Updater not available' }
  try {
    autoUpdater.quitAndInstall()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})
ipcMain.handle('updater:get-status', () => {
  return {
    ok: true,
    isPackaged: app.isPackaged,
    version: app.getVersion(),
    hasUpdater: !!autoUpdater,
  }
})

// ── Global webContents hardening ─────────────────────────────────────
// Apply to any webContents created after this point (including potential
// webviews or secondary windows if ever created). Ensures no renderer can
// slip past the per-window handlers above.
app.on('web-contents-created', (_event, contents) => {
  // Block creation of new windows/webviews from any renderer
  contents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url).catch(() => {})
      }
    } catch {}
    return { action: 'deny' }
  })
  contents.on('will-attach-webview', (event) => {
    event.preventDefault()
    console.warn('[security] Blocked will-attach-webview')
  })
  // will-navigate is per-webContents; also guard globally
  contents.on('will-navigate', (event, url) => {
    // Allow only file: (app bundle) and localhost dev server; block external nav
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'file:') {
        // Only allow navigation to file URLs inside the app bundle
        const allowedFile = pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
        if (!url.startsWith(allowedFile)) {
          // Allow any file:// inside dist? Be strict: deny if not the index itself
          // But to avoid breaking reloads, allow any file under dist
          const distDir = path.join(__dirname, 'dist') + path.sep
          // Check if file path is inside dist by decoding URL pathname
          const filePath = parsed.pathname ? decodeURIComponent(parsed.pathname) : ''
          if (!filePath.startsWith(distDir) && !filePath.includes('/dist/')) {
            // For packaged asar case, also allow app.asar paths
            if (!url.includes('app.asar')) {
              event.preventDefault()
              console.warn(`[security] Blocked global will-navigate to ${url}`)
            }
          }
        }
      } else if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        const allowed = ['http://localhost:5173', 'http://127.0.0.1:5173'].some((o) => url.startsWith(o))
          || (process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL))
        if (!allowed) {
          event.preventDefault()
          shell.openExternal(url).catch(() => {})
          console.warn(`[security] Blocked global will-navigate to ${url}`)
        }
      } else {
        event.preventDefault()
        console.warn(`[security] Blocked global will-navigate to non-http(s)/file URL: ${url}`)
      }
    } catch {
      event.preventDefault()
    }
  })
})

app.whenReady().then(() => {
  // Set dock icon on macOS from the same glass icon asset
  if (process.platform === 'darwin' && app.dock) {
    try {
      const dockIcon = path.join(__dirname, 'public', 'icon.png')
      if (fs.existsSync(dockIcon)) app.dock.setIcon(dockIcon)
    } catch {}
  }
  autoStartStreamingServer()
  createWindow()
  // Start auto-updater after window is ready (no-op in dev)
  try { setupAutoUpdater() } catch (err) { console.warn('[updater] setup failed:', err?.message) }
  if (SentryMain) {
    try { SentryMain.captureMessage('App ready', 'info') } catch {}
  }
})

// Capture unhandled main-process errors in Sentry
process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException', err)
  if (SentryMain) try { SentryMain.captureException(err) } catch {}
})
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection', reason)
  if (SentryMain) try { SentryMain.captureException(reason) } catch {}
})


// ─── Custom title bar window controls ──────────────────────────────────
//
// With frame:false there is no native close/minimize/maximize chrome to
// click — the renderer's custom title bar (src/components/TitleBar.jsx)
// renders its own buttons and calls these over IPC instead.
// Sender validation: only allow the mainWindow's webContents to trigger these.
function isSenderMainWindow(event) {
  try {
    return event.sender === mainWindow?.webContents
  } catch { return false }
}
ipcMain.on('window-minimize', (event) => {
  if (!isSenderMainWindow(event)) return
  mainWindow?.minimize()
})


ipcMain.on('window-maximize-toggle', (event) => {
  if (!isSenderMainWindow(event)) return
  if (!mainWindow) return
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
})


ipcMain.on('window-close', (event) => {
  if (!isSenderMainWindow(event)) return
  mainWindow?.close()
})


ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false
})


app.on('before-quit', () => {
  cleanUpStreamingServer()
})


app.on('window-all-closed', () => {
  cleanUpStreamingServer()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})