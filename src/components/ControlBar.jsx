import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Clock } from 'lucide-react'
import { getSearchHistory, addSearchHistoryEntry, removeSearchHistoryEntry } from '../utils/searchHistory'

const filters = ['All', 'Movies', 'Series', 'Live TV', 'Watchlist']

function ControlBar({ searchQuery, onSearchChange, activeFilter, onFilterChange }) {
  const [searchFocused, setSearchFocused] = useState(false)
  const [history, setHistory] = useState(() => getSearchHistory())
  const [draft, setDraft] = useState(searchQuery)
  const searchWrapRef = useRef(null)
  const dropdownRef = useRef(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })

  useEffect(() => {
    setDraft(searchQuery)
  }, [searchQuery])

  const filteredHistory = draft.trim()
    ? history.filter((t) => t.toLowerCase().includes(draft.trim().toLowerCase()))
    : history
  const showHistoryDropdown = searchFocused && filteredHistory.length > 0

  function commitSearch(term) {
    const trimmed = term.trim()
    if (!trimmed) {
      onSearchChange('')
      setDraft('')
      return
    }
    setHistory(addSearchHistoryEntry(trimmed))
    onSearchChange(trimmed)
    setDraft(trimmed)
    setSearchFocused(false)
  }

  function handleRemoveHistoryEntry(term) {
    setHistory(removeSearchHistoryEntry(term))
  }

  function handleDraftSubmit() {
    commitSearch(draft)
  }

  // Position dropdown in viewport coordinates off searchWrapRef (inner pill),
  // same pattern ProfileMenu uses — portal sidesteps outer flex sizing
  useEffect(() => {
    if (!showHistoryDropdown) return
    function updatePos() {
      const rect = searchWrapRef.current?.getBoundingClientRect()
      if (!rect) return
      setDropdownPos({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      })
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [showHistoryDropdown, filteredHistory.length])

  // Outside-click via mousedown (not blur timeout) — avoids race where
  // click on history row loses to blur and dropdown vanishes before commit
  useEffect(() => {
    if (!showHistoryDropdown) return
    function handlePointerDown(e) {
      if (searchWrapRef.current?.contains(e.target)) return
      if (dropdownRef.current?.contains(e.target)) return
      setSearchFocused(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [showHistoryDropdown])

  return (
    <div
      className={`glass-clear flex items-center gap-2 px-2 py-2 w-full max-w-xl mx-auto rounded-3xl transition-shadow duration-300 ${
        searchFocused ? 'shadow-lg shadow-accent/20' : ''
      }`}
    >
      <div
        ref={searchWrapRef}
        className={`relative flex items-center gap-2 rounded-full px-4 py-2 flex-1 transition-colors duration-200 ${
          searchFocused ? 'bg-black/5 dark:bg-white/10 ring-1 ring-accent/40' : ''
        }`}
      >
        <button
          type="button"
          onClick={handleDraftSubmit}
          aria-label="Search"
          className="shrink-0 p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors duration-200"
        >
          <Search
            className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
              searchFocused ? 'text-accent' : 'text-neutral-500 dark:text-neutral-400'
            }`}
          />
        </button>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleDraftSubmit()
            }
            if (e.key === 'Escape') {
              setSearchFocused(false)
            }
          }}
          placeholder="Search movies & shows..."
          onFocus={() => setSearchFocused(true)}
          className="bg-transparent outline-none text-sm w-full placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
        />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            setDraft('')
            onSearchChange('')
          }}
          className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-all duration-200 will-change-transform ${
            draft || searchQuery
              ? 'opacity-100 scale-100 text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10'
              : 'opacity-0 scale-75 pointer-events-none text-transparent'
          }`}
          title="Clear search"
          aria-hidden={!draft && !searchQuery}
          tabIndex={draft || searchQuery ? 0 : -1}
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {showHistoryDropdown &&
          createPortal(
            <div
              ref={dropdownRef}
              style={{
                top: dropdownPos.top,
                left: dropdownPos.left,
                width: dropdownPos.width,
              }}
              className="fixed z-50 glass-panel rounded-2xl overflow-hidden py-1.5 max-h-64 overflow-y-auto shadow-xl"
            >
              {filteredHistory.map((term) => (
                <div
                  key={term}
                  className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors duration-150 cursor-pointer"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    commitSearch(term)
                  }}
                >
                  <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  <span className="text-sm flex-1 truncate">{term}</span>
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleRemoveHistoryEntry(term)
                    }}
                    className="text-neutral-400 hover:text-neutral-700 dark:hover:text-white shrink-0 p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                    title="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>,
            document.body
          )}
      </div>

      <div className="w-px h-6 bg-black/10 dark:bg-white/10 shrink-0" />

      <div className="flex items-center gap-1 shrink-0">
        {filters.map((filter) => (
          <button
            key={filter}
            onClick={() => onFilterChange(filter)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
              activeFilter === filter
                ? 'bg-accent text-white shadow-md shadow-accent/40'
                : 'text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>
    </div>
  )
}

export default ControlBar
