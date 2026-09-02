// Derives Profile Insights stats (total watch time, streaks, heat map,// genre breakdown, badges) from the raw viewing log produced by
// utils/viewingLog.js: { 'YYYY-MM-DD': { totalMinutes, sessions: [...] } }


export const GENRE_COLORS = [
  '#0A84FF', '#64D2FF', '#BF5AF2', '#FF375F', '#FF9F0A',
  '#30D158', '#FFD60A', '#FF453A', '#5E5CE6', '#AC8E68',
]


export function getTotalWatchMinutes(log) {
  return Object.values(log).reduce((sum, day) => sum + (day.totalMinutes || 0), 0)
}


export function formatWatchTime(totalMinutes) {
  const minutes = Math.round(totalMinutes || 0)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`
}


function getDateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}


// Counts consecutive days (ending today or yesterday) with any watch time.
export function getCurrentStreak(log) {
  let streak = 0
  let cursor = new Date()


  // Allow the streak to still count if today has no activity yet, as long
  // as yesterday does — otherwise watching last night would reset to 0
  // the moment midnight passes, before the person has watched anything today.
  if (!log[getDateKey(cursor)]) {
    cursor.setDate(cursor.getDate() - 1)
    if (!log[getDateKey(cursor)]) return 0
  }


  while (log[getDateKey(cursor)] && log[getDateKey(cursor)].totalMinutes > 0) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }


  return streak
}


const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const BLOCK_LABELS = ['12a', '4a', '8a', '12p', '4p', '8p']


// Builds a 7-day x 6-timeblock grid of total minutes watched, aggregated
// across all history in the log (not just the current week) — each cell
// is "how many minutes have you historically watched on this weekday
// during this time block".
export function getHeatMapGrid(log) {
  const grid = DAY_LABELS.map(() => BLOCK_LABELS.map(() => 0))


  for (const day of Object.values(log)) {
    for (const session of day.sessions || []) {
      const date = new Date(session.timestamp)
      const weekday = date.getDay()
      const blockIdx = Math.min(Math.floor((session.hour ?? date.getHours()) / 4), 5)
      grid[weekday][blockIdx] += session.minutes || 0
    }
  }


  const max = Math.max(1, ...grid.flat())


  return { grid, max, dayLabels: DAY_LABELS, blockLabels: BLOCK_LABELS }
}


// Returns genre breakdown as [{ genre, minutes, percent }], sorted
// descending, capped to the top 6 so the legend doesn't overflow.
export function getGenreBreakdown(log) {
  const totals = new Map()


  for (const day of Object.values(log)) {
    for (const session of day.sessions || []) {
      const genres = session.genres && session.genres.length ? session.genres : ['Uncategorized']
      for (const genre of genres) {
        totals.set(genre, (totals.get(genre) || 0) + (session.minutes || 0))
      }
    }
  }


  const totalMinutes = Array.from(totals.values()).reduce((a, b) => a + b, 0)
  if (totalMinutes === 0) return []


  return Array.from(totals.entries())
    .map(([genre, minutes]) => ({ genre, minutes, percent: (minutes / totalMinutes) * 100 }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 6)
}


// Simple milestone badges derived purely from the log — unlocked/locked
// state only, no persistence needed since it's recomputed from real data.
export function getBadges(log) {
  const totalMinutes = getTotalWatchMinutes(log)
  const streak = getCurrentStreak(log)
  const daysWithActivity = Object.values(log).filter((d) => d.totalMinutes > 0).length
  const sessionCount = Object.values(log).reduce((sum, d) => sum + (d.sessions?.length || 0), 0)


  return [
    {
      id: 'first-watch',
      name: 'First Watch',
      description: 'Watch your first title.',
      unlocked: sessionCount >= 1,
    },
    {
      id: 'binge-hour',
      name: 'Binge Hour',
      description: 'Log 60+ total minutes watched.',
      unlocked: totalMinutes >= 60,
    },
    {
      id: 'marathoner',
      name: 'Marathoner',
      description: 'Log 10+ total hours watched.',
      unlocked: totalMinutes >= 600,
    },
    {
      id: 'three-day-streak',
      name: '3-Day Streak',
      description: 'Watch something 3 days in a row.',
      unlocked: streak >= 3,
    },
    {
      id: 'week-streak',
      name: 'Week Streak',
      description: 'Watch something 7 days in a row.',
      unlocked: streak >= 7,
    },
    {
      id: 'regular',
      name: 'Regular',
      description: 'Have viewing activity on 10+ different days.',
      unlocked: daysWithActivity >= 10,
    },
  ]
}


// ─── Achievement score & tier (drives ProfileRing) ─────────────────────
//
// Deliberately built ON TOP of the existing badge/watch-time derivation
// above rather than a separate scoring pipeline reading raw log data
// again — this is the same "recompute from the real log, no separate
// persistence needed" approach getBadges already uses. The Supabase
// profile_achievements table (see achievementSync.js) is a synced CACHE
// of this computation for cross-device display, not an independent
// source of truth — the log itself remains authoritative, same trust
// model as the rest of this client-only app.
//
// Formula: 1 point per minute watched, +50 per unlocked badge. Badge
// bonus is a flat per-badge value (not weighted per-badge) so unlocking
// any badge meaningfully moves the needle without requiring a bespoke
// weight for each of the 6 (and growing) badge definitions above.
const POINTS_PER_MINUTE = 1
const POINTS_PER_BADGE = 50


// Ordered ascending by threshold — the highest threshold the score meets
// or exceeds wins. Recalibrated against this specific formula's real
// range (a single dedicated viewer can rack up thousands of minutes),
// not arbitrary round numbers.
export const ACHIEVEMENT_TIERS = [
  { id: 'bronze', label: 'Bronze', threshold: 0 },
  { id: 'silver', label: 'Silver', threshold: 300 },
  { id: 'gold', label: 'Gold', threshold: 900 },
  { id: 'diamond', label: 'Diamond', threshold: 2400 },
]


export function getAchievementScore(log) {
  const totalMinutes = getTotalWatchMinutes(log)
  const unlockedCount = getBadges(log).filter((b) => b.unlocked).length
  return Math.round(totalMinutes * POINTS_PER_MINUTE + unlockedCount * POINTS_PER_BADGE)
}


export function getAchievementTier(score) {
  let current = ACHIEVEMENT_TIERS[0]
  for (const tier of ACHIEVEMENT_TIERS) {
    if (score >= tier.threshold) current = tier
  }
  return current
}


// Convenience combined getter — the common case (ProfileRing, sync logic)
// wants both the raw score and the resolved tier together.
export function getAchievementSummary(log) {
  const score = getAchievementScore(log)
  const tier = getAchievementTier(score)
  return { score, tier: tier.id, tierLabel: tier.label }
}