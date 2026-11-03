-- Tulip Labs: sign-in and sync. Run this once in the Supabase SQL editor.
-- One row per person holds the same JSON that lives in localStorage (vnl-code-v1, vnl-progress).

create table if not exists public.progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row-level security: each person can read and write only their own row.
alter table public.progress enable row level security;

create policy "read own progress"   on public.progress for select using (auth.uid() = user_id);
create policy "insert own progress" on public.progress for insert with check (auth.uid() = user_id);
create policy "update own progress" on public.progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
