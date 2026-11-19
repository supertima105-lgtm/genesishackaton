-- Схема для общего демо-архива «Атмосферы».
-- Запустить в Supabase → SQL Editor. Затем создать публичный bucket `diary` (Storage → New bucket → Public).

create table if not exists public.days (
  id text primary key,
  folder text not null,
  date date not null,
  created_at timestamptz not null default now(),
  data jsonb not null
);

create index if not exists days_date_idx on public.days (date desc);

alter table public.days enable row level security;

-- ВНИМАНИЕ: открытый доступ — только для хакатонного демо без авторизации.
-- Для реального дневника нужны auth и политики по auth.uid().
create policy "demo read" on public.days for select using (true);
create policy "demo write" on public.days for insert with check (true);
create policy "demo update" on public.days for update using (true);
create policy "demo delete" on public.days for delete using (true);

-- Политики для bucket `diary`
create policy "demo diary read" on storage.objects for select using (bucket_id = 'diary');
create policy "demo diary write" on storage.objects for insert with check (bucket_id = 'diary');
create policy "demo diary update" on storage.objects for update using (bucket_id = 'diary');
create policy "demo diary delete" on storage.objects for delete using (bucket_id = 'diary');
