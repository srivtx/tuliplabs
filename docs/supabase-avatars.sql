-- Tulip Labs: profile pictures. Run once in the Supabase SQL editor, after docs/supabase-profiles.sql.

-- Your face: null (your initials), 'px:<name>' (a pixel character), 'provider' (your Google or GitHub
-- photo), or 'img:<url>' (a picture you
-- uploaded, which must live in our own avatars bucket, so a profile can't point at any other site).
alter table public.profiles add column if not exists avatar text;
alter table public.profiles drop constraint if exists profiles_avatar_check;
alter table public.profiles add constraint profiles_avatar_check check (
  avatar is null
  or avatar ~ '^px:[a-z]{2,20}$'
  or avatar = 'provider'
  or (avatar like 'img:https://gjnhyidkikiiiasntbeh.supabase.co/storage/v1/object/public/avatars/%' and char_length(avatar) < 300)
);

-- Uploaded pictures: a public bucket (anyone can see a picture), at most 1 MB, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg'];

-- Each person can only add, change, list or remove files in their own folder: avatars/<their id>/...
drop policy if exists "avatars: read own folder"   on storage.objects;
drop policy if exists "avatars: upload own folder" on storage.objects;
drop policy if exists "avatars: update own folder" on storage.objects;
drop policy if exists "avatars: delete own folder" on storage.objects;
create policy "avatars: read own folder"   on storage.objects for select to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: upload own folder" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: update own folder" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: delete own folder" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
