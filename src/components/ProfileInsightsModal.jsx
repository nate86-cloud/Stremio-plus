import { useMemo, useEffect, useState } from 'react'
import { X, Clock, Flame, User, ShieldCheck, LogOut, History, RefreshCw } from 'lucide-react'
import {
  getTotalWatchMinutes,
  formatWatchTime,
  getCurrentStreak,
  getHeatMapGrid,
  getGenreBreakdown,
  getBadges,
  getAchievementSummary,
  GENRE_COLORS,
} from '../utils/insights'
import { getViewingLog } from '../utils/viewingLog'
import { getFallbackAvatarGradient } from '../utils/avatars'
import { useProfileContext } from '../context/ProfileContext'
import { mapAchievementsToRingStyle } from '../utils/achievementRingStyles'


function getRecentActivity(log, limit = 20) {
  const entries = []
  for (const [dateKey, day] of Object.entries(log)) {
    for (const session of day.sessions || []) {
      entries.push({ ...session, dateKey })
    }
  }
  return entries
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit)
}


function formatRelativeTime(timestamp) {
  const then = new Date(timestamp)
  const now = new Date()
  const diffMs = now - then
  const diffMins = Math.round(diffMs / 60000)


  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.round(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}


function GlowStat({ icon: Icon, label, value }) {
  return (
    <div
      className="relative rounded-3xl p-6 overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, rgba(99,60,255,0.16), rgba(10,132,255,0.10))',
        boxShadow: '0 8px 32px rgba(99,60,255,0.15), inset 0 1px 0 rgba(255,255,255,0.12)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-40 pointer-events-none"
        style={{ background: 'radial-gradient(circle, var(--color-accent-soft), transparent 70%)' }}
      />
      <div className="relative">
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-4 text-accent-soft">
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-3xl font-semibold tracking-tight text-white mb-1">{value}</p>
        <p className="text-xs text-white/60">{label}</p>
      </div>
    </div>
  )
}


function GenreGlowBar({ breakdown }) {
  return (
    <div
      className="rounded-3xl p-6"
      style={{
        background: 'linear-gradient(145deg, rgba(99,60,255,0.14), rgba(10,132,255,0.08))',
        boxShadow: '0 8px 32px rgba(99,60,255,0.12), inset 0 1px 0 rgba(255,255,255,0.1)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <p className="text-sm font-medium text-white mb-4">Most-Watched Genres</p>


      {breakdown.length === 0 ? (
        <p className="text-xs text-white/50">Watch a few titles and your top genres will show up here.</p>
      ) : (
        <>
          <div className="w-full h-3 rounded-full overflow-hidden flex bg-white/10 mb-4">
            {breakdown.map((g, i) => (
              <div
                key={g.genre}
                style={{ width: `${g.percent}%`, backgroundColor: GENRE_COLORS[i % GENRE_COLORS.length] }}
                title={`${g.genre}: ${g.percent.toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {breakdown.map((g, i) => (
              <div key={g.genre} className="flex items-center gap-1.5 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: GENRE_COLORS[i % GENRE_COLORS.length] }} />
                <span className="text-white/80">{g.genre}</span>
                <span className="text-white/40">{g.percent.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}


function HabitsHeatMap({ grid, max, dayLabels, blockLabels }) {
  return (
    <div
      className="rounded-3xl p-6"
      style={{
        background: 'linear-gradient(145deg, rgba(99,60,255,0.14), rgba(10,132,255,0.08))',
        boxShadow: '0 8px 32px rgba(99,60,255,0.12), inset 0 1px 0 rgba(255,255,255,0.1)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <p className="text-sm font-medium text-white mb-4">Viewing Habits</p>
      <div className="overflow-x-auto">
        <div className="min-w-[420px]">
          <div className="grid grid-cols-[36px_repeat(6,1fr)] gap-1.5 mb-1.5">
            <div />
            {blockLabels.map((label) => (
              <div key={label} className="text-[9px] text-white/40 text-center">{label}</div>
            ))}
          </div>
          {dayLabels.map((day, dayIdx) => (
            <div key={day} className="grid grid-cols-[36px_repeat(6,1fr)] gap-1.5 mb-1.5">
              <div className="text-[10px] text-white/50 flex items-center">{day}</div>
              {grid[dayIdx].map((minutes, blockIdx) => {
                const intensity = minutes / max
                return (
                  <div
                    key={blockIdx}
                    title={`${day} ${blockLabels[blockIdx]}: ${Math.round(minutes)} min`}
                    className="aspect-square rounded-md transition-colors duration-300"
                    style={{
                      background:
                        intensity === 0
                          ? 'rgba(255,255,255,0.06)'
                          : `color-mix(in oklab, var(--color-accent-soft) ${Math.max(intensity * 100, 15)}%, transparent)`,
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


function BadgeChip({ badge }) {
  return (
    <div
      className={
        'shrink-0 flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full text-xs font-medium ' +
        (badge.unlocked
          ? 'bg-accent/20 text-accent-soft border border-accent/40 shadow-[0_0_16px] shadow-accent/30'
          : 'bg-white/5 text-white/40 border border-white/10')
      }
      title={badge.description}
    >
      <span
        className={
          'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ' +
          (badge.unlocked ? 'bg-accent text-white' : 'bg-white/10 text-white/40')
        }
      >
        {badge.name.charAt(0)}
      </span>
      {badge.name}
    </div>
  )
}


function ActivityHistoryList({ entries }) {
  if (entries.length === 0) {
    return (
      <div
        className="rounded-3xl p-8 text-center"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <History className="w-8 h-8 text-white/30 mx-auto mb-3" />
        <p className="text-sm text-white/50">Your recent viewing activity will appear here.</p>
      </div>
    )
  }


  return (
    <div
      className="rounded-3xl overflow-hidden divide-y divide-white/5"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {entries.map((entry, i) => (
        <div key={`${entry.timestamp}-${i}`} className="flex items-center gap-4 px-5 py-3.5">
          <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent-soft flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{entry.title || 'Untitled'}</p>
            <p className="text-xs text-white/40 truncate">
              {(entry.genres && entry.genres.length ? entry.genres.join(', ') : 'Uncategorized')} · {Math.round(entry.minutes)} min
            </p>
          </div>
          <span className="text-xs text-white/40 shrink-0">{formatRelativeTime(entry.timestamp)}</span>
        </div>
      ))}
    </div>
  )
}


function ProfileInsightsModal({ isOpen, onClose, user, onLogout, onSync, isSyncing, syncMessage }) {
  const { activeProfileId } = useProfileContext()
  const [logTick, setLogTick] = useState(0)

  // Per-profile live updates — viewing log is stored per profileId
  // (viewingLog.js: storageKeyFor(profileId)), so insights/achievements
  // must recompute when that profile's log changes, not just when the
  // modal opens. This mirrors ProfileMenu's ring logic.
  useEffect(() => {
    const bump = () => setLogTick((t) => t + 1)
    window.addEventListener('stremio:viewing-log-changed', bump)
    window.addEventListener('storage', bump)
    window.addEventListener('stremio:profiles-changed', bump)
    return () => {
      window.removeEventListener('stremio:viewing-log-changed', bump)
      window.removeEventListener('storage', bump)
      window.removeEventListener('stremio:profiles-changed', bump)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('profile-hub-open')
      document.body.style.overflow = 'hidden'
    } else {
      document.body.classList.remove('profile-hub-open')
      document.body.style.overflow = ''
    }
    return () => {
      document.body.classList.remove('profile-hub-open')
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Strictly per-profile: log, tier and all derived stats are keyed by
  // activeProfileId. Switching profiles (activeProfileId change) or
  // logging new minutes (logTick) recomputes. This ties unlocks directly
  // to the selected profile, not a global store.
  const log = useMemo(() => {
    void logTick // force recompute when viewing log changes (external storage, not React state)
    return isOpen ? getViewingLog(activeProfileId) : {}
  }, [isOpen, activeProfileId, logTick])
  const totalMinutes = useMemo(() => getTotalWatchMinutes(log), [log])
  const streak = useMemo(() => getCurrentStreak(log), [log])
  const heatMap = useMemo(() => getHeatMapGrid(log), [log])
  const genreBreakdown = useMemo(() => getGenreBreakdown(log), [log])
  const badges = useMemo(() => getBadges(log), [log])
  const achievement = useMemo(() => getAchievementSummary(log), [log])
  const recentActivity = useMemo(() => getRecentActivity(log), [log])


  const hasRealAvatar = !!(user && user.avatar)
  const fallbackGradient = user ? getFallbackAvatarGradient(user._id || user.email) : null


  return (
    <div
      className={
        'fixed inset-0 z-[100] transition-opacity duration-500 ease-[cubic-bezier(0.25,1,0.4,1)] ' +
        (isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')
      }
      aria-hidden={!isOpen}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 20% 10%, rgba(99,60,255,0.35), transparent 55%), radial-gradient(circle at 85% 85%, rgba(10,132,255,0.28), transparent 55%), #07070b',
        }}
      />


      <div
        className={
          'relative h-full w-full overflow-y-auto transition-transform duration-500 ease-[cubic-bezier(0.25,1,0.4,1)] ' +
          (isOpen ? 'translate-y-0' : 'translate-y-6')
        }
      >
        <div className="max-w-4xl mx-auto px-6 sm:px-10 py-10">
          <div className="flex items-start justify-between mb-10">
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center shrink-0 shadow-[0_0_24px] shadow-accent/30"
                style={!hasRealAvatar && user ? { backgroundImage: fallbackGradient?.background } : { background: 'rgba(255,255,255,0.08)' }}
              >
                {hasRealAvatar ? (
                  <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-7 h-7 text-white/70" />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-white leading-tight">
                  {user ? (user.email ? user.email.replace(/(.{2}).+(@.+)/, '$1***$2') : 'Signed in') : 'Guest'}
                </h1>
                <div className="flex items-center gap-1.5 text-xs text-white/50 mt-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-accent-soft" />
                  {user ? 'Stremio Account · Connected' : 'Not signed in'}
                  <span className="text-white/30">·</span>
                  <span className="font-medium" style={{ color: mapAchievementsToRingStyle(achievement.tier).gradientStops[0] }}>
                    {achievement.tierLabel} Tier
                  </span>
                </div>
              </div>
            </div>


            <div className="flex items-center gap-2">
              {user && onSync && (
                <button
                  onClick={onSync}
                  disabled={isSyncing}
                  className="hidden sm:flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors duration-200 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Syncing...' : 'Sync Add-ons & Data'}
                </button>
              )}
              {user && onLogout && (
                <button
                  onClick={onLogout}
                  className="hidden sm:flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors duration-200"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Log Out
                </button>
              )}
              <button
                onClick={onClose}
                className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors duration-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          {syncMessage && <p className="mb-6 text-sm text-white/60">{syncMessage}</p>}


          <div className="grid grid-cols-2 gap-4 mb-6">
            <GlowStat icon={Clock} label="Total Watch Time" value={formatWatchTime(totalMinutes)} />
            <GlowStat icon={Flame} label="Current Streak" value={`${streak} ${streak === 1 ? 'day' : 'days'}`} />
          </div>


          <div className="mb-6">
            <HabitsHeatMap {...heatMap} />
          </div>


          <div className="mb-8">
            <GenreGlowBar breakdown={genreBreakdown} />
          </div>


          <div className="mb-10">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3 px-1">Badges</p>
            <div className="flex flex-wrap gap-2">
              {badges.map((badge) => (
                <BadgeChip key={badge.id} badge={badge} />
              ))}
            </div>
          </div>


          <div className="mb-10">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3 px-1">Recent Activity</p>
            <ActivityHistoryList entries={recentActivity} />
          </div>
        </div>
      </div>
    </div>
  )
}


export default ProfileInsightsModal