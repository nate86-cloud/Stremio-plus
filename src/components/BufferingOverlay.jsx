import { X } from 'lucide-react'
import { MIN_BUFFER_PERCENT_BEFORE_PLAYBACK } from '../utils/streamingServer'


// Circular progress ring. Percent is expressed relative to the pre-buffer
// threshold (not 0-100 of the whole file) so the ring visibly completes
// right as playback is about to start, rather than looking like it's
// stuck near-empty for the whole wait.
function ProgressRing({ percent }) {
  const size = 96
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(Math.max(percent, 0), 100)
  const offset = circumference - (clamped / 100) * circumference


  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-white/10"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="text-accent transition-[stroke-dashoffset] duration-300 ease-[var(--ease-spring-soft)]"
      />
    </svg>
  )
}


function formatSpeed(bytesPerSec) {
  if (bytesPerSec === null) return null
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
  return `${bytesPerSec.toFixed(0)} B/s`
}


// stats: the honest, defensively-extracted { percent, downloadSpeedBytesPerSec, peers, seeds }
// from streamingServer.js's extractStreamStats — every field may be null,
// and null fields are simply omitted from display rather than shown as 0.
// statusMessage: short human status line ("Connecting to peers...", etc.)
// onCancel: required — wired to a real AbortController in the caller, so
// this genuinely stops the buffering poll, not just hides the overlay.
function BufferingOverlay({ stats, statusMessage, onCancel }) {
  const percent = stats?.percent ?? 0
  // Progress relative to the pre-buffer threshold, so the ring reads as
  // "how close to playback-ready," not "how much of the whole file."
  const ringPercent = Math.min((percent / MIN_BUFFER_PERCENT_BEFORE_PLAYBACK) * 100, 100)
  const speedLabel = formatSpeed(stats?.downloadSpeedBytesPerSec ?? null)


  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />


      <div className="glass-panel relative z-10 w-full max-w-sm rounded-3xl p-8 flex flex-col items-center text-center">
        <div className="relative flex items-center justify-center mb-5">
          <ProgressRing percent={ringPercent} />
          <span className="absolute text-lg font-semibold text-white">
            {percent.toFixed(1)}%
          </span>
        </div>


        <p className="text-sm font-medium text-white mb-1">{statusMessage || 'Buffering stream...'}</p>
        <p className="text-xs text-neutral-400 mb-5">
          Preparing for smooth playback ({MIN_BUFFER_PERCENT_BEFORE_PLAYBACK}% pre-buffer)
        </p>


        {/* P2P metrics — each row only renders when the server actually
            reported that field. This app has no live download-speed data
            unless the streaming server's /stats.json genuinely includes
            it (unconfirmed across server versions); showing a fabricated
            number here would repeat exactly the "Simulated" stats mistake
            already found and removed elsewhere in this app. */}
        {(speedLabel || stats?.peers !== null || stats?.seeds !== null) && (
          <div className="w-full grid grid-cols-3 gap-2 mb-6 text-xs">
            {speedLabel && (
              <div className="rounded-xl bg-white/5 py-2">
                <p className="text-neutral-400">Speed</p>
                <p className="text-white font-medium mt-0.5">{speedLabel}</p>
              </div>
            )}
            {stats?.peers !== null && stats?.peers !== undefined && (
              <div className="rounded-xl bg-white/5 py-2">
                <p className="text-neutral-400">Peers</p>
                <p className="text-white font-medium mt-0.5">{stats.peers}</p>
              </div>
            )}
            {stats?.seeds !== null && stats?.seeds !== undefined && (
              <div className="rounded-xl bg-white/5 py-2">
                <p className="text-neutral-400">Seeds</p>
                <p className="text-white font-medium mt-0.5">{stats.seeds}</p>
              </div>
            )}
          </div>
        )}


        <button
          type="button"
          onClick={onCancel}
          className="glass-interactive flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-neutral-200 hover:bg-white/10 transition-colors duration-200"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  )
}


export default BufferingOverlay