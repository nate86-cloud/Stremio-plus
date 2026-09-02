import { useUpdater } from '../hooks/useUpdater'
import { Download, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'

export default function UpdaterBanner() {
  const { status, progress, version, quitAndInstall, isElectron } = useUpdater()
  const [dismissed, setDismissed] = useState(false)

  if (!isElectron) return null
  if (dismissed) return null
  // Show banner only for actionable states
  const showAvailable = status === 'update-available'
  const showDownloaded = status === 'update-downloaded'
  const showDownloading = status === 'download-progress'
  const showError = status === 'error'

  if (!showAvailable && !showDownloaded && !showDownloading && !showError) return null

  return (
    <div className="mx-4 mt-3 mb-2 glass-panel rounded-2xl px-5 py-3 flex items-center gap-4 border border-accent/20 shadow-lg animate-in fade-in">
      <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
        {showDownloading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      </div>

      <div className="flex-1 min-w-0 text-sm">
        {showAvailable && (
          <>
            <p className="font-medium text-neutral-900 dark:text-white">Update available{version ? ` — v${version}` : ''}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Downloading in background…</p>
          </>
        )}
        {showDownloading && (
          <>
            <p className="font-medium text-neutral-900 dark:text-white">Downloading update{version ? ` — v${version}` : ''}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {progress?.percent != null ? `${progress.percent.toFixed(1)}%` : ''} {progress?.bytesPerSecond ? `· ${(progress.bytesPerSecond / 1024).toFixed(0)} KB/s` : ''}
            </p>
          </>
        )}
        {showDownloaded && (
          <>
            <p className="font-medium text-neutral-900 dark:text-white">Update ready{version ? ` — v${version}` : ''}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Restart to install the latest version.</p>
          </>
        )}
        {showError && <p className="text-xs text-red-500">Update check failed. Will retry later.</p>}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {showDownloaded && (
          <button
            onClick={quitAndInstall}
            className="glass-capsule glass-interactive px-4 py-2 text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
          >
            Restart now
          </button>
        )}
        {showAvailable && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400 px-2">Installing on quit…</span>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
