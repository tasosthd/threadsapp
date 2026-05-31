-- Loomyva bookmarks table
-- Run this once in Supabase SQL Editor before using the bookmark feature.

create table if not exists public.thread_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, thread_id)
);

alter table public.thread_bookmarks enable row level security;

drop policy if exists "Users can read their own bookmarks" on public.thread_bookmarks;
create policy "Users can read their own bookmarks"
on public.thread_bookmarks
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create their own bookmarks" on public.thread_bookmarks;
create policy "Users can create their own bookmarks"
on public.thread_bookmarks
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own bookmarks" on public.thread_bookmarks;
create policy "Users can delete their own bookmarks"
on public.thread_bookmarks
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists thread_bookmarks_user_id_created_at_idx
on public.thread_bookmarks (user_id, created_at desc);

create index if not exists thread_bookmarks_thread_id_idx
on public.thread_bookmarks (thread_id);
