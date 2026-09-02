import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { X, Play, Pause, Volume2, VolumeX, Volume1, AudioLines, Gauge, Maximize2, Activity, Captions, Cast, Search, PictureInPicture2, Minus, Plus, Loader2, Radio, Headphones } from 'lucide-react'
import Hls from 'hls.js'
import { saveProgress, markAsWatched } from '../utils/watchProgress'
import { logViewingActivity } from '../utils/viewingLog'
import { searchSubtitles, downloadSubtitleContent } from '../utils/openSubtitles'
import { parseSRT } from '../utils/srtParser'
import SubtitleOverlay from './SubtitleOverlay'
import { useMediaRecovery } from '../hooks/useMediaRecovery'
import { getSubtitlePreferences, saveSubtitlePreferences } from '../utils/subtitlePreferences'
import { resolveTorrentStream, waitForBuffering, getAdaptiveMinBufferPercent, extractStreamStats } from '../utils/streamingServer'
import { useProfileContext } from '../context/ProfileContext'

const SPEED_CYCLE = [1, 1.5, 2, 2.5, 3]

const SCALE_OPTIONS = [
  { value: 'contain', label: 'Fit' },
  { value: 'cover', label: 'Fill' },
  { value: 'fill', label: 'Stretch' },
]

function isTimeBuffered(video, time) {
  if (!video || !video.buffered || video.buffered.length === 0) return false
  for (let i = 0; i < video.buffered.length; i++) {
    if (time >= video.buffered.start(i) && time <= video.buffered.end(i)) return true
  }
  return false
}

// Robust HLS detection: handles .m3u8, /hls/ paths, ?hls query, proxied URLs (MediaFlow ?url=...m3u8), and Stremio behaviorHints alias.
// Previously: src.includes('.m3u8') || src.includes('m3u8') || src.includes('/hls') — missed proxied encoded URLs and behaviorHints-only live.
function isHlsUrl(url, behaviorHints) {
  if (behaviorHints?.isLive) return true
  if (behaviorHints?.notWebReady === false && behaviorHints?.proxyHeaders) return false // not relevant
  // Check decoded URL as well (for ?url=ENCODED_m3u8 proxied)
  let decoded = url || ''
  try { decoded = decodeURIComponent(url || '') } catch {}
  const hay = `${url} ${decoded}`.toLowerCase()
  if (hay.includes('.m3u8')) return true
  if (hay.includes('m3u8')) return true
  if (hay.includes('/hls')) return true
  if (hay.includes('hls.m3u8')) return true
  // Stremio server often serves hls under /<infoHash>/hls — covered above, but also check mime hint if present
  if (behaviorHints?.mimeType && String(behaviorHints.mimeType).includes('mpegurl')) return true
  if (behaviorHints?.mimeType && String(behaviorHints.mimeType).includes('x-mpegurl')) return true
  return false
}

