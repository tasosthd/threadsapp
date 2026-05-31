-- Loomyva social engagement upgrades
-- Run this once in Supabase SQL Editor.
-- It safely creates bookmarks + notifications support for likes, replies, follows, and bookmarks.

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

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('follow', 'like', 'comment', 'bookmark')),
  thread_id uuid references public.threads(id) on delete cascade,
  comment_id uuid references public.thread_comments(id) on delete cascade,
  message text,
  actor_name text,
  actor_avatar text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

drop policy if exists "Users can read their own notifications" on public.notifications;
create policy "Users can read their own notifications"
on public.notifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create notifications as themselves" on public.notifications;
create policy "Users can create notifications as themselves"
on public.notifications
for insert
to authenticated
with check (auth.uid() = actor_id and auth.uid() <> user_id);

drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
on public.notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own notifications" on public.notifications;
create policy "Users can delete their own notifications"
on public.notifications
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists notifications_user_id_created_at_idx
on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_id_is_read_idx
on public.notifications (user_id, is_read);

create index if not exists notifications_thread_id_idx
on public.notifications (thread_id);
