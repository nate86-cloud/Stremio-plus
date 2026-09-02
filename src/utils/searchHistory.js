const STORAGE_KEY = 'stremio_search_history'
const MAX_ENTRIES = 10

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (err) {
    console.warn('Failed to read search history from storage:', err)
    return []
  }
}

function writeAll(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch (err) {
    console.warn('Failed to write search history to storage:', err)
  }
}

export function getSearchHistory() {
  return readAll()
}

export function addSearchHistoryEntry(term) {
  const trimmed = term.trim()
  if (!trimmed) return readAll()
  const existing = readAll().filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase())
  const updated = [trimmed, ...existing].slice(0, MAX_ENTRIES)
  writeAll(updated)
  return updated
}

export function removeSearchHistoryEntry(term) {
  const updated = readAll().filter((entry) => entry !== term)
  writeAll(updated)
  return updated
}

export function clearSearchHistory() {
  writeAll([])
  return []
}
