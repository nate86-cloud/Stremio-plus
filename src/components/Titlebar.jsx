import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import ProfileMenu from './ProfileMenu'


function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const [isFocused, setIsFocused] = useState(true)
  const [platform, setPlatform] = useState('darwin')

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI


  useEffect(() => {
    if (!isElectron || !window.electronAPI) return


    setPlatform(window.electronAPI.platform ?? 'darwin')


    window.electronAPI.isWindowMaximized?.().then(setIsMaximized).catch(() => {})


    // Both subscriptions return unsubscribe functions (see preload.cjs),
    // matching the standard addEventListener-in-useEffect cleanup pattern.
    const unsubscribeFocus = window.electronAPI.onWindowFocusChanged?.(setIsFocused) ?? (() => {})
    const unsubscribeMaximized = window.electronAPI.onWindowMaximizedChanged?.(setIsMaximized) ?? (() => {})


    return () => {
      unsubscribeFocus()
      unsubscribeMaximized()
    }
  }, [isElectron])


  const isMac = platform === 'darwin'

  // In browser preview (no electronAPI) still render the profile menu
  // — Titlebar previously returned null here, which hid ProfileMenu
  // entirely after moving it into the title bar. Keep drag/click-away
  // behaviour Electron-only, but always show the profile wrapper.
  if (!isElectron) {
    return (
      <div className="h-9 shrink-0 flex items-center justify-between select-none relative overflow-visible z-20">
        <div className="w-3 shrink-0" aria-hidden="true" />
        <div className="flex-1 h-full" />
        <div className="h-full flex items-center px-2 shrink-0 relative overflow-visible">
          <ProfileMenu />
        </div>
      </div>
    )
  }


  function handleDoubleClick() {
    // Double-clicking an empty title bar area toggles maximize — standard
    // behavior on both macOS and Windows that isn't automatic once the
    // native frame (and its built-in double-click handling) is gone.
    window.electronAPI?.toggleMaximizeWindow?.()
  }


  return (
    <div
      onDoubleClick={handleDoubleClick}
      className={`h-9 shrink-0 flex items-center justify-between select-none relative overflow-visible z-20 transition-opacity duration-300 ${
        isFocused ? 'opacity-100' : 'opacity-60'
      }`}
      style={{ WebkitAppRegion: 'drag' }}
    >
      {isMac ? (
        // macOS: hiddenInset (see electron.js) already renders real
        // native traffic lights at the OS-controlled inset position —
        // drawing custom ones here would duplicate/misalign with them.
        // This reserves matching left space so app content (e.g. a
        // sidebar toggle or logo) doesn't render underneath them.
        <div className="w-20 shrink-0" aria-hidden="true" />
      ) : (
        <div className="w-3 shrink-0" aria-hidden="true" />
      )}


      {/* Center region intentionally left empty and draggable — this is
           where native title bars would show the window title; this app
           has its own in-content branding elsewhere, so it stays blank
           rather than duplicating a title. */}
      <div className="flex-1 h-full" />

      {/* Profile — WebkitAppRegion: 'no-drag' wrapper is mandatory:
          ProfileMenu's own button has no idea it's inside a draggable
          title bar; without the wrapper clicks would drag the window
          instead of opening the menu. Placed right before window
          controls after flex-1 spacer — conventional top-right. On mac
          the w-20 reservation stays, profile becomes only item on right. */}
      <div className="h-full flex items-center px-2 shrink-0 relative overflow-visible" style={{ WebkitAppRegion: 'no-drag' }}>
        <ProfileMenu />
      </div>

      {!isMac && (
        <div className="flex items-stretch h-full shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
          <button
            type="button"
            onClick={() => window.electronAPI?.minimizeWindow?.()}
            aria-label="Minimize"
            className="w-11 h-full flex items-center justify-center text-neutral-400 hover:bg-white/10 hover:text-white transition-colors duration-150"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => window.electronAPI?.toggleMaximizeWindow?.()}
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
            className="w-11 h-full flex items-center justify-center text-neutral-400 hover:bg-white/10 hover:text-white transition-colors duration-150"
          >
            {isMaximized ? <Copy className="w-3.5 h-3.5 -scale-x-100" /> : <Square className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => window.electronAPI?.closeWindow?.()}
            aria-label="Close"
            className="w-11 h-full flex items-center justify-center text-neutral-400 hover:bg-red-500 hover:text-white transition-colors duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}


export default TitleBar