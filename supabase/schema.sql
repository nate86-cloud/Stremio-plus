-- Stremio+ Supabase Schema — Hybrid Strict RLS + Edge Function
-- Global per-account: profiles, installed_addons, user_settings, playback_queue
-- Per-profile (map keyed by profileId inside data): watch_progress, watched, viewing_log
-- Privileged: profile_achievements (service_role only via Edge Function)

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ── Global per-account ───────────────────────────────────────────────
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"profiles":[],"activeProfileId":null}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.installed_addons (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.playback_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Per-profile (data = { profileId: perProfileData }) ──────────────
create table if not exists public.watch_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.watched (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.viewing_log (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Legacy tables (kept for rollback — no longer written) ──────────
create table if not exists public.stream_addons (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_addons (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Privileged: achievement cache — only service_role writes via Edge Function
create table if not exists public.profile_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null,
  score integer not null default 0,
  tier text not null default 'bronze',
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.installed_addons enable row level security;
alter table public.playback_queue enable row level security;
alter table public.user_settings enable row level security;
alter table public.watch_progress enable row level security;
alter table public.watched enable row level security;
alter table public.viewing_log enable row level security;
alter table public.stream_addons enable row level security;
alter table public.catalog_addons enable row level security;
alter table public.profile_achievements enable row level security;

-- Drop existing policies to allow re-run (idempotent)
drop policy if exists "own row only - user_settings" on public.user_settings;
drop policy if exists "own row only - watch_progress" on public.watch_progress;
drop policy if exists "own row only - viewing_log" on public.viewing_log;
drop policy if exists "own row only - stream_addons" on public.stream_addons;
drop policy if exists "own row only - catalog_addons" on public.catalog_addons;
drop policy if exists "own row profiles" on public.profiles;
drop policy if exists "own row installed_addons" on public.installed_addons;
drop policy if exists "own row playback_queue" on public.playback_queue;
drop policy if exists "own row watch_progress" on public.watch_progress;
drop policy if exists "own row watched" on public.watched;
drop policy if exists "own row viewing_log" on public.viewing_log;
drop policy if exists "own achievements read" on public.profile_achievements;
drop policy if exists "own row only - profiles" on public.profiles;

-- Strict RLS: user can read/write only own rows (auth.uid() = user_id)
create policy "own row profiles" on public.profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row installed_addons" on public.installed_addons for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row playback_queue" on public.playback_queue for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row user_settings" on public.user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row watch_progress" on public.watch_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row watched" on public.watched for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row viewing_log" on public.viewing_log for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row stream_addons" on public.stream_addons for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row catalog_addons" on public.catalog_addons for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Achievements: users can read own, but only service_role can write (no insert/update policy for client)
create policy "own achievements read" on public.profile_achievements for select using (auth.uid() = user_id);

-- ── Triggers ─────────────────────────────────────────────────────────
drop trigger if exists set_updated_at_user_settings on public.user_settings;
drop trigger if exists set_updated_at_watch_progress on public.watch_progress;
drop trigger if exists set_updated_at_viewing_log on public.viewing_log;
drop trigger if exists set_updated_at_stream_addons on public.stream_addons;
drop trigger if exists set_updated_at_catalog_addons on public.catalog_addons;

create trigger set_updated_at_profiles before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_updated_at_installed_addons before update on public.installed_addons for each row execute function public.set_updated_at();
create trigger set_updated_at_playback_queue before update on public.playback_queue for each row execute function public.set_updated_at();
create trigger set_updated_at_user_settings before update on public.user_settings for each row execute function public.set_updated_at();
create trigger set_updated_at_watch_progress before update on public.watch_progress for each row execute function public.set_updated_at();
create trigger set_updated_at_watched before update on public.watched for each row execute function public.set_updated_at();
create trigger set_updated_at_viewing_log before update on public.viewing_log for each row execute function public.set_updated_at();
create trigger set_updated_at_stream_addons before update on public.stream_addons for each row execute function public.set_updated_at();
create trigger set_updated_at_catalog_addons before update on public.catalog_addons for each row execute function public.set_updated_at();
create trigger set_updated_at_profile_achievements before update on public.profile_achievements for each row execute function public.set_updated_at();
