const STORAGE_KEY = 'stremio_subtitle_preferences'

export const DEFAULT_SUBTITLE_PREFERENCES = {
  fontFamily: 'system-ui',
  fontSize: 'medium',
  shadow: true,
  backgroundOpacity: 0.35,
}

export function getSubtitlePreferences() {
  try {
    return {
      ...DEFAULT_SUBTITLE_PREFERENCES,
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'),
    }
  } catch (error) {
    console.warn('Failed to read subtitle preferences:', error)
    return DEFAULT_SUBTITLE_PREFERENCES
  }
}

export function saveSubtitlePreferences(preferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  // Mirror into user_settings for cloud sync (global per-account)
  try {
    const current = JSON.parse(localStorage.getItem('stremio_user_settings') || '{}')
    const updated = { ...current, subtitlePreferences: preferences }
    localStorage.setItem('stremio_user_settings', JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('stremio:user-settings-changed', { detail: updated }))
  } catch {}
}
