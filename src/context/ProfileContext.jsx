import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'stremio_profile_store'
const ACTIVE_KEY = 'stremio_active_profile_id'


function createDefaultProfile() {
  return {
    id: 'guest-profile',
    name: 'Guest',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=guest-profile',
    isOnline: true,
    isWatching: 'Browsing recommendations',
    privacy: {
      showOnlineStatus: true,
      shareWatchActivity: true,
    },
    preferences: {
      autoplay: true,
      subtitles: true,
      showAchievementRings: true,
    },
    watchlist: [],
    history: [],
  }
}


function sanitizeProfile(profile) {
  return {
    ...createDefaultProfile(),
    ...profile,
    privacy: {
      showOnlineStatus: profile?.privacy?.showOnlineStatus ?? true,
      shareWatchActivity: profile?.privacy?.shareWatchActivity ?? true,
    },
    preferences: {
      autoplay: profile?.preferences?.autoplay ?? true,
      subtitles: profile?.preferences?.subtitles ?? true,
      showAchievementRings: profile?.preferences?.showAchievementRings ?? true,
      ...profile?.preferences,
    },
    watchlist: Array.isArray(profile?.watchlist) ? profile.watchlist : [],
    history: Array.isArray(profile?.history) ? profile.history : [],
  }
}


const ProfileContext = createContext(null)


export function ProfileProvider({ children }) {
  const [profiles, setProfiles] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return [createDefaultProfile()]
      const parsed = JSON.parse(raw)
      const list = Array.isArray(parsed) ? parsed : []
      return list.length > 0 ? list.map(sanitizeProfile) : [createDefaultProfile()]
    } catch {
      return [createDefaultProfile()]
    }
  })


  const [activeProfileId, setActiveProfileId] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY) || 'guest-profile'
    } catch {
      return 'guest-profile'
    }
  })


  // Keep isOnline strictly tied to activeProfileId — only the active profile is online
  useEffect(() => {
    setProfiles((current) => {
      const needsUpdate = current.some((p) => (p.id === activeProfileId) !== !!p.isOnline)
      if (!needsUpdate) return current
      return current.map((p) => (p.id === activeProfileId ? { ...p, isOnline: true } : { ...p, isOnline: false }))
    })
  }, [activeProfileId])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
    localStorage.setItem(ACTIVE_KEY, activeProfileId)
    try { window.dispatchEvent(new CustomEvent('stremio:profiles-changed', { detail: { profiles, activeProfileId } })) } catch {}
  }, [profiles, activeProfileId])

  // Hydrate from cloud pull (SupabaseContext writes to localStorage then dispatches this)
  useEffect(() => {
    function handleProfilesPulled() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        const list = raw ? JSON.parse(raw) : []
        const active = localStorage.getItem(ACTIVE_KEY) || 'guest-profile'
        if (Array.isArray(list) && list.length > 0) {
          setProfiles(list.map(sanitizeProfile))
          setActiveProfileId(active)
        }
      } catch {}
    }
    window.addEventListener('stremio:profiles-pulled', handleProfilesPulled)
    return () => window.removeEventListener('stremio:profiles-pulled', handleProfilesPulled)
  }, [])


  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) || profiles[0] || createDefaultProfile(),
    [profiles, activeProfileId]
  )


  const hydratedProfileData = useMemo(() => ({
    watchlist: activeProfile.watchlist || [],
    history: activeProfile.history || [],
    preferences: activeProfile.preferences || {},
  }), [activeProfile])


  const addProfile = useCallback((nextProfile) => {
    const profile = sanitizeProfile(nextProfile)
    setProfiles((current) => {
      const next = [...current, profile]
      return next.slice(0, 4)
    })
    setActiveProfileId(profile.id)
    return profile
  }, [])

  const updateProfile = useCallback((updatedProfile) => {
    setProfiles((current) =>
      current.map((profile) => (profile.id === updatedProfile.id ? sanitizeProfile(updatedProfile) : profile))
    )
  }, [])

  const removeProfile = useCallback((profileId) => {
    setProfiles((current) => {
      const next = current.filter((profile) => profile.id !== profileId)
      if (next.length === 0) {
        const fallback = createDefaultProfile()
        setActiveProfileId(fallback.id)
        return [fallback]
      }
      if (activeProfileId === profileId) {
        setActiveProfileId(next[0].id)
      }
      return next
    })
  }, [activeProfileId])

  const setActiveProfile = useCallback((profileId) => {
    const exists = profiles.some((profile) => profile.id === profileId)
    if (exists) {
      setActiveProfileId(profileId)
    }
  }, [profiles])

  const logoutProfile = useCallback((profileId) => {
    // Switch to another profile (not deletion)
    const otherProfiles = profiles.filter((profile) => profile.id !== profileId)
    if (otherProfiles.length > 0) {
      setActiveProfileId(otherProfiles[0].id)
    }
  }, [profiles])


  const value = useMemo(() => ({
    profiles,
    activeProfile,
    activeProfileId,
    hydratedProfileData,
    addProfile,
    updateProfile,
    removeProfile,
    setActiveProfile,
    logoutProfile,
  }), [profiles, activeProfile, activeProfileId, hydratedProfileData, addProfile, updateProfile, removeProfile, setActiveProfile, logoutProfile])


  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}


export function useProfileContext() {
  const context = useContext(ProfileContext)
  if (!context) {
    throw new Error('useProfileContext must be used within a ProfileProvider')
  }
  return context
}