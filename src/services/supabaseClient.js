// Optional cloud sync client. The app remains fully usable without these env vars.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isCloudConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

if (!isCloudConfigured) {
  console.warn(
    '[cloudSync] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — cloud sync is disabled, app runs fully local.'
  )
}

export const supabase = isCloudConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null