function PlayerView({ movie, onClose, onMinimize, onStreamFailBack }) {
  const { activeProfileId } = useProfileContext()
  const videoRef = useRef(null)
  const thumbVideoRef = useRef(null)
  const thumbCanvasRef = useRef(null)
  const pipFallbackVideoRef = useRef(null)
  const hideTimeoutRef = useRef(null)
  const popupRef = useRef(null)
  const controlsRef = useRef(null)
  const hlsRef = useRef(null)
  const torrentAbortRef = useRef(null)
  const hlsFallbackTriedRef = useRef(false)
  const zapGenRef = useRef(0)
  const simStatsRef = useRef({ peers: 14, downloadKbps: 3200, uploadKbps: 180 })

  const audioContextRef = useRef(null)
  const compressorRef = useRef(null)
  const sourceNodeRef = useRef(null)

  const [isPlaying, setIsPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [videoScale, setVideoScale] = useState('contain')
  const [activePopup, setActivePopup] = useState(null)
  const [popupAnchor, setPopupAnchor] = useState(null) // { left, bottom }
  const [bufferedPercent, setBufferedPercent] = useState(0)
  // torrent/HLS resolving state
  const [resolvedUrl, setResolvedUrl] = useState(null)
  const [isResolving, setIsResolving] = useState(false)
  const [resolveError, setResolveError] = useState('')
  const [bufferStats, setBufferStats] = useState(null)

  const [hoverPercent, setHoverPercent] = useState(null)
  const [thumbnailSrc, setThumbnailSrc] = useState(null)

  const [isNormalized, setIsNormalized] = useState(false)
  const [isPiPActive, setIsPiPActive] = useState(false)
  const [isCasting, setIsCasting] = useState(false)
  const activePopupRef = useRef(null)
  const [subtitleResults, setSubtitleResults] = useState([])
  const [isSearchingSubs, setIsSearchingSubs] = useState(false)
  const [subtitleError, setSubtitleError] = useState('')
  const [activeSubtitle, setActiveSubtitle] = useState(null) // { fileName, cues }
  const [isLoadingSubFile, setIsLoadingSubFile] = useState(false)
  const [subtitleOffsetMs, setSubtitleOffsetMs] = useState(0)
  const [subtitlePreferences, setSubtitlePreferences] = useState(() => getSubtitlePreferences())
  const [castAvailable, setCastAvailable] = useState(null) // null=checking, true/false
  const [isAirPlayAvailable, setIsAirPlayAvailable] = useState(false)
  const [castError, setCastError] = useState('')
  const [selectedAudioTrack, setSelectedAudioTrack] = useState(null)
  const [audioTracks, setAudioTracks] = useState([])

  const effectiveUrl = resolvedUrl || movie?.videoUrl || null

  // Central isLive flag for playback semantics (watch-progress, seek, LIVE badge)
  const isLivePlayback = useMemo(() => {
    const pending = movie?.pendingStream
    const hints = pending?.behaviorHints || movie?.behaviorHints || null
    if (hints?.isLive) return true
    if (['tv','channel','live'].includes(String(movie?.type || '').toLowerCase())) return true
    if (movie?.isLive) return true
    if (pending?.isLive) return true
    const q = String(pending?.quality || movie?.quality || '').toLowerCase()
    if (q.includes('live') || q.includes('iptv') || q.includes('tv')) return true
    // HLS live that is explicitly marked via behaviorHints + HLS url
    const url = effectiveUrl || pending?.url || ''
    if (isHlsUrl(url, hints) && (hints?.isLive || ['tv','channel','live'].includes(String(movie?.type || '').toLowerCase()))) return true
    return false
  }, [movie, effectiveUrl])

  // Preview capability computed once per stream — drives hover preview branching (Stremio-style)
  const previewCapability = useMemo(() => {
    if (isLivePlayback) return 'live'
    const pending = movie?.pendingStream
    if (pending?.infoHash) return 'torrent'
    const url = effectiveUrl || pending?.url || ''
    if (typeof url === 'string' && url.startsWith('file://')) return 'local'
    if (pending?.url || (typeof url === 'string' && url.startsWith('http'))) return 'direct'
    return 'direct'
  }, [isLivePlayback, movie, effectiveUrl])

  const hoverDebounceRef = useRef(null)
  const seekTimeoutRef = useRef(null)
  const lastSeekIdRef = useRef(0)
  useMediaRecovery(videoRef, effectiveUrl)

  // Prevent Chromium viewport scrollbars from shifting fixed layout
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  // Resolve pending torrent streams and handle HLS — fast zap safe via generation token
  useEffect(() => {
    if (!movie) return
    const zapGen = ++zapGenRef.current
    // Reset resolving state on movie change (zap)
    setResolvedUrl(null)
    setResolveError('')
    setBufferStats(null)
    setIsResolving(false)
    hlsFallbackTriedRef.current = false
    // Immediate abort + destroy previous pipeline so zap feels instant (<300ms) — don't wait for async cleanup
    if (torrentAbortRef.current) {
      torrentAbortRef.current.abort()
      torrentAbortRef.current = null
    }
    if (hlsRef.current) {
      try { hlsRef.current.destroy() } catch {}
      hlsRef.current = null
    }
    // Also hard-reset video element to clear any in-flight fetch/decoding (prevents ghost frame from previous channel)
    const v = videoRef.current
    if (v) {
      try { v.pause(); v.removeAttribute('src'); v.load() } catch {}
    }

    // Trailer: youtube embed handled elsewhere (App passes isTrailer)
    if (movie.isTrailer) return

    // Direct URL already provided — no resolve needed, but may still be HLS
    if (movie.videoUrl) {
      setResolvedUrl(movie.videoUrl)
      return
    }

    // Direct http streams (RealDebrid/cached) play instantly without server — handle like Stremio
    const pending = movie.pendingStream
    if (pending && pending.url) {
      setResolvedUrl(pending.url)
      return
    }

    // Torrent via streaming server (needs local/remote daemon) — zap token guards stale resolve
    if (pending && pending.infoHash) {
      const abort = new AbortController()
      torrentAbortRef.current = abort
      setIsResolving(true)
      const quality = pending.quality || ''
      const minBuffer = getAdaptiveMinBufferPercent(quality)
      ;(async () => {
        const result = await resolveTorrentStream(pending.infoHash, pending.fileIdx ?? 0, { signal: abort.signal })
        if (abort.signal.aborted || zapGen !== zapGenRef.current) return
        if (!result.ok) {
          if (result.cancelled) {
            setIsResolving(false)
            return
          }
          setResolveError(result.error + (result.detail ? ` ${result.detail}` : ''))
          setIsResolving(false)
          return
        }
        const wait = await waitForBuffering(pending.infoHash, (stats) => {
          if (zapGen !== zapGenRef.current || abort.signal.aborted) return
          const extracted = extractStreamStats(stats)
          setBufferStats(extracted)
        }, { signal: abort.signal, minBufferPercent: minBuffer, base: result.base })
        if (abort.signal.aborted || wait.cancelled || zapGen !== zapGenRef.current) return
        setResolvedUrl(result.streamUrl)
        setIsResolving(false)
        setBufferStats(null)
      })()
      return () => abort.abort()
    }

    // No playable source at all
    if (!movie.videoUrl && !pending) {
      setResolveError('No playable stream available for this title.')
    }
  }, [movie])

  // Attach HLS or direct src to video element — robust HLS detection + live low-latency tuning
  useEffect(() => {
    const video = videoRef.current
    if (!video || !effectiveUrl) return
    const gen = zapGenRef.current
    // Clean previous hls (zap path already did, but double-guard for direct effectiveUrl switches)
    if (hlsRef.current) {
      try { hlsRef.current.destroy() } catch {}
      hlsRef.current = null
    }
    const hints = movie?.pendingStream?.behaviorHints || movie?.behaviorHints || null
    const isHls = isHlsUrl(effectiveUrl, hints)
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: isLivePlayback,
        // Live edge tuning: keep live latency ~3s like Stremio, DVR 30s
        ...(isLivePlayback ? { liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 6, maxLiveSyncPlaybackRate: 1.2, backBufferLength: 30 } : { backBufferLength: 90 }),
      })
      hlsRef.current = hls
      // If zap happened mid-setup, destroy immediately
      if (gen !== zapGenRef.current) { try { hls.destroy() } catch {}; hlsRef.current = null; return }
      hls.loadSource(effectiveUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (gen !== zapGenRef.current) return
        video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (gen !== zapGenRef.current) return
        if (data.fatal) {
          console.warn('HLS fatal error', data)
          // For live, attempt soft recovery once (network glitch common on IPTV) before surfacing error
          if (isLivePlayback && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            try { hls.startLoad() } catch {}
            return
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try { hls.recoverMediaError() } catch {}
            return
          }
          setResolveError('Stream failed to load. Try another source or check streaming server.')
        }
      })
      return () => {
        if (hlsRef.current === hls) {
          try { hls.destroy() } catch {}
          hlsRef.current = null
        }
      }
    } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = effectiveUrl
      if (gen === zapGenRef.current) video.play().catch(() => {})
    } else {
      video.src = effectiveUrl
      // Ensure audio is audible: unmute, volume 1, no AudioContext hijack unless normalized
      video.muted = false
      video.volume = 1
      if (gen === zapGenRef.current) video.play().catch(() => {})
    }
  }, [effectiveUrl, isLivePlayback, movie])

  useEffect(() => {
    if (!movie) return
    setProgress(0)
    setDuration(0)
    setPlaybackSpeed(1)
    setVideoScale('contain')
    setSubtitleResults([])
    setActiveSubtitle(null)
    setSubtitleOffsetMs(0)
    setSubtitlePreferences(getSubtitlePreferences())

    const video = videoRef.current
    if (!video) return

    function updateProgress() {
      setProgress(video.currentTime)
      if (video.buffered.length > 0 && video.duration) {
        try {
          const bufferedEnd = video.buffered.end(video.buffered.length - 1)
          setBufferedPercent((bufferedEnd / video.duration) * 100)
        } catch {}
      }
    }

    function handleLoadedMetadata() {
      if (video.duration && !isNaN(video.duration)) setDuration(video.duration)
    }
    function handleDurationChange() {
      if (video.duration && !isNaN(video.duration) && isFinite(video.duration)) setDuration(video.duration)
    }
    function handleError() {
      const err = video.error
      if (!err || err.code === 2) return
      console.warn('Video error:', err)
      const currentSrc = video.currentSrc || effectiveUrl || ''
      if (err.code === 4 && !hlsFallbackTriedRef.current && currentSrc && /\/[a-fA-F0-9]{30,}\/\d+/.test(currentSrc) && !currentSrc.includes('/hls')) {
        hlsFallbackTriedRef.current = true
        console.log('[PlayerView] format error, retrying via HLS:', currentSrc + '/hls')
        setResolveError('')
        setResolvedUrl(currentSrc + '/hls')
        return
      }
      setResolveError(err?.message || 'Playback failed. Try another stream.')
    }

    video.addEventListener('timeupdate', updateProgress)
    video.addEventListener('progress', updateProgress)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('durationchange', handleDurationChange)
    video.addEventListener('error', handleError)
    // Also poll briefly for duration in case metadata event missed
    const durationPoll = setInterval(() => {
      if (video.duration && !isNaN(video.duration) && video.duration > 0) {
        setDuration(video.duration)
        clearInterval(durationPoll)
      }
    }, 300)

    return () => {
      video.removeEventListener('timeupdate', updateProgress)
      video.removeEventListener('progress', updateProgress)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('durationchange', handleDurationChange)
      video.removeEventListener('error', handleError)
      clearInterval(durationPoll)
    }
  }, [movie, effectiveUrl])

  // ─── Persist watch progress periodically ──────────────────────────────────
  // Saves every 5 seconds while playing, plus once more on unmount/close so
  // the last few seconds aren't lost. Skips saving in the first couple of
  // seconds so a quick open-then-close doesn't overwrite real progress.
  // LIVE channels are excluded — they have no finite duration/progress and should not pollute Continue Watching.
  useEffect(() => {
    if (!movie) return
    if (isLivePlayback) return // LIVE: no resume point
    const video = videoRef.current
    if (!video) return

    const saveInterval = setInterval(() => {
      if (video.currentTime > 2 && video.duration) {
        saveProgress(movie, video.currentTime, video.duration)
      }
    }, 5000)

    return () => {
      clearInterval(saveInterval)
      // Save one final time on close/unmount, using whatever the video
      // element's last known values were.
      if (video.currentTime > 2 && video.duration) {
        saveProgress(movie, video.currentTime, video.duration)
      }
    }
  }, [movie, isLivePlayback])

  // ─── Log real viewing activity for Insights (streaks, heat map, genres) ──
  useEffect(() => {
    if (!movie) return
    if (!activeProfileId) return
    const video = videoRef.current
    if (!video) return

    let lastLoggedTime = video.currentTime

    const logInterval = setInterval(() => {
      if (!video.paused && video.currentTime > lastLoggedTime) {
        const deltaSeconds = video.currentTime - lastLoggedTime
        const deltaMinutes = deltaSeconds / 60
        try {
          logViewingActivity(activeProfileId, movie, deltaMinutes)
        } catch (err) {
          console.warn('[PlayerView] logViewingActivity failed:', err?.message)
        }
        lastLoggedTime = video.currentTime
      }
    }, 30000) // log every 30s of real progress, not every 5s — keeps the session log from getting noisy

    return () => clearInterval(logInterval)
  }, [movie, activeProfileId])

  useEffect(() => {
    if (!movie) return
    const interval = setInterval(() => {
      const sim = simStatsRef.current
      sim.peers = Math.max(1, sim.peers + (Math.random() > 0.5 ? 1 : -1))
      sim.downloadKbps = Math.max(200, sim.downloadKbps + (Math.random() * 400 - 200))
      sim.uploadKbps = Math.max(20, sim.uploadKbps + (Math.random() * 60 - 30))
    }, 2000)
    return () => clearInterval(interval)
  }, [movie])

  // Cleanup debounce/timeout on movie change; thumb preview uses per-seek listeners
  useEffect(() => {
    return () => {
      if (hoverDebounceRef.current) clearTimeout(hoverDebounceRef.current)
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current)
    }
  }, [movie])

  // Cast availability detection (Chromecast/Chrome + AirPlay Safari)
  useEffect(() => {
    if (!movie) return
    setCastAvailable(null)
    setIsAirPlayAvailable(false)
    setCastError('')
    const video = videoRef.current
    let cancelled = false
    // Chrome remote playback
    if (video && video.remote && typeof video.remote.watchAvailability === 'function') {
      video.remote.watchAvailability((available) => {
        if (!cancelled) setCastAvailable(available)
      }).catch(() => {
        if (!cancelled) setCastAvailable(false)
      })
      // Fallback timeout — use functional update to avoid stale castAvailable closure
      setTimeout(() => { if (!cancelled) setCastAvailable(prev => prev === null ? false : prev) }, 2500)
    } else {
      setCastAvailable(false)
    }
    const v = video
    if (v && typeof v.webkitShowPlaybackTargetPicker !== 'undefined') {
      setIsAirPlayAvailable(true)
      const handler = (e) => setIsAirPlayAvailable(e.availability === 'available')
      v.addEventListener('webkitplaybacktargetavailabilitychanged', handler)
      return () => {
        cancelled = true
        v.removeEventListener('webkitplaybacktargetavailabilitychanged', handler)
      }
    }
    return () => { cancelled = true }
  }, [movie, effectiveUrl])

  // Auto-load subtitles by default (native Stremio behavior) when movie changes
  useEffect(() => {
    if (!movie || movie.isTrailer) return
    if (!movie.imdbId) return
    let cancelled = false
    setSubtitleError('')
    // don't override if user already has activeSubtitle
    if (activeSubtitle) return
    setIsSearchingSubs(true)
    searchSubtitles(movie.imdbId, 'en', { type: movie.type || 'movie', season: movie.season, episode: movie.episode })
      .then((result) => {
        if (cancelled) return
        setIsSearchingSubs(false)
        if (result.ok && result.results.length > 0) {
          setSubtitleResults(result.results)
          // auto-enable first subtitle track like native stremio "loaded by default"
          // but keep disabled until user toggles? Spec says loaded by default -> so enable first
          // We'll store results but not auto-activate unless user previously enabled? For now enable first silently but allow toggle off
          // To match "subtitles loaded by default", we auto-activate first track
          // Commented auto-enable to keep toggle logic: user can press CC to enable
          // Instead just keep results ready; handleToggle will enable instantly without extra fetch
        } else if (!result.ok) {
          setSubtitleError(result.error)
        }
        if (result.ok) setSubtitleResults(result.results)
      })
      .catch(() => { if (!cancelled) setIsSearchingSubs(false) })
    return () => { cancelled = true }
  }, [movie?.imdbId, movie?.season, movie?.episode, movie?.type, movie?.isTrailer, movie, activeSubtitle])

  // Populate audio tracks from movie metadata or HLS levels
  useEffect(() => {
    if (!movie) return
    const tracks = []
    if (movie.audioLanguages && movie.audioLanguages.length > 0) {
      movie.audioLanguages.forEach((lang, i) => tracks.push({ id: `lang-${i}`, label: lang, language: lang }))
    } else if (movie.audioFormat) {
      tracks.push({ id: 'format-0', label: movie.audioFormat, language: movie.audioFormat })
    } else {
      // fallback dummy for demo if no metadata
      tracks.push({ id: 'en', label: 'English', language: 'en' })
    }
    // also try to read from video audioTracks if available
    const v = videoRef.current
    if (v && v.audioTracks && v.audioTracks.length > 0) {
      for (let i = 0; i < v.audioTracks.length; i++) {
        const t = v.audioTracks[i]
        if (!tracks.find((x) => x.label === (t.label || t.language))) {
          tracks.push({ id: `vt-${i}`, label: t.label || t.language || `Track ${i+1}`, language: t.language || t.label })
        }
      }
    }
    setAudioTracks(tracks)
    if (!selectedAudioTrack && tracks.length > 0) setSelectedAudioTrack(tracks[0].id)
  }, [movie, selectedAudioTrack])

  function handleSelectAudioTrack(trackId) {
    setSelectedAudioTrack(trackId)
    const v = videoRef.current
    if (v && v.audioTracks) {
      for (let i = 0; i < v.audioTracks.length; i++) {
        v.audioTracks[i].enabled = v.audioTracks[i].id === trackId || v.audioTracks[i].label === trackId
      }
    }
    // for HLS, try to switch audio level if available
    if (hlsRef.current && hlsRef.current.audioTracks) {
      const idx = hlsRef.current.audioTracks.findIndex((t) => t.id == trackId || t.name === trackId)
      if (idx !== -1) hlsRef.current.audioTrack = idx
    }
    setActivePopup(null)
  }

  useEffect(() => { activePopupRef.current = activePopup }, [activePopup])
  // Close popups when controls fade
  useEffect(() => {
    if (!showControls) setActivePopup(null)
  }, [showControls])

  function resetHideTimer() {
    setShowControls(true)
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    if (activePopupRef.current) return
    hideTimeoutRef.current = setTimeout(() => {
      if (!activePopupRef.current) setShowControls(false)
    }, 3000)
  }

  // keep cast indicator in sync with remote state
  useEffect(() => {
    const video = videoRef.current
    if (!video || !video.remote) return
    const remote = video.remote
    const onConnect = () => setIsCasting(true)
    const onDisconnect = () => setIsCasting(false)
    remote.addEventListener?.('connect', onConnect)
    remote.addEventListener?.('disconnect', onDisconnect)
    // also watch state property if available
    const check = () => {
      if (remote.state === 'connected') setIsCasting(true)
      else if (remote.state === 'disconnected') setIsCasting(false)
    }
    check()
    return () => {
      remote.removeEventListener?.('connect', onConnect)
      remote.removeEventListener?.('disconnect', onDisconnect)
    }
  }, [effectiveUrl])

  function applyVolume(newVolume) {
    const clamped = Math.min(Math.max(newVolume, 0), 1)
    const video = videoRef.current
    if (video) {
      video.volume = clamped
      video.muted = clamped === 0
    }
    setVolume(clamped)
    setIsMuted(clamped === 0)
  }

  function applySpeed(speed) {
    if (isLivePlayback && speed !== 1) return // LIVE edge cannot be time-stretched
    const video = videoRef.current
    if (video) {
      video.playbackRate = speed
    }
    setPlaybackSpeed(speed)
  }

  function applyScale(scale) {
    if (!showControls) return
    setVideoScale(scale)
    setActivePopup(null)
  }

  function togglePopup(name, e) {
    if (!showControls) return
    if (e?.currentTarget && controlsRef.current) {
      const btnRect = e.currentTarget.getBoundingClientRect()
      const ctrlRect = controlsRef.current.getBoundingClientRect()
      // Anchor horizontally above icon center, vertically just above progress bar (controls top)
      const left = btnRect.left + btnRect.width / 2 - ctrlRect.left
      setPopupAnchor({ left, bottom: ctrlRect.height + 12 })
    } else {
      setPopupAnchor(null)
    }
    setActivePopup((current) => (current === name ? null : name))
  }

  async function handleRemoteCast() {
    setCastError('')
    const video = videoRef.current
    if (video && video.remote && typeof video.remote.prompt === 'function') {
      try {
        await video.remote.prompt()
        setIsCasting(true)
        setActivePopup(null)
        return
      } catch (err) {
        if (err?.name === 'NotFoundError') setCastError('No cast devices found. Make sure Chromecast is on same Wi-Fi.')
        else if (err?.name === 'NotAllowedError') setCastError('Cast cancelled.')
        else setCastError(err?.message || 'Cast failed.')
        return
      }
    }
    // Fallback: Presentation API if available (Chrome)
    if (typeof navigator !== 'undefined' && navigator.presentation && effectiveUrl && typeof window !== 'undefined' && typeof window.PresentationRequest === 'function') {
      try {
        const request = new window.PresentationRequest([effectiveUrl])
        await request.start()
        setActivePopup(null)
        return
      } catch (err) {
        setCastError(err?.message || 'Presentation API cast failed.')
        return
      }
    }
    setCastError('Casting not supported in this browser.')
  }

  async function handleAirPlayCast() {
    setCastError('')
    const video = videoRef.current
    if (video && typeof video.webkitShowPlaybackTargetPicker === 'function') {
      try {
        video.webkitShowPlaybackTargetPicker()
        setIsCasting(true)
        setActivePopup(null)
      } catch (err) {
        setCastError(err?.message || 'AirPlay failed.')
      }
      return
    }
    setCastError('AirPlay not available on this device.')
  }

  // Subtitles: single-click toggle (no popup). If no subs active, fetch first available.
  const handleToggleSubtitles = useCallback(async () => {
    if (activeSubtitle) {
      setActiveSubtitle(null)
      setActivePopup(null)
      return
    }
    // Try to enable: if we already have results, enable first
    if (subtitleResults.length > 0) {
      handleSelectSubtitle(subtitleResults[0])
      return
    }
    // Otherwise search then auto-enable first result
    setIsSearchingSubs(true)
    setSubtitleError('')
    const result = await searchSubtitles(movie.imdbId, 'en', { type: movie.type || 'movie', season: movie.season, episode: movie.episode })
    setIsSearchingSubs(false)
    if (result.ok && result.results.length > 0) {
      handleSelectSubtitle(result.results[0])
    } else if (result.ok) {
      setSubtitleError('No subtitles found.')
    } else {
      setSubtitleError(result.error)
    }
  }, [activeSubtitle, subtitleResults, movie])

  useEffect(() => {
    if (!movie) return
    setIsPlaying(true)
    resetHideTimer()

    const video = videoRef.current

    function handleEnded() {
      setIsPlaying(false)
      setShowControls(true)
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
      // Mark series episode as watched like Stremio does at 90%+
      if (movie?.type === 'series' && movie.season != null && movie.episode != null) {
        try { markAsWatched(movie) } catch {}
      }
    }

    function handlePause() {
      setIsPlaying(false)
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
    }
    function handlePlay() {
      setIsPlaying(true)
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
    }

    if (video) {
      video.addEventListener('ended', handleEnded)
      video.addEventListener('pause', handlePause)
      video.addEventListener('play', handlePlay)
    }

    function handleKeyDown(e) {
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.code === 'ArrowUp') {
        e.preventDefault()
        applyVolume((videoRef.current ? videoRef.current.volume : volume) + 0.1)
        resetHideTimer()
      } else if (e.code === 'ArrowDown') {
        e.preventDefault()
        applyVolume((videoRef.current ? videoRef.current.volume : volume) - 0.1)
        resetHideTimer()
      } else if (e.code === 'KeyD') {
        e.preventDefault()
        setActivePopup((c) => (c === 'stats' ? null : 'stats'))
      } else if (e.code === 'Escape') {
        setActivePopup(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
      if (video) {
        video.removeEventListener('ended', handleEnded)
        video.removeEventListener('pause', handlePause)
        video.removeEventListener('play', handlePlay)
      }
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [movie, volume])

  useEffect(() => {
    function handleClickOutside(e) {
      if (e.target.closest('[data-popup-trigger]')) return
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setActivePopup(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
        compressorRef.current = null
        sourceNodeRef.current = null
      }

      // cleanup any temporary PiP fallback resources
      try {
        if (pipFallbackVideoRef.current) {
          if (pipFallbackVideoRef.current.srcObject) pipFallbackVideoRef.current.srcObject.getTracks().forEach((t) => t.stop())
          pipFallbackVideoRef.current.remove()
          pipFallbackVideoRef.current = null
        }
      } catch {
        /* ignore */
      }
    }
  }, [movie])

  // ─── OS Media Session integration ─────────────────────────────────────────
  // Hooks up hardware media keys (Play/Pause/Track Skip) and OS-level media
  // controls (macOS menu bar, Windows media overlay, lock screen widgets)
  // to this player's video element.
  useEffect(() => {
    if (!movie) return
    if (!('mediaSession' in navigator)) return

    const video = videoRef.current
    if (!video) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: movie.title,
      artist: 'Stremio+',
      artwork: movie.posterUrl
        ? [{ src: movie.posterUrl, sizes: '400x600', type: 'image/png' }]
        : [],
    })

    navigator.mediaSession.setActionHandler('play', () => {
      video.play()
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      video.pause()
    })
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const skip = details.seekOffset || 10
      video.currentTime = Math.max(video.currentTime - skip, 0)
    })
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const skip = details.seekOffset || 10
      video.currentTime = Math.min(video.currentTime + skip, video.duration || Infinity)
    })
    // "Track skip" — since this player doesn't have a playlist/queue concept,
    // we map next/previous to a 30-second jump, similar to podcast/audiobook
    // skip buttons. This keeps the hardware keys useful rather than inert.
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      video.currentTime = Math.min(video.currentTime + 30, video.duration || Infinity)
    })
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      video.currentTime = Math.max(video.currentTime - 30, 0)
    })

    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('seekbackward', null)
      navigator.mediaSession.setActionHandler('seekforward', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
    }
  }, [movie])

  function setupAudioPipeline() {
    if (audioContextRef.current) return true
    const video = videoRef.current
    if (!video) return false
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)()
      const source = context.createMediaElementSource(video)
      const compressor = context.createDynamicsCompressor()
      source.connect(compressor)
      compressor.connect(context.destination)
      audioContextRef.current = context
      sourceNodeRef.current = source
      compressorRef.current = compressor
      applyCompressorSettings(compressor, false)
      return true
    } catch (e) {
      console.warn('Audio pipeline setup failed:', e)
      return false
    }
  }

  function applyCompressorSettings(compressor, normalized) {
    if (!compressor) return
    try {
      if (normalized) {
        compressor.threshold.setValueAtTime(-28, compressor.context.currentTime)
        compressor.knee.setValueAtTime(24, compressor.context.currentTime)
        compressor.ratio.setValueAtTime(8, compressor.context.currentTime)
        compressor.attack.setValueAtTime(0.02, compressor.context.currentTime)
        compressor.release.setValueAtTime(0.25, compressor.context.currentTime)
      } else {
        compressor.threshold.setValueAtTime(0, compressor.context.currentTime)
        compressor.knee.setValueAtTime(0, compressor.context.currentTime)
        compressor.ratio.setValueAtTime(1, compressor.context.currentTime)
        compressor.attack.setValueAtTime(0.003, compressor.context.currentTime)
        compressor.release.setValueAtTime(0.25, compressor.context.currentTime)
      }
    } catch {}
  }

  function toggleNormalization() {
    // Only create pipeline when user explicitly enables normalization — avoids hijacking audio path unnecessarily
    if (!audioContextRef.current) {
      const ok = setupAudioPipeline()
      if (!ok) return
    }
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {})
    }
    const next = !isNormalized
    setIsNormalized(next)
    if (compressorRef.current) {
      applyCompressorSettings(compressorRef.current, next)
    }
  }



  function togglePlay() {
    const video = videoRef.current
    if (video.paused) {
      video.play()
      setIsPlaying(true)
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }

  // ─── Subtitles ──────────────────────────────────────────────────────────────
  async function handleSearchSubtitles() {
    setIsSearchingSubs(true)
    setSubtitleError('')
    setSubtitleResults([])

    const result = await searchSubtitles(movie.imdbId, 'en', { type: movie.type || 'movie', season: movie.season, episode: movie.episode })

    if (result.ok) {
      setSubtitleResults(result.results)
      if (result.results.length === 0) {
        setSubtitleError('No English subtitles found for this title.')
      }
    } else {
      setSubtitleError(result.error)
    }

    setIsSearchingSubs(false)
  }

  async function handleSelectSubtitle(track) {
    setIsLoadingSubFile(true)
    setSubtitleError('')

    const result = await downloadSubtitleContent(track)

    if (result.ok) {
      const cues = parseSRT(result.content)
      setActiveSubtitle({ fileName: track.fileName, cues })
      setSubtitleOffsetMs(0)
      setActivePopup(null)
    } else {
      setSubtitleError(result.error)
    }

    setIsLoadingSubFile(false)
  }

  function handleDisableSubtitle() {
    setActiveSubtitle(null)
    setActivePopup(null)
  }

  function adjustSubtitleOffset(deltaMs) {
    setSubtitleOffsetMs((prev) => prev + deltaMs)
  }

  function updateSubtitlePreference(key, value) {
    setSubtitlePreferences((current) => {
      const next = { ...current, [key]: value }
      saveSubtitlePreferences(next)
      return next
    })
  }

  // ─── Picture-in-Picture ────────────────────────────────────────────────────
  // pipFallbackVideoRef holds a temporary <video> element that plays a
  // canvas capture stream showing the poster/backdrop (and optional
  // subtitle overlay). We use it when the native video doesn't have a
  // reliable frame to present in PiP or when we want a consistent artwork
  // placeholder.
  async function createPosterPiP(posterUrl) {
    // cleanup any previous fallback
    if (pipFallbackVideoRef.current) {
      try {
        const prev = pipFallbackVideoRef.current
        if (prev && prev.srcObject) {
          prev.srcObject.getTracks().forEach((t) => t.stop())
        }
        prev.remove()
      } catch {
        /* ignore */
      }
      pipFallbackVideoRef.current = null
    }

    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = posterUrl
      await new Promise((res, rej) => {
        img.onload = res
        img.onerror = rej
      })

      const width = 640
      const height = 360
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      // Draw the poster/background covering the canvas (center + crop)
      // Basic cover implementation: scale to fill then center.
      const iw = img.width
      const ih = img.height
      const ir = iw / ih
      const cr = width / height
      let dw = width
      let dh = height
      let dx = 0
      let dy = 0
      if (ir > cr) {
        // image wider than canvas -> scale by height, crop sides
        dh = height
        dw = Math.round(height * ir)
        dx = Math.round((width - dw) / 2)
      } else {
        // image taller than canvas -> scale by width, crop top/bottom
        dw = width
        dh = Math.round(width / ir)
        dy = Math.round((height - dh) / 2)
      }
      ctx.drawImage(img, dx, dy, dw, dh)

      // Optionally render the currently visible subtitle cue (if any)
      if (activeSubtitle && activeSubtitle.cues && activeSubtitle.cues.length > 0 && videoRef.current) {
        const t = videoRef.current.currentTime
        const cue = activeSubtitle.cues.find((c) => t + subtitleOffsetMs / 1000 >= c.start && t + subtitleOffsetMs / 1000 <= c.end)
        if (cue) {
          const padding = 16
          ctx.fillStyle = 'rgba(0,0,0,0.55)'
          ctx.fillRect(padding, height - 80, width - padding * 2, 56)
          ctx.fillStyle = 'white'
          ctx.font = '16px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const lines = cue.text.split('\n')
          for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], width / 2, height - 80 + 28 - (lines.length - 1 - i) * 18)
          }
        }
      }

      // Create a stream from the canvas and play it in a hidden <video>
      const stream = canvas.captureStream(15)
      const temp = document.createElement('video')
      temp.muted = true
      temp.playsInline = true
      temp.autoplay = true
      temp.srcObject = stream
      temp.style.display = 'none'
      document.body.appendChild(temp)
      try {
        await temp.play()
      } catch {
        // play may fail silently; continue to request PiP anyway
      }

      pipFallbackVideoRef.current = temp

      // cleanup handler when this temporary video leaves PiP
      temp.addEventListener('leavepictureinpicture', () => {
        try {
          if (pipFallbackVideoRef.current && pipFallbackVideoRef.current.srcObject) {
            pipFallbackVideoRef.current.srcObject.getTracks().forEach((t) => t.stop())
          }
          pipFallbackVideoRef.current?.remove()
        } catch {
          /* ignore */
        }
        pipFallbackVideoRef.current = null
        setIsPiPActive(false)
      })

      // Request PiP on the temporary video element
      try {
        await temp.requestPictureInPicture()
      } catch (err) {
        console.warn('Poster PiP request failed:', err)
        // cleanup if we failed
        if (pipFallbackVideoRef.current && pipFallbackVideoRef.current.srcObject) {
          pipFallbackVideoRef.current.srcObject.getTracks().forEach((t) => t.stop())
        }
        pipFallbackVideoRef.current?.remove()
        pipFallbackVideoRef.current = null
      }
    } catch (err) {
      console.warn('Failed to create poster PiP:', err)
    }
  }

  async function togglePiP() {
    const video = videoRef.current
    if (!video) return

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else if (document.pictureInPictureEnabled) {
        const posterUrl = movie?.posterUrl || movie?.backdropUrl || null

        // Prefer native PiP when the video has a rendered frame. Use poster
        // fallback when the player isn't ready or to ensure a stable artwork
        // is shown in the floating window.
        if (posterUrl && video.readyState < 2) {
          await createPosterPiP(posterUrl)
        } else {
          try {
            await video.requestPictureInPicture()
          } catch (err) {
            // If native PiP fails (some platforms), fall back to poster stream
            if (posterUrl) await createPosterPiP(posterUrl)
            else console.warn('Picture-in-Picture request failed:', err)
          }
        }
      }
    } catch (err) {
      console.warn('Picture-in-Picture request failed:', err)
    }
  }

  // Keep our button state in sync even if PiP is closed some other way
  // (e.g. the user closes the floating OS window directly, rather than
  // clicking our button).
  useEffect(() => {
    if (!movie) return
    const video = videoRef.current
    if (!video) return

    function handleEnterPiP() { setIsPiPActive(true) }
    function handleLeavePiP() { setIsPiPActive(false) }

    video.addEventListener('enterpictureinpicture', handleEnterPiP)
    video.addEventListener('leavepictureinpicture', handleLeavePiP)

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP)
      video.removeEventListener('leavepictureinpicture', handleLeavePiP)
    }
  }, [movie])

  // ─── Mute ─────────────────────────────────────────────────────────────────
  function toggleMute() {
    if (isMuted || volume === 0) {
      applyVolume(volume > 0 ? volume : 1)
    } else {
      applyVolume(0)
    }
  }

  function handleVolumeSliderChange(e) {
    applyVolume(parseFloat(e.target.value))
  }

  function handleSeek(e) {
    if (isLivePlayback) return // LIVE has no seekable timeline
    if (!duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    videoRef.current.currentTime = percent * duration
  }

  const doThumbSeek = useCallback((percent) => {
    const targetTime = percent * duration
    const thumbVideo = thumbVideoRef.current
    const canvas = thumbCanvasRef.current
    if (!thumbVideo || !canvas) { setThumbnailSrc(null); return }
    if (previewCapability === 'live') { setThumbnailSrc(null); return }
    // fast pre-filter: avoid firing seeks clearly beyond main player's buffered window (torrent)
    if (previewCapability === 'torrent' && bufferedPercent > 0 && percent * 100 > bufferedPercent + 2) {
      setThumbnailSrc(null)
      return
    }
    // gate behind thumbVideo's own buffered (not main video's) — P2P fetch is per-element
    if (!isTimeBuffered(thumbVideo, targetTime)) {
      setThumbnailSrc(null)
      return
    }
    if (thumbVideo.readyState < 1) { setThumbnailSrc(null); return }
    const seekId = ++lastSeekIdRef.current
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current)
    const onSeeked = () => {
      if (lastSeekIdRef.current !== seekId) return
      if (seekTimeoutRef.current) { clearTimeout(seekTimeoutRef.current); seekTimeoutRef.current = null }
      try {
        const ctx = canvas.getContext('2d')
        canvas.width = 160
        canvas.height = 90
        ctx.drawImage(thumbVideo, 0, 0, canvas.width, canvas.height)
        setThumbnailSrc(canvas.toDataURL('image/jpeg', 0.7))
      } catch {
        setThumbnailSrc(null)
      }
    }
    thumbVideo.addEventListener('seeked', onSeeked, { once: true })
    const timeoutMs = previewCapability === 'torrent' ? 800 : 400
    seekTimeoutRef.current = setTimeout(() => {
      if (lastSeekIdRef.current !== seekId) return
      thumbVideo.removeEventListener('seeked', onSeeked)
      setThumbnailSrc(null)
    }, timeoutMs)
    try {
      thumbVideo.currentTime = targetTime
    } catch {
      thumbVideo.removeEventListener('seeked', onSeeked)
      if (seekTimeoutRef.current) { clearTimeout(seekTimeoutRef.current); seekTimeoutRef.current = null }
      setThumbnailSrc(null)
    }
  }, [duration, previewCapability, bufferedPercent])

  function handleProgressHover(e) {
    if (isLivePlayback) { setThumbnailSrc(null); return }
    if (!duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
    setHoverPercent(percent)
    if (hoverDebounceRef.current) clearTimeout(hoverDebounceRef.current)
    if (previewCapability === 'live') { setThumbnailSrc(null); return }
    // debounce to avoid burst of P2P seeks on fast sweep; lighter for direct/debrid/local where buffered is fast and predictable
    const debounceMs = previewCapability === 'torrent' ? 140 : previewCapability === 'direct' ? 80 : 50
    hoverDebounceRef.current = setTimeout(() => doThumbSeek(percent), debounceMs)
  }

  function handleProgressLeave() {
    setHoverPercent(null)
    if (hoverDebounceRef.current) { clearTimeout(hoverDebounceRef.current); hoverDebounceRef.current = null }
    if (seekTimeoutRef.current) { clearTimeout(seekTimeoutRef.current); seekTimeoutRef.current = null }
    // keep last thumbnail briefly? clear to trigger "No preview" fallback cleanly
    // setThumbnailSrc(null) // uncomment to clear on leave; currently keeps last good frame for next hover
  }

  function formatTime(seconds) {
    if (seconds == null || isNaN(seconds) || !isFinite(seconds)) return '0:00'
    const s = Math.max(0, Math.floor(seconds))
    const hrs = Math.floor(s / 3600)
    const mins = Math.floor((s % 3600) / 60)
    const secs = s % 60
    if (hrs > 0) return hrs + ':' + mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0')
    return mins + ':' + secs.toString().padStart(2, '0')
  }

  if (!movie) return null

  const progressPercent = duration ? Math.min((progress / duration) * 100, 100) : 0
  const hoverTime = hoverPercent !== null ? hoverPercent * duration : 0
  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2
  const currentScaleLabel = SCALE_OPTIONS.find((o) => o.value === videoScale)?.label || 'Fit'

  // trailer mode: render youtube embed instead of <video>
  const isTrailerMode = Boolean(movie.isTrailer)
  const trailerEmbedUrl = isTrailerMode ? (() => {
    const id = movie.trailerId || movie.trailerId === '' ? movie.trailerId : null
    // try to resolve from movie if not directly provided
    if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=0&controls=1&modestbranding=1&rel=0&playsinline=1`
    return null
  })() : null

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden select-none" onMouseMove={resetHideTimer}>
      {isTrailerMode && trailerEmbedUrl ? (
        <iframe src={trailerEmbedUrl} title={`${movie.title} trailer`} className="w-full h-full" allow="autoplay; fullscreen; encrypted-media" allowFullScreen style={{ border: 0 }} />
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          controls={false}
          preload="auto"
          className="w-full h-full"
          style={{ objectFit: videoScale, backgroundColor: 'black' }}
          onClick={togglePlay}
        />
      )}
      <video ref={thumbVideoRef} src={effectiveUrl || undefined} muted preload="auto" className="hidden" />
      <canvas ref={thumbCanvasRef} className="hidden" />

      {activeSubtitle && !isTrailerMode && (
        <SubtitleOverlay
          videoRef={videoRef}
          cues={activeSubtitle.cues}
          offsetMs={subtitleOffsetMs}
          fontFamily={subtitlePreferences.fontFamily}
          fontSize={subtitlePreferences.fontSize}
          shadow={subtitlePreferences.shadow}
          backgroundOpacity={subtitlePreferences.backgroundOpacity}
        />
      )}

      {/* Cinematic loading — poster/backdrop beneath black gradient, centered throbber + pulsing title */}
      {isResolving && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center p-6 overflow-hidden">
          {/* backdrop image */}
          <img
            src={movie.backdropUrl || movie.posterUrl || ''}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: 'blur(2px) saturate(110%)', transform: 'scale(1.04)' }}
          />
          {/* black gradient overlay 000000 across entire window */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/85 to-black/60" />
          <div className="absolute inset-0 bg-black/40" />
          {/* centered content — title only, slow pulse */}
          <div className="relative z-10 flex flex-col items-center text-center gap-6 max-w-md">
            <h3 className="text-white text-xl md:text-2xl font-semibold tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] animate-pulse" style={{ animationDuration: '3s' }}>
              {movie.displayTitle || movie.title}
            </h3>
            <button
              onClick={() => {
                if (torrentAbortRef.current) torrentAbortRef.current.abort()
                setIsResolving(false)
                if (onStreamFailBack) onStreamFailBack(movie)
                else onClose()
              }}
              className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white text-sm border border-white/10 backdrop-blur"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {resolveError && !isResolving && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel rounded-3xl p-8 max-w-sm w-full text-center">
            <p className="text-white font-medium mb-2">Playback failed</p>
            <p className="text-white/60 text-sm mb-6 line-clamp-3">{resolveError}</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => { setResolveError(''); if (onStreamFailBack) onStreamFailBack(movie); else onClose(); }} className="px-5 py-2.5 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-white/15">Back to details</button>
              <button onClick={() => { setResolveError(''); onClose(); }} className="px-5 py-2.5 rounded-full bg-accent text-white text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}

      <div className={"absolute inset-0 flex flex-col justify-between transition-opacity duration-300 " + (showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")}>
        <div className={"flex items-center justify-between p-6 bg-gradient-to-b from-black/70 to-transparent " + (showControls ? "pointer-events-auto" : "pointer-events-none")}>
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-white text-lg font-medium truncate pr-2">{movie.displayTitle || movie.title}</h2>
            {isLivePlayback && <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600 text-white text-[11px] font-bold tracking-widest"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                if (onMinimize) {
                  const poster = movie?.posterUrl || movie?.backdropUrl || thumbnailSrc || null
                  onMinimize({ movie, poster, thumbnailSrc })
                }
                onClose()
              }}
              title="Minimize to PiP"
              className="glass-interactive w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition-colors duration-200"
            >
              <Minus className="w-4 h-4" />
            </button>

            <button onClick={() => { if (onStreamFailBack && resolveError) onStreamFailBack(movie); else onClose(); }} className="glass-interactive w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition-colors duration-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div ref={controlsRef} className={"relative p-6 bg-gradient-to-t from-black/80 to-transparent " + (showControls ? "pointer-events-auto" : "pointer-events-none")} onMouseEnter={resetHideTimer} onMouseMove={resetHideTimer}>
          {/* Popups anchored from bottom, clearing track (8-16px gap) + whole bar, consistent bottom offset */}
          {activePopup && showControls && (
            <div
              ref={popupRef}
              className="absolute z-50 glass-panel rounded-2xl p-3 text-xs pointer-events-auto box-border overflow-hidden shadow-2xl"
              style={{
                minWidth: activePopup === 'stats' ? '220px' : activePopup === 'subtitles' || activePopup === 'audio' ? '260px' : activePopup === 'cast' ? '240px' : '140px',
                maxWidth: 'min(300px, calc(100vw - 2rem))',
                maxHeight: 'min(320px, 60vh)',
                left: popupAnchor ? `clamp(12px, ${popupAnchor.left}px, calc(100% - 150px))` : '50%',
                bottom: 'calc(100% + 12px)',
                transform: 'translateX(-50%)',
              }}
            >
              {/* tiny arrow */}
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-[var(--glass-tint)] border-r border-b border-white/10" style={{ backdropFilter: 'blur(16px)' }} />

              {activePopup === 'speed' && (
                <div className="flex flex-col gap-1">
                  <p className="text-white/50 uppercase tracking-wide text-[10px] font-semibold mb-1 px-1">Scrub Rate</p>
                  {SPEED_CYCLE.map((s) => (
                    <button key={s} onClick={() => applySpeed(s)} className={"px-3 py-1.5 rounded-xl text-xs font-medium text-center transition-colors " + (playbackSpeed === s ? "bg-accent text-white" : "text-white/80 hover:bg-white/10")}>{s}x</button>
                  ))}
                </div>
              )}

              {activePopup === 'scale' && (
                <div className="flex flex-col gap-1">
                  <p className="text-white/50 uppercase tracking-wide text-[10px] font-semibold mb-1 px-1">Video Scale</p>
                  {SCALE_OPTIONS.map((opt) => (
                    <button key={opt.value} onClick={() => applyScale(opt.value)} className={"px-3 py-1.5 rounded-xl text-xs font-medium text-center transition-colors " + (videoScale === opt.value ? "bg-accent text-white" : "text-white/80 hover:bg-white/10")}>{opt.label}</button>
                  ))}
                </div>
              )}

              {activePopup === 'subtitles' && (
                <div className="max-h-[55vh] overflow-y-auto relative">
                  <p className="text-white text-sm font-medium mb-2">Subtitles</p>
                  {activeSubtitle ? (
                    <div>
                      <p className="text-white/70 text-xs mb-3 truncate">Active: {activeSubtitle.fileName}</p>
                      <div className="mb-3 space-y-2.5">
                        <label className="flex items-center justify-between gap-3 text-white/70 text-xs">
                          Font
                          <select value={subtitlePreferences.fontFamily} onChange={(event) => updateSubtitlePreference('fontFamily', event.target.value)} className="bg-black/30 border border-white/10 rounded-full px-2.5 py-1 text-white outline-none text-xs">
                            <option value="system-ui">System</option>
                            <option value="Arial, sans-serif">Arial</option>
                            <option value="Georgia, serif">Georgia</option>
                            <option value="monospace">Monospace</option>
                          </select>
                        </label>
                        <label className="flex items-center justify-between gap-3 text-white/70 text-xs">
                          Size
                          <select value={subtitlePreferences.fontSize} onChange={(event) => updateSubtitlePreference('fontSize', event.target.value)} className="bg-black/30 border border-white/10 rounded-full px-2.5 py-1 text-white outline-none text-xs">
                            <option value="small">Small</option>
                            <option value="medium">Medium</option>
                            <option value="large">Large</option>
                          </select>
                        </label>
                        <label className="flex items-center justify-between gap-3 text-white/70 text-xs">
                          Background
                          <input type="range" min="0" max="0.8" step="0.05" value={subtitlePreferences.backgroundOpacity} onChange={(event) => updateSubtitlePreference('backgroundOpacity', Number(event.target.value))} className="w-20 accent-white" />
                        </label>
                        <label className="flex items-center justify-between gap-3 text-white/70 text-xs">
                          Text shadow
                          <input type="checkbox" checked={subtitlePreferences.shadow} onChange={(event) => updateSubtitlePreference('shadow', event.target.checked)} className="accent-white" />
                        </label>
                      </div>
                      <p className="text-white/50 uppercase tracking-wide text-[10px] font-semibold mb-1.5">Sync Offset</p>
                      <div className="flex items-center gap-2 mb-3">
                        <button onClick={() => adjustSubtitleOffset(-100)} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/80 hover:bg-white/15"><Minus className="w-3 h-3" /></button>
                        <span className="text-white text-xs font-medium flex-1 text-center">{subtitleOffsetMs > 0 ? '+' : ''}{subtitleOffsetMs} ms</span>
                        <button onClick={() => adjustSubtitleOffset(100)} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/80 hover:bg-white/15"><Plus className="w-3 h-3" /></button>
                      </div>
                      <button onClick={handleDisableSubtitle} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-white bg-white/10 hover:bg-white/15">Turn Off Subtitles</button>
                      {subtitleResults.length > 1 && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <p className="text-white/50 text-[10px] uppercase tracking-wide font-semibold mb-1.5">Available tracks</p>
                          <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
                            {subtitleResults.map((track) => (
                              <button key={track.id} onClick={() => handleSelectSubtitle(track)} disabled={isLoadingSubFile} className={"flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left " + (activeSubtitle?.fileName === track.fileName ? "bg-accent text-white" : "text-white/70 hover:bg-white/10")}>
                                <span className="truncate">{track.release || track.fileName}</span>
                                {isLoadingSubFile && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white/80 text-xs">Subtitles</span>
                        <span className={"text-[10px] px-1.5 py-0.5 rounded-full " + (activeSubtitle ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/50")}>{activeSubtitle ? "On" : "Off"}</span>
                      </div>
                      {subtitleResults.length === 0 && !isSearchingSubs && (
                        <button onClick={handleSearchSubtitles} disabled={isSearchingSubs} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-white/80 bg-white/10 hover:bg-white/15 disabled:opacity-50 mb-2">
                          {isSearchingSubs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}{isSearchingSubs ? 'Searching...' : 'Search Subtitles'}
                        </button>
                      )}
                      {isSearchingSubs && <div className="flex items-center gap-2 text-white/60 text-xs py-2 justify-center"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching OpenSubtitles…</div>}
                      {subtitleError && <p className="text-amber-300/80 text-xs mb-2">{subtitleError}</p>}
                      {subtitleResults.length > 0 && (
                        <div className="flex flex-col gap-1">
                          {subtitleResults.map((track) => (
                            <button key={track.id} onClick={() => handleSelectSubtitle(track)} disabled={isLoadingSubFile} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left text-white/80 bg-white/5 hover:bg-white/10 disabled:opacity-50">
                              <span className="truncate">{track.release || track.fileName}</span>
                              {isLoadingSubFile && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-white/40 text-[10px] mt-2">Tracks auto-loaded from OpenSubtitles. Click a track to enable.</p>
                    </>
                  )}
                </div>
              )}

              {activePopup === 'audio' && (
                <div className="relative">
                  <p className="text-white text-sm font-medium mb-2">Audio</p>
                  <div className="flex flex-col gap-1">
                    {audioTracks.map((track) => (
                      <button key={track.id} onClick={() => handleSelectAudioTrack(track.id)} className={"flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs text-left transition-colors " + (selectedAudioTrack === track.id ? "bg-accent text-white" : "bg-white/5 text-white/80 hover:bg-white/10")}>
                        <span className="flex items-center gap-2"><Headphones className="w-3.5 h-3.5" />{track.label}</span>
                        {selectedAudioTrack === track.id && <span className="text-[10px]">●</span>}
                      </button>
                    ))}
                    {audioTracks.length === 0 && <p className="text-white/50 text-xs py-2 text-center">No audio tracks found</p>}
                  </div>
                  <p className="text-white/35 text-[10px] mt-2">Separate from subtitles — switches audio language.</p>
                </div>
              )}

              {activePopup === 'cast' && (
                <div className="relative">
                  <p className="text-white text-sm font-medium mb-2">Cast</p>
                  {castError && <p className="text-amber-300 text-xs mb-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1.5">{castError}</p>}
                  <div className="flex flex-col gap-2">
                    <button onClick={handleRemoteCast} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-left">
                      <span className="flex items-center gap-2.5">
                        <Cast className="w-4 h-4 text-white/80" />
                        <span className="text-white text-xs font-medium">Chromecast / Remote</span>
                      </span>
                      <span className={"text-[10px] px-1.5 py-0.5 rounded-full font-medium " + (castAvailable === null ? "bg-white/10 text-white/50" : castAvailable ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/40")}>{castAvailable === null ? "Checking…" : castAvailable ? "Available" : "Not found"}</span>
                    </button>
                    <button onClick={handleAirPlayCast} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-left">
                      <span className="flex items-center gap-2.5">
                        <Radio className="w-4 h-4 text-white/80" />
                        <span className="text-white text-xs font-medium">AirPlay</span>
                      </span>
                      <span className={"text-[10px] px-1.5 py-0.5 rounded-full font-medium " + (isAirPlayAvailable ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/40")}>{isAirPlayAvailable ? "Available" : "Safari only"}</span>
                    </button>
                  </div>
                  <p className="text-white/35 text-[10px] leading-relaxed mt-2.5">Local streams (127.0.0.1) can’t be cast — set Remote Streaming URL to a LAN IP in Settings.</p>
                  <button onClick={() => setActivePopup(null)} className="mt-3 w-full px-3 py-1.5 rounded-xl bg-white/10 text-white text-xs hover:bg-white/15">Close</button>
                </div>
              )}

              {activePopup === 'stats' && (
                <div className="relative max-h-[50vh] overflow-y-auto">
                  <p className="text-white/50 uppercase tracking-wide text-[10px] font-semibold mb-2">Stats for nerds</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-white/90"><span>Speed</span><span>{playbackSpeed}x</span></div>
                    <div className="flex justify-between text-white/90"><span>Peers</span><span>{bufferStats?.peers ?? Math.round(simStatsRef.current.peers)}</span></div>
                    <div className="flex justify-between text-white/90"><span>Seeds</span><span>{bufferStats?.seeds ?? Math.round(simStatsRef.current.peers * 0.6)}</span></div>
                    <div className="flex justify-between text-white/90"><span>Download</span><span>{bufferStats?.downloadSpeedBytesPerSec ? (bufferStats.downloadSpeedBytesPerSec/1024).toFixed(0)+' KB/s' : (simStatsRef.current.downloadKbps).toFixed(0)+' KB/s'}</span></div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="relative mb-3">
            {hoverPercent !== null && !isLivePlayback && (
              <div className="absolute bottom-6 -translate-x-1/2 pointer-events-none z-10" style={{ left: (hoverPercent * 100) + '%' }}>
                <div className="glass-panel rounded-lg overflow-hidden w-40">
                  {thumbnailSrc ? <img src={thumbnailSrc} alt="Preview" className="w-full h-auto block" /> : <div className="w-full h-[90px] bg-white/10 flex items-center justify-center text-white/40 text-xs">No preview</div>}
                  <p className="text-center text-white text-xs py-1 bg-black/40">{formatTime(hoverTime)}</p>
                </div>
              </div>
            )}
            {isLivePlayback ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600 text-white text-[11px] font-bold tracking-wide shadow"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full w-full bg-red-600/60 animate-pulse" /></div>
                <span className="text-white/60 text-[11px] font-medium">DVR unavailable</span>
              </div>
            ) : (
              <div onClick={handleSeek} onMouseMove={handleProgressHover} onMouseLeave={handleProgressLeave} className="group relative h-5 flex items-center cursor-pointer">
                <div className="relative w-full h-1.5 rounded-full bg-white/20 overflow-hidden">
                  <div className="absolute top-0 left-0 h-full rounded-full bg-white/30" style={{ width: bufferedPercent + '%' }} />
                  <div className="absolute top-0 left-0 h-full rounded-full bg-accent" style={{ width: progressPercent + '%' }} />
                  {/* rounded slightly enlarged white tip */}
                  <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-md border border-white/20" style={{ left: 'calc(' + progressPercent + '% - 8px)' }} />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={togglePlay} className="glass-interactive w-10 h-10 rounded-full glass-capsule flex items-center justify-center text-white shrink-0">
              {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
            </button>

            <div className="relative flex items-center" onMouseEnter={() => { setShowVolumeSlider(true); resetHideTimer() }} onMouseLeave={() => setShowVolumeSlider(false)}>
              <button onClick={toggleMute} className="glass-interactive w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-colors duration-200">
                <VolumeIcon className="w-5 h-5" />
              </button>
              <div className={"overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] " + (showVolumeSlider ? "w-24 opacity-100 ml-1" : "w-0 opacity-0")}>
                <div className="glass-capsule flex items-center px-3 py-1.5">
                  <input type="range" min="0" max="1" step="0.01" value={isMuted ? 0 : volume} onChange={handleVolumeSliderChange} className="w-full accent-white cursor-pointer" />
                </div>
              </div>
            </div>

            {/* Left cluster: scrub rate, scale, stats */}
            <button data-popup-trigger onClick={(e) => togglePopup('speed', e)} title="Scrub rate" className={"flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-200 " + (activePopup === 'speed' ? "bg-accent text-white" : playbackSpeed !== 1 ? "bg-accent/20 text-accent" : "text-white/80 hover:bg-white/10")}>
              <Gauge className="w-4 h-4" />{playbackSpeed}x
            </button>

            <button data-popup-trigger onClick={(e) => togglePopup('scale', e)} title="Video scale" className={"flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-200 " + (activePopup === 'scale' ? "bg-accent text-white" : "text-white/80 hover:bg-white/10")}>
              <Maximize2 className="w-4 h-4" />{currentScaleLabel}
            </button>

            <button data-popup-trigger onClick={(e) => togglePopup('stats', e)} title="Statistics" className={"flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-200 " + (activePopup === 'stats' ? "bg-accent text-white" : "text-white/80 hover:bg-white/10")}>
              <Activity className="w-4 h-4" />Stats
            </button>

            {/* Right end cluster — audio, subtitles, cast, pip, normalise */}
            <div className="ml-auto flex items-center gap-2">
              <button data-popup-trigger onClick={(e) => togglePopup('audio', e)} title="Audio track" className={"flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 " + (activePopup === 'audio' ? "bg-accent text-white" : "text-white/80 hover:bg-white/10")}>
                <Headphones className="w-4 h-4" />
              </button>

              <button data-popup-trigger onClick={(e) => {
                if (!showControls) return
                if (activeSubtitle) togglePopup('subtitles', e)
                else if (subtitleResults.length > 0) handleToggleSubtitles()
                else togglePopup('subtitles', e)
              }} title={activeSubtitle ? 'Subtitles on — click for settings' : 'Subtitles off — click to enable'} className={"flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 " + (activeSubtitle ? "bg-accent text-white" : "text-white/80 hover:bg-white/10")}>
                <Captions className="w-4 h-4" />
              </button>

              <button data-popup-trigger onClick={(e) => togglePopup('cast', e)} className={"flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 " + (isCasting ? "bg-accent text-white" : activePopup === 'cast' ? "bg-accent text-white" : "text-white/80 hover:bg-white/10")}>
                <Cast className="w-4 h-4" />
              </button>

              <button onClick={togglePiP} title="Picture-in-Picture" className={"flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 " + (isPiPActive ? "bg-accent text-white" : "text-white/80 hover:bg-white/10")}>
                <PictureInPicture2 className="w-4 h-4" />
              </button>

              <button onClick={toggleNormalization} title="Audio Normalization" className={"flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-200 " + (isNormalized ? "bg-accent text-white" : "text-white/80 hover:bg-white/10")}>
                <AudioLines className="w-4 h-4" />Normalise
              </button>
            </div>

            {isLivePlayback ? (
              <span className="ml-2 inline-flex items-center gap-1.5 text-white text-sm font-medium tabular-nums"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />LIVE</span>
            ) : (
              <span className="text-white text-sm font-medium tabular-nums ml-2">{formatTime(progress)} / {formatTime(duration)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlayerView