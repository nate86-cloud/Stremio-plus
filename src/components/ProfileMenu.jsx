import { useMemo, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronLeft, LogOut, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useProfileContext } from '../context/ProfileContext'
import { AVATAR_STYLES, generateAvatarOptions, buildDicebearUrl } from '../utils/avatarGenerator'
import ProfileRing from './ProfileRing'
import { getAchievementSummary } from '../utils/insights'
import { getViewingLog } from '../utils/viewingLog'

const MAX_PROFILES = 4

// The Liquid Glass "regular" variant, as defined in index.css. Kept as one
// constant so every panel in this file stays visually identical to the
// rest of the app (SettingsPage, DetailModal) rather than drifting.
const GLASS_PANEL = 'relative overflow-hidden rounded-3xl glass-panel'

function getTierForProfile(profileId) {
  try {
    const log = getViewingLog(profileId)
    return getAchievementSummary(log).tier
  } catch {
    return null
  }
}

function GlassSpecular() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
  )
}

function ModalScrim({ onClose }) {
  return (
    <button
      type="button"
      aria-label="Close"
      className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default"
      onClick={onClose}
    />
  )
}

// ── Avatar picker: style switcher + generated grid ─────
function AvatarPicker({ selectedUrl, onSelect }) {
  const [activeStyle, setActiveStyle] = useState(AVATAR_STYLES[0].id)
  const [options, setOptions] = useState(() => generateAvatarOptions(AVATAR_STYLES[0].id))

  function handleStyleChange(styleId) {
    setActiveStyle(styleId)
    const next = generateAvatarOptions(styleId)
    setOptions(next)
    onSelect(next[0]?.url)
  }

  function handleReroll() {
    const next = generateAvatarOptions(activeStyle)
    setOptions(next)
    onSelect(next[0]?.url)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {AVATAR_STYLES.map((style) => (
          <button
            key={style.id}
            onClick={() => handleStyleChange(style.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
              activeStyle === style.id
                ? 'bg-accent/20 text-accent-soft border border-accent/40'
                : 'bg-white/5 text-neutral-300 border border-white/10 hover:bg-white/10'
            }`}
          >
            {style.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {options.map((avatar) => (
          <button
            key={avatar.seed}
            onClick={() => onSelect(avatar.url)}
            className={`rounded-2xl border p-2 transition-all duration-200 ${selectedUrl === avatar.url ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
          >
            <img src={avatar.url} alt={`${activeStyle} avatar`} className="h-20 w-20 rounded-full object-cover" />
          </button>
        ))}
      </div>

      <button
        onClick={handleReroll}
        className="glass-interactive mt-3 rounded-xl bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-white/10"
      >
        Shuffle options
      </button>
    </div>
  )
}

function AddProfileModal({ isOpen, onClose, onBack, onCreate, currentCount }) {
  const [step, setStep] = useState('name')
  const [name, setName] = useState('')
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState(() => generateAvatarOptions(AVATAR_STYLES[0].id, 1)[0].url)

  if (!isOpen) return null

  if (currentCount >= MAX_PROFILES) {
    return createPortal(
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <ModalScrim onClose={onClose} />
        <div className={`${GLASS_PANEL} w-full max-w-md p-6`}>
          <GlassSpecular />
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Profile limit reached</h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">You can create up to {MAX_PROFILES} profiles.</p>
          <div className="mt-6 flex justify-end">
            <button onClick={onClose} className="glass-interactive flex items-center gap-1.5 rounded-xl bg-black/5 dark:bg-white/10 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-white hover:bg-black/10 dark:hover:bg-white/15">
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  function handleClose() {
    setStep('name')
    setName('')
    onClose()
  }

  function handleCreateProfile() {
    if (!selectedAvatarUrl) return
    onCreate({ name: name.trim(), avatarUrl: selectedAvatarUrl })
    setName('')
    setStep('name')
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <ModalScrim onClose={handleClose} />
      <div className={`${GLASS_PANEL} w-full max-w-3xl p-6 max-h-[85vh] overflow-y-auto`}>
        <GlassSpecular />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="glass-interactive flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white" aria-label="Back to Manage Profiles" title="Back">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white">{step === 'name' ? 'Add Profile' : 'Choose an avatar'}</h2>
          </div>
          <button onClick={handleClose} className="glass-interactive flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white" aria-label="Close profile modal">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === 'name' ? (
          <div className="mt-6">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Profile name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter a profile name"
              className="mt-2 w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-black/10 px-4 py-3 text-sm text-neutral-900 dark:text-white outline-none placeholder:text-neutral-500 dark:placeholder:text-neutral-400 focus:border-accent"
              autoFocus
            />

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={onBack} className="glass-interactive flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/10">
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              <button
                onClick={() => setStep('avatar')}
                disabled={!name.trim()}
                className="glass-interactive rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <AvatarPicker selectedUrl={selectedAvatarUrl} onSelect={setSelectedAvatarUrl} />

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setStep('name')} className="glass-interactive flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/10">
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              <button
                onClick={handleCreateProfile}
                disabled={!selectedAvatarUrl}
                className="glass-interactive rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Create Profile
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

function ManageProfilesModal({ isOpen, onClose, onBack }) {
  const { profiles, activeProfileId, addProfile, updateProfile, removeProfile, logoutProfile, setActiveProfile } = useProfileContext()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [confirmingRemoveId, setConfirmingRemoveId] = useState(null)

  function handleCreateProfile({ name, avatarUrl }) {
    let uuid
    try {
      uuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    } catch {
      uuid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    }
    const nextId = `profile-${uuid}` 
    addProfile({
      id: nextId,
      name,
      avatarUrl,
      isWatching: 'Browsing recommendations',
      privacy: { showOnlineStatus: true, shareWatchActivity: true },
      preferences: { autoplay: true, subtitles: true },
      watchlist: [],
      history: [],
    })
  }

  function togglePrivacy(profileId, key) {
    const target = profiles.find((profile) => profile.id === profileId)
    if (!target) return
    updateProfile({ ...target, privacy: { ...target.privacy, [key]: !target.privacy[key] } })
  }

  // Logout signs the active profile out (switches to another profile
  // without deleting anything). Remove permanently deletes the profile
  // and its data, gated behind a click-to-confirm step since it's
  // irreversible.
  function handleLogout(profileId) {
    logoutProfile(profileId)
  }

  function handleRemove(profileId) {
    if (confirmingRemoveId !== profileId) {
      setConfirmingRemoveId(profileId)
      return
    }
    removeProfile(profileId)
    setConfirmingRemoveId(null)
  }

  if (!isOpen) return null

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <ModalScrim onClose={onClose} />
          <div className={`${GLASS_PANEL} w-full max-w-4xl p-6 max-h-[85vh] flex flex-col`}>
            <GlassSpecular />

            <div className="sticky top-0 z-10 -mx-6 -mt-6 px-6 py-4 flex items-center justify-between shrink-0 bg-[var(--glass-tint)]/90 backdrop-blur-[12px] rounded-t-3xl">
              <div className="flex items-center gap-3">
                <button onClick={onBack} className="glass-interactive flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white" aria-label="Back to profile menu" title="Back">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white">Manage Profiles</h2>
              </div>
              <button onClick={onClose} className="glass-interactive flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white" aria-label="Close profile management">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 overflow-y-auto">
              {profiles.map((profile) => {
                const isActive = profile.id === activeProfileId
                const isConfirmingRemove = confirmingRemoveId === profile.id

                return (
                  <div key={profile.id} className={`rounded-2xl border p-4 ${isActive ? 'border-accent/40 bg-accent/5' : 'border-white/10 bg-white/5'}`}>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <ProfileRing avatarUrl={profile.avatarUrl} alt={profile.name} tier={getTierForProfile(profile.id)} enabled={profile.preferences?.showAchievementRings ?? true} size={56} />
                        {profile.isOnline && (
                          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-green-500 border-2 border-black/60" title="Currently active" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{profile.name}</p>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">
                          {isActive ? 'Active now' : profile.privacy.shareWatchActivity ? profile.isWatching : 'Private activity'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3 text-sm text-neutral-800 dark:text-neutral-200">
                      <label className="flex items-center justify-between gap-3">
                        <span>Show Online Status</span>
                        <input type="checkbox" checked={profile.privacy.showOnlineStatus} onChange={() => togglePrivacy(profile.id, 'showOnlineStatus')} className="h-4 w-4 accent-accent" />
                      </label>
                      <label className="flex items-center justify-between gap-3">
                        <span>Share Watch Activity</span>
                        <input type="checkbox" checked={profile.privacy.shareWatchActivity} onChange={() => togglePrivacy(profile.id, 'shareWatchActivity')} className="h-4 w-4 accent-accent" />
                      </label>
                    </div>

                    <div className="mt-4 flex items-center gap-2 pt-3 border-t border-white/10">
                      {!isActive && (
                        <button
                          onClick={() => setActiveProfile(profile.id)}
                          className="glass-interactive flex-1 rounded-lg bg-black/5 dark:bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-black/10 dark:hover:bg-white/10"
                        >
                          Switch to
                        </button>
                      )}
                      {isActive && (
                        <button
                          onClick={() => handleLogout(profile.id)}
                          className="glass-interactive flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-black/5 dark:bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-black/10 dark:hover:bg-white/10"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          Log Out
                        </button>
                      )}
                      <button
                        onClick={() => handleRemove(profile.id)}
                        onBlur={() => setConfirmingRemoveId(null)}
                        className={`glass-interactive flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
                          isConfirmingRemove ? 'bg-red-500/20 text-red-600 dark:text-red-300' : 'bg-black/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300'
                        }`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {isConfirmingRemove ? 'Confirm?' : 'Remove'}
                      </button>
                    </div>
                  </div>
                )
              })}

              {profiles.length < MAX_PROFILES && (
                <button onClick={() => setIsAddOpen(true)} className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-black/10 dark:border-white/20 bg-black/5 dark:bg-white/5 text-lg font-semibold text-neutral-700 dark:text-neutral-200 transition-colors hover:bg-black/10 dark:hover:bg-white/10">
                  <span className="flex items-center gap-2"><Plus className="h-5 w-5" /> Add Profile</span>
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <AddProfileModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onBack={() => setIsAddOpen(false)}
        onCreate={handleCreateProfile}
        currentCount={profiles.length}
      />
    </>
  )
}

export default function ProfileMenu() {
  const { profiles, activeProfile, setActiveProfile } = useProfileContext()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isManageOpen, setIsManageOpen] = useState(false)
  const menuRef = useRef(null)
  const triggerRef = useRef(null)

  const onlineProfiles = useMemo(
    () => profiles.filter((profile) => profile.privacy.showOnlineStatus && profile.isOnline),
    [profiles]
  )

  // Re-render when viewing log changes so achievement rings update live
  const [logTick, setLogTick] = useState(0)
  useEffect(() => {
    const handler = () => setLogTick((t) => t + 1)
    window.addEventListener('stremio:viewing-log-changed', handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener('stremio:viewing-log-changed', handler)
      window.removeEventListener('storage', handler)
    }
  }, [])

  // Tier for active profile — respects per-profile toggle
  const activeTier = useMemo(() => {
    void logTick // touch logTick so eslint knows it's used; getTierForProfile reads localStorage externally
    return getTierForProfile(activeProfile?.id)
  }, [activeProfile?.id, logTick])
  const showActiveRing = activeProfile?.preferences?.showAchievementRings ?? true

  // Auto-close on outside click, Escape, or any navigation elsewhere in
  // the app. The dropdown isn't portaled (it's positioned relative to its
  // own trigger button, not viewport-fixed like the modals), so a click
  // anywhere that isn't the menu or its trigger closes it — this also
  // covers "changes tabs," since switching tabs elsewhere in the app is
  // itself a click outside this dropdown.
  useEffect(() => {
    if (!isMenuOpen) return

    function handlePointerDown(event) {
      if (menuRef.current?.contains(event.target)) return
      if (triggerRef.current?.contains(event.target)) return
      setIsMenuOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsMenuOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMenuOpen])

  return (
    <>
      <div className="relative">
        <button
          ref={triggerRef}
          onClick={() => setIsMenuOpen((open) => !open)}
          className="glass-clear glass-interactive flex items-center gap-2 rounded-full px-2 py-2 text-neutral-900 dark:text-white"
          aria-label="Open profile menu"
        >
          <ProfileRing
            avatarUrl={activeProfile?.avatarUrl || buildDicebearUrl('avataaars', 'guest')}
            alt={activeProfile?.name || 'Profile'}
            tier={activeTier}
            enabled={showActiveRing}
            size={36}
          />
          <span className="hidden text-sm font-medium text-neutral-900 dark:text-white sm:inline">{activeProfile?.name || 'Guest'}</span>
          <ChevronDown className={`h-4 w-4 text-neutral-600 dark:text-neutral-300 transition-transform duration-300 ${isMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {isMenuOpen && (
          <div
            ref={menuRef}
            role="menu"
            className={`${GLASS_PANEL} absolute right-0 top-24 z-50 w-[330px] max-w-[calc(100vw-2rem)] p-4 pt-0 shadow-[0_24px_64px_rgba(0,0,0,0.45),0_4px_16px_rgba(0,0,0,0.3)] max-h-[min(70vh,520px)] overflow-y-auto overscroll-contain`}
          >
            <GlassSpecular />

            <div className="sticky top-0 z-10 -mx-4 px-4 pt-4 pb-3 flex items-center justify-between bg-[var(--glass-tint)]/95 backdrop-blur-[16px] rounded-t-3xl border-b border-white/10">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">Profiles</h3>
              <button onClick={() => { setIsManageOpen(true); setIsMenuOpen(false) }} className="rounded-xl bg-black/5 dark:bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-black/10 dark:hover:bg-white/10 shrink-0">
                Manage Profiles
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {profiles.map((profile) => {
                const isSelected = profile.id === activeProfile?.id
                const showOnline = profile.privacy.showOnlineStatus
                const activity = profile.privacy.shareWatchActivity ? profile.isWatching : 'Private activity'
                const tier = getTierForProfile(profile.id)
                const showRing = profile.preferences?.showAchievementRings ?? true

                return (
                  <button
                    key={profile.id}
                    onClick={() => {
                      setActiveProfile(profile.id)
                      setIsMenuOpen(false)
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl p-2 text-left transition-colors ${isSelected ? 'bg-accent/10 ring-1 ring-accent/50' : 'hover:bg-white/5'}`}
                  >
                    <div className="flex items-center gap-3">
                      <ProfileRing avatarUrl={profile.avatarUrl} alt={profile.name} tier={tier} enabled={showRing} size={44} />
                      <div>
                        <p className="text-sm font-medium text-neutral-900 dark:text-white">{profile.name}</p>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{showOnline ? (profile.isOnline ? 'Online' : 'Offline') : 'Hidden status'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {showOnline && (
                        <span className={`h-2.5 w-2.5 rounded-full ${profile.isOnline ? 'bg-green-500' : 'bg-neutral-500'}`} />
                      )}
                      <span className="text-[11px] text-neutral-600 dark:text-neutral-300">{activity}</span>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
                <Sparkles className="h-4 w-4 text-accent" />
                Live Activity
              </div>

              <div className="mt-3 space-y-2">
                {onlineProfiles.length === 0 ? (
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">No profiles sharing live activity.</p>
                ) : (
                  onlineProfiles.map((profile) => (
                    <div key={profile.id} className="flex items-center justify-between gap-2 rounded-xl bg-black/5 dark:bg-white/5 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                        <span className="text-neutral-900 dark:text-neutral-100">{profile.name}</span>
                      </div>
                      <span className="truncate text-neutral-600 dark:text-neutral-300">{profile.isWatching}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <ManageProfilesModal
        isOpen={isManageOpen}
        onClose={() => setIsManageOpen(false)}
        onBack={() => {
          setIsManageOpen(false)
          setIsMenuOpen(true)
        }}
      />
    </>
  )
}
