const STORAGE_KEY = 'stremio_spatial_audio_enabled'

export function isSpatialAudioEnabled() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'true'
  } catch {
    return false
  }
}

export function setSpatialAudioEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch {
    // Ignore storage errors
  }
}
