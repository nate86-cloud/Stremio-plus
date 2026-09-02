import { useEffect, useRef } from 'react'

const MAX_RETRIES = 8
const MAX_BACKOFF_MS = 30000

// Recover transient network stalls without replacing the player or surfacing
// an error screen. The current position is restored after each reload.
export function useMediaRecovery(videoRef, source) {
  const retryTimerRef = useRef(null)
  const retryCountRef = useRef(0)
  const userPausedRef = useRef(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !source) return undefined

    function clearRetryTimer() {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }

    function scheduleRecovery() {
      if (userPausedRef.current || video.ended || retryTimerRef.current) return
      if (retryCountRef.current >= MAX_RETRIES) return

      const retryNumber = retryCountRef.current
      retryCountRef.current += 1
      const delay = Math.min(1000 * (2 ** retryNumber), MAX_BACKOFF_MS)

      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null
        const currentTime = video.currentTime
        video.load()
        if (Number.isFinite(currentTime) && currentTime > 0) {
          video.currentTime = currentTime
        }
        const playAttempt = video.play()
        if (playAttempt) {
          playAttempt.catch((error) => {
            console.warn('Media recovery play attempt failed:', error.message)
          })
        }
      }, delay)
    }

    function handleHealthyPlayback() {
      retryCountRef.current = 0
      clearRetryTimer()
    }

    function handlePlay() {
      userPausedRef.current = false
    }

    function handlePause() {
      if (!video.ended) userPausedRef.current = true
    }

    video.addEventListener('error', scheduleRecovery)
    video.addEventListener('stalled', scheduleRecovery)
    video.addEventListener('waiting', scheduleRecovery)
    video.addEventListener('playing', handleHealthyPlayback)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)

    return () => {
      clearRetryTimer()
      video.removeEventListener('error', scheduleRecovery)
      video.removeEventListener('stalled', scheduleRecovery)
      video.removeEventListener('waiting', scheduleRecovery)
      video.removeEventListener('playing', handleHealthyPlayback)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
    }
  }, [videoRef, source])
}
