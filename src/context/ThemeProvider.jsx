import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const THEME_STORAGE_KEY = 'stremio-theme-mode'

const ThemeContext = createContext({
  themeMode: 'system',
  setThemeMode: () => {},
  resolvedTheme: 'dark',
})

export function ThemeProvider({ children }) {
  const [themeMode, setThemeMode] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY)
      return (saved === 'light' || saved === 'dark' || saved === 'system') ? saved : 'system'
    } catch {
      return 'system'
    }
  })

  const [systemTheme, setSystemTheme] = useState(() => {
    try {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark'
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } catch {
      return 'dark'
    }
  })

  useEffect(() => {
    try {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (event) => {
        setSystemTheme(event.matches ? 'dark' : 'light')
      }
      // Modern browsers: addEventListener, fallback for older Safari: addListener
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', handler)
        return () => media.removeEventListener('change', handler)
      }
      if (typeof media.addListener === 'function') {
        media.addListener(handler)
        return () => media.removeListener(handler)
      }
    } catch {
      // ignore - e.g. non-browser env
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeMode)
    } catch {
      // Ignore storage errors
    }
  }, [themeMode])

  const resolvedTheme = themeMode === 'system' ? systemTheme : themeMode

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
  }, [resolvedTheme])

  const value = useMemo(
    () => ({ themeMode, setThemeMode, resolvedTheme }),
    [themeMode, resolvedTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
