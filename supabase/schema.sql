-- Схема «Атмосферы» с аккаунтами: у каждого человека свой дневник.
-- Запустить целиком в Supabase → SQL Editor (можно повторно — скрипт идемпотентный).
-- Без входа приложение работает как раньше — в IndexedDB этого браузера.

-- дни: одна строка = одна запись DayRecord, файлы лежат в bucket `diary` по пути <user_id>/<slug>/...
create table if not exists public.days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  folder text not null,
  date date not null,
  created_at timestamptz not null default now(),
  data jsonb not null,
  primary key (user_id, id)
);
create index if not exists days_user_date_idx on public.days (user_id, date desc);

-- папки архива («Лето у бабушки», «С Машей») — одним списком на человека
create table if not exists public.shelves (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  folders jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.days enable row level security;
alter table public.shelves enable row level security;

drop policy if exists "demo read" on public.days;
drop policy if exists "demo write" on public.days;
drop policy if exists "demo update" on public.days;
drop policy if exists "demo delete" on public.days;
drop policy if exists "own days select" on public.days;
drop policy if exists "own days insert" on public.days;
drop policy if exists "own days update" on public.days;
drop policy if exists "own days delete" on public.days;
create policy "own days select" on public.days for select to authenticated using ((select auth.uid()) = user_id);
create policy "own days insert" on public.days for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own days update" on public.days for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own days delete" on public.days for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "own shelf select" on public.shelves;
drop policy if exists "own shelf insert" on public.shelves;
drop policy if exists "own shelf update" on public.shelves;
create policy "own shelf select" on public.shelves for select to authenticated using ((select auth.uid()) = user_id);
create policy "own shelf insert" on public.shelves for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own shelf update" on public.shelves for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- приватный bucket: фото и песни видит только владелец (ссылки — временные, подписанные)
insert into storage.buckets (id, name, public) values ('diary', 'diary', false)
on conflict (id) do update set public = false;

drop policy if exists "demo diary read" on storage.objects;
drop policy if exists "demo diary write" on storage.objects;
drop policy if exists "demo diary update" on storage.objects;
drop policy if exists "demo diary delete" on storage.objects;
drop policy if exists "own diary read" on storage.objects;
drop policy if exists "own diary write" on storage.objects;
drop policy if exists "own diary update" on storage.objects;
drop policy if exists "own diary delete" on storage.objects;
create policy "own diary read" on storage.objects for select to authenticated
  using (bucket_id = 'diary' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own diary write" on storage.objects for insert to authenticated
  with check (bucket_id = 'diary' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own diary update" on storage.objects for update to authenticated
  using (bucket_id = 'diary' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own diary delete" on storage.objects for delete to authenticated
  using (bucket_id = 'diary' and (storage.foldername(name))[1] = (select auth.uid())::text);
