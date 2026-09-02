// Routes HTTP requests through Electron's main process when available
// (via the preload bridge), which isn't subject to the renderer's CORS
// policy — this is how the official Stremio desktop app avoids CORS
// issues with addon servers that don't send CORS headers. Falls back to
// plain fetch() when running outside Electron (e.g. viewing the Vite dev
// server directly in a regular browser tab), where addon requests may
// still fail due to CORS — that's an inherent browser-only limitation,
// not something fixable from app code in that context.

export async function addonFetch(url, options = {}) {
  if (window.electronAPI && window.electronAPI.fetchAddon) {
    // AbortSignal objects can't be serialized across Electron's IPC
    // boundary (structured clone doesn't support them), so we strip it
    // before sending options to the main process. The timeout still works
    // via the outer Promise.race in fetchWithTimeout-style callers — the
    // renderer-side abort just won't cancel the main-process request
    // itself, which is fine since these are short-lived local requests.
    const { signal: _signal, ...serializableOptions } = options
    void _signal
    const result = await window.electronAPI.fetchAddon(url, serializableOptions)
    if (!result.ok && result.status === 0) {
      // status 0 means the request itself failed (network error), not a
      // valid HTTP error response — surface it the same way a fetch()
      // network failure would.
      throw new Error(result.error || 'Network request failed')
    }
    return {
      ok: result.ok,
      status: result.status,
      json: async () => {
        if (result.json !== undefined && result.json !== null) return result.json
        // Fallback: raw.githubusercontent.com serves JSON as text/plain — try to parse text
        if (result.text) {
          try { return JSON.parse(result.text) } catch { return null }
        }
        return null
      },
      text: async () => result.text ?? (result.json ? JSON.stringify(result.json) : ''),
    }
  }

  // Not running inside Electron (or preload didn't load) — fall back to a
  // normal browser fetch, which may hit CORS restrictions for addons that
  // don't send permissive headers.
  return fetch(url, options)
}
