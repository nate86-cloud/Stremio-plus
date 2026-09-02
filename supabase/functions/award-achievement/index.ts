// Supabase Edge Function: award-achievement
// Privileged path for achievement tier — client must NOT be able to spoof Diamond by writing profile_achievements directly.
// This function recomputes score server-side from viewing_log (source of truth) using same formula as src/utils/insights.js.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const POINTS_PER_MINUTE = 1
const POINTS_PER_BADGE = 50
const TIERS = [
  { id: 'bronze', threshold: 0 },
  { id: 'silver', threshold: 300 },
  { id: 'gold', threshold: 900 },
  { id: 'diamond', threshold: 2400 },
]

function getTotalMinutes(log: any): number {
  return Object.values(log as any).reduce((sum: number, day: any) => sum + (day.totalMinutes || 0), 0)
}
function getCurrentStreak(log: any): number {
  function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
  let streak = 0
  let cursor = new Date()
  if (!log[dateKey(cursor)]) { cursor.setDate(cursor.getDate()-1); if (!log[dateKey(cursor)]) return 0 }
  while (log[dateKey(cursor)] && log[dateKey(cursor)].totalMinutes > 0) { streak++; cursor.setDate(cursor.getDate()-1) }
  return streak
}
function getBadges(log: any) {
  const totalMinutes = getTotalMinutes(log)
  const streak = getCurrentStreak(log)
  const daysWithActivity = Object.values(log as any).filter((d:any)=>d.totalMinutes>0).length
  const sessionCount = Object.values(log as any).reduce((sum:number,d:any)=>sum+(d.sessions?.length||0),0)
  return [
    { id: 'first-watch', unlocked: sessionCount >= 1 },
    { id: 'binge-hour', unlocked: totalMinutes >= 60 },
    { id: 'marathoner', unlocked: totalMinutes >= 600 },
    { id: 'three-day-streak', unlocked: streak >= 3 },
    { id: 'week-streak', unlocked: streak >= 7 },
    { id: 'regular', unlocked: daysWithActivity >= 10 },
  ]
}
function getScore(log: any) {
  return Math.round(getTotalMinutes(log) * POINTS_PER_MINUTE + getBadges(log).filter(b=>b.unlocked).length * POINTS_PER_BADGE)
}
function getTier(score: number) {
  let cur = TIERS[0]
  for (const t of TIERS) if (score >= t.threshold) cur = t
  return cur
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonAuth = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!anonAuth) return new Response(JSON.stringify({ error: 'Missing Authorization' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  // Validate caller is the owner: verify JWT and get user
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${anonAuth}` } } })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  let body: any
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } }) }
  const profileId = body.profileId
  if (!profileId || typeof profileId !== 'string') return new Response(JSON.stringify({ error: 'profileId required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const service = createClient(supabaseUrl, serviceKey)

  // Read the authoritative viewing_log for this user (RLS bypassed via service_role)
  const { data: row, error } = await service.from('viewing_log').select('data').eq('user_id', user.id).maybeSingle()
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })

  const allLogs = row?.data || {}
  const log = allLogs[profileId] || {}

  const score = getScore(log)
  const tier = getTier(score)

  const { error: upsertErr } = await service.from('profile_achievements').upsert({
    user_id: user.id,
    profile_id: profileId,
    score,
    tier: tier.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,profile_id' })

  if (upsertErr) return new Response(JSON.stringify({ error: upsertErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })

  return new Response(JSON.stringify({ profileId, score, tier: tier.id, tierLabel: tier.id }), { headers: { 'Content-Type': 'application/json' } })
})
