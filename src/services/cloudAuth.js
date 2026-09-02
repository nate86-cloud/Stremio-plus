import { supabase, isCloudConfigured } from './supabaseClient'

function assertConfigured() {
  if (!isCloudConfigured || !supabase) {
    throw new Error('Cloud sync is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }
}

export async function cloudSignUp(email, password) {
  assertConfigured()
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw new Error(error.message)
  return data
}

export async function cloudSignIn(email, password) {
  assertConfigured()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return data
}

export async function cloudSignOut() {
  if (!isCloudConfigured || !supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

export async function getCloudUser() {
  if (!isCloudConfigured || !supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user
}

export function onCloudAuthStateChange(callback) {
  if (!isCloudConfigured || !supabase) return () => {}
  const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null)
  })
  return () => subscription.subscription.unsubscribe()
}

// Auto-provision a Supabase account linked to a Stremio user.
// Used for strict RLS: Supabase Auth provides auth.uid() for row ownership.
// Deterministic synthetic credentials avoid asking user for a second password.
export async function ensureSupabaseAccountForStremioUser(stremioUser) {
  if (!isCloudConfigured || !supabase) return null
  if (!stremioUser?._id) return null
  const existing = await getCloudUser()
  if (existing) return existing

  const email = stremioUser.email && typeof stremioUser.email === 'string' && stremioUser.email.includes('@')
    ? stremioUser.email.trim().toLowerCase()
    : `stremio-${String(stremioUser._id).slice(0,12)}@stremio.local`
  // Deterministic password derived from Stremio _id (not the Stremio password, which we don't have).
  // Stable across devices so same Stremio account provisions same Supabase account.
  const password = `stremio-sync-${String(stremioUser._id).slice(0,16)}-v1!Aa`

  // Try sign-in first (account may already exist from another device)
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (data?.user) return data.user
    if (error) {
      // Invalid API key, network, etc. — surface the real message for Settings UI
      const msg = error.message || String(error)
      if (msg.includes('Invalid API key') || msg.includes('Api key')) throw new Error(`Invalid API key for ${email.split('@')[1] || 'project'} — copy correct anon key from Dashboard → Settings → API`)
      if (msg.includes('Failed to fetch') || msg.includes('fetch') || msg.includes('NetworkError')) {
        console.debug('[cloudAuth] Supabase unreachable on sign-in — remaining local-only')
        throw new Error(`Supabase not reachable at ${import.meta.env.VITE_SUPABASE_URL} — check network / project not paused`)
      }
      // Other sign-in errors (e.g. Invalid login credentials) fall through to sign-up
      console.debug('[cloudAuth] signIn failed, will try signUp:', msg)
    }
  } catch (err) {
    const msg = err?.message || String(err)
    if (msg.includes('Invalid API key') || msg.includes('not reachable')) throw err
    if (msg.includes('Failed to fetch') || msg.includes('fetch')) {
      console.debug('[cloudAuth] Supabase unreachable on sign-in — remaining local-only')
      throw new Error(`Supabase not reachable at ${import.meta.env.VITE_SUPABASE_URL}`, { cause: err })
    }
    console.debug('[cloudAuth] signIn threw, will try signUp:', msg)
  }

  // Fallback: sign-up
  try {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    if (data?.user) return data.user
    // Email confirmation required: Supabase returns user=null but no error when confirm is on
    if (!data?.user) throw new Error('Email confirmation required — Dashboard → Auth → Disable Confirm email, then retry')
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) throw signInError
    if (signInData?.user) return signInData.user
    throw new Error('Sign-up succeeded but no session — disable Confirm email')
  } catch (err) {
    const msg = err?.message || String(err)
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch')) {
      throw new Error(`Supabase not reachable at ${import.meta.env.VITE_SUPABASE_URL} — check network / project paused`, { cause: err })
    }
    throw err
  }
}
