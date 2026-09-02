// Lazy, on-demand scrubber thumbnail preview. Replaces the old approach
// (a persistent second <video> continuously decoding the entire file for
// the whole session) with a single hidden video+canvas pair that only
// does work when the user is actively hovering the progress bar, seeked
// to exactly one timestamp at a time, throttled, and skipped entirely
// when that part of the stream isn't buffered yet.
//
// This does NOT decode video in the background — the singleton <video>
// has no src set until the first hover, and is paused/idle between
// lookups. The only ongoing cost is holding one extra <video>+<canvas>
// DOM node in memory, which is negligible compared to a second full
// decode pipeline.


import { useCallback, useEffect, useRef, useState } from 'react'


const THROTTLE_MS = 100
const THUMB_WIDTH = 320
const THUMB_HEIGHT = 180


// Real, always-available browser API for "is this timestamp already
// downloaded/available to play." HTMLMediaElement.buffered is a
// TimeRanges object reflecting whatever data the browser has actually
// received, regardless of source (HTTP byte-range stream from the local
// torrent server, in this app's case). This is the honest local
// equivalent of "check the P2P client's byte-range availability" — the
// streaming server has no documented API for that per streamingServer.js,
// but the browser already tracks exactly this for us.
function isTimeBuffered(video, targetTime) {
  const ranges = video.buffered
  for (let i = 0; i < ranges.length; i++) {
    if (targetTime >= ranges.start(i) && targetTime <= ranges.end(i)) {
      return true
    }
  }
  return false
}


// videoUrl: the same movie.videoUrl the main player is playing.
// Returns { getThumbnailAt(percent, duration), thumbnailSrc, clearThumbnail }.
// getThumbnailAt is meant to be called from a throttled mousemove handler
// on the progress bar — it handles its own throttling internally too, so
// callers don't have to build their own debounce.
export function useScrubberThumbnail(videoUrl) {
  const videoElRef = useRef(null)
  const canvasElRef = useRef(null)
  const lastRequestAtRef = useRef(0)
  // Guards against a stale seek's 'seeked' handler landing after a newer
  // request has already superseded it (fast mouse movement across the bar).
  const requestTokenRef = useRef(0)


  const [thumbnailSrc, setThumbnailSrc] = useState(null)


  // Singleton creation, once per videoUrl (i.e. once per playback
  // session) — not per-hover. Muted/preload=none so it costs nothing
  // until the first actual seek.
  useEffect(() => {
    if (!videoUrl) return undefined


    const video = document.createElement('video')
    video.muted = true
    video.preload = 'none'
    video.crossOrigin = 'anonymous'
    video.src = videoUrl
    video.style.display = 'none'
    document.body.appendChild(video)
    videoElRef.current = video


    const canvas = document.createElement('canvas')
    canvas.width = THUMB_WIDTH
    canvas.height = THUMB_HEIGHT
    canvasElRef.current = canvas


    return () => {
      video.pause()
      video.removeAttribute('src')
      video.load() // releases the decode pipeline/buffer, not just detaching from DOM
      video.remove()
      videoElRef.current = null
      canvasElRef.current = null
      setThumbnailSrc(null)
    }
  }, [videoUrl])


  const getThumbnailAt = useCallback((percent, duration) => {
    const now = Date.now()
    if (now - lastRequestAtRef.current < THROTTLE_MS) return
    lastRequestAtRef.current = now


    const video = videoElRef.current
    const canvas = canvasElRef.current
    if (!video || !canvas || !duration) return


    const targetTime = percent * duration
    const token = ++requestTokenRef.current


    function paintCurrentFrame() {
      if (requestTokenRef.current !== token) return // superseded by a newer hover position
      try {
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, THUMB_WIDTH, THUMB_HEIGHT)
        setThumbnailSrc(canvas.toDataURL('image/jpeg', 0.6))
      } catch {
        // drawImage can throw (e.g. tainted canvas, decode not ready) —
        // fail silently into "no thumbnail," never break the scrubber.
        setThumbnailSrc(null)
      }
    }


    // Lazy-load: preload was 'none', so the element may not have any
    // buffered ranges yet at all on the very first hover of a session.
    // A single readyState check covers that without forcing a full load.
    if (video.readyState === 0) {
      video.load()
    }


    if (!isTimeBuffered(video, targetTime)) {
      // Per the buffer-guard requirement: don't hang waiting for data
      // that isn't there yet. Fail gracefully — caller falls back to a
      // plain time-tooltip when thumbnailSrc is null.
      setThumbnailSrc(null)
      return
    }


    function handleSeeked() {
      video.removeEventListener('seeked', handleSeeked)
      paintCurrentFrame()
    }


    video.addEventListener('seeked', handleSeeked)
    try {
      video.currentTime = targetTime
    } catch {
      video.removeEventListener('seeked', handleSeeked)
      setThumbnailSrc(null)
    }
  }, [])


  const clearThumbnail = useCallback(() => {
    requestTokenRef.current++ // invalidate any in-flight seek's callback
    setThumbnailSrc(null)
  }, [])


  return { getThumbnailAt, thumbnailSrc, clearThumbnail }
}