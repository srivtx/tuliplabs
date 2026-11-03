-- Tulip Labs: profiles (usernames) and deleting your own account. Run once in the Supabase SQL editor,
-- after docs/supabase.sql.

create extension if not exists citext;

create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  username     citext not null unique
               check (username ~ '^[a-z0-9_]{3,20}$')
               check (username not in ('admin', 'administrator', 'root', 'support', 'help', 'api', 'www', 'mail',
                                       'tulip', 'tuliplabs', 'tulip_labs', 'svx', 'staff', 'team', 'official',
                                       'account', 'pricing', 'privacy', 'terms', 'refunds', 'news', 'me', 'u')),
  display_name text check (char_length(display_name) <= 50),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Usernames and names are public (they'll show on portfolio pages). Only you can create or change yours.
alter table public.profiles enable row level security;

create policy "profiles are public"  on public.profiles for select using (true);
create policy "insert own profile"   on public.profiles for insert with check (auth.uid() = user_id);
create policy "update own profile"   on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Delete your own account. Removing the auth user removes the profile and progress rows with it (on delete cascade).
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
