// Tracks the local Stremio streaming server's reachability
// (127.0.0.1:11470) for the navbar status indicator, and offers an
// on-demand check for use right before playback (DetailModal's
// "Find Streams" / stream-resolve flow already implicitly discovers this
// via resolveTorrentStream, but the pre-flight check here lets the UI
// warn *before* the user picks a stream, rather than after).
//
// status: 'checking' | 'online' | 'offline' | 'restarting'


import { useEffect, useRef, useState, useCallback } from 'react'
import { isStreamingServerAvailable } from '../utils/streamingServer'


const POLL_INTERVAL_MS = 10000


// Best-effort launch of the official Stremio server via Electron IPC, if
// available. No-ops outside Electron (window.electronAPI absent) — there's
// nothing this can do in a plain browser context, so callers should treat
// a missing bridge the same as "restart not possible here."
async function attemptServerLaunch() {
  if (!window.electronAPI?.launchStreamingServer) {
    return { ok: false, launched: false, reason: 'no-electron-bridge' }
  }
  try {
    return await window.electronAPI.launchStreamingServer()
  } catch (err) {
    return { ok: false, launched: false, reason: 'ipc-error', error: err.message }
  }
}


export function useStreamingServerHealth() {
  const [status, setStatus] = useState('checking')
  const [lastCheckedAt, setLastCheckedAt] = useState(null)
  const [launchInfo, setLaunchInfo] = useState(null) // last attemptServerLaunch() result, for diagnostics/UI messaging
  const pollIntervalRef = useRef(null)
  // Guards against overlapping checks — e.g. a manual pre-playback check
  // firing while the background poll is already mid-flight.
  const checkInFlightRef = useRef(false)


  const checkNow = useCallback(async () => {
    if (checkInFlightRef.current) return status
    checkInFlightRef.current = true
    try {
      const available = await isStreamingServerAvailable()
      setStatus(available ? 'online' : 'offline')
      setLastCheckedAt(Date.now())
      return available ? 'online' : 'offline'
    } finally {
      checkInFlightRef.current = false
    }
  }, [status])


  // Attempts to bring the server back: launch (if possible) → short
  // settle delay → re-check. Used both by the navbar's manual retry and
  // could be wired to auto-fire on first offline detection if desired
  // (kept manual/explicit here rather than automatic-on-every-offline, so
  // it doesn't repeatedly try to spawn a process the user may have
  // deliberately closed).
  const restartAndRecheck = useCallback(async () => {
    setStatus('restarting')
    const result = await attemptServerLaunch()
    setLaunchInfo(result)


    if (!result.launched) {
      // Nothing we could do (not found, no bridge, spawn failed) — fall
      // back to a plain re-check in case the user started it manually in
      // the same moment, then report whatever that finds.
      const finalStatus = await checkNow()
      return { ...result, finalStatus }
    }


    // Give the process a moment to boot and bind the port before
    // checking — spawning it doesn't mean it's immediately ready.
    await new Promise((resolve) => setTimeout(resolve, 2500))
    const finalStatus = await checkNow()
    return { ...result, finalStatus }
  }, [checkNow])


  // Background polling.
  useEffect(() => {
    checkNow()
    pollIntervalRef.current = setInterval(checkNow, POLL_INTERVAL_MS)
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-check immediately when Remote Streaming URL changes (Settings → Streaming)
  useEffect(() => {
    function handleUrlChanged() {
      checkNow()
    }
    window.addEventListener('stremio:streaming-server-url-changed', handleUrlChanged)
    window.addEventListener('storage', (e) => {
      if (e.key === 'stremio_streaming_server_settings' || e.key === 'stremio_user_settings') handleUrlChanged()
    })
    return () => {
      window.removeEventListener('stremio:streaming-server-url-changed', handleUrlChanged)
      window.removeEventListener('storage', handleUrlChanged)
    }
  }, [checkNow])


  return {
    status, // 'checking' | 'online' | 'offline' | 'restarting'
    lastCheckedAt,
    launchInfo,
    checkNow, // on-demand check, e.g. right before playback
    restartAndRecheck, // launch attempt + settle + re-check
  }
}