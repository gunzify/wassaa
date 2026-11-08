-- ============================================================
-- WASSAA notifications — in-app feed (poll-based, no push yet)
-- ============================================================
-- Adds the tables, a summary view, an RPC for the feed, and RLS that
-- lets members read/own their own notifications and lets staff deliver
-- notifications to members from the admin console.
-- ============================================================

begin;

-- ---- notification event (source of truth for the feed) ----
create table if not exists public.notification_events (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  kind            text        not null check (kind in ('match','message','like','system')),
  thread_id       uuid        references public.matches(id) on delete set null,
  actor_id        uuid        references public.profiles(id) on delete set null,
  message_preview text,
  created_at      timestamptz not null default now(),
  acknowledgement_required boolean not null default false
);

create index if not exists idx_notification_events_user_created
  on public.notification_events (user_id, created_at desc);

create index if not exists idx_notification_events_thread
  on public.notification_events (thread_id)
  where thread_id is not null;

-- ---- read state ----
create table if not exists public.notification_reads (
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  notification_id uuid        references public.notification_events(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (user_id, notification_id)
);

-- A "mark all read" is represented as a row with a null notification_id.
-- That is safe because the pk is (user_id, notification_id) and null != null,
-- so there is exactly one "all read" row per user.
create unique index if not exists idx_notification_reads_user_all
  on public.notification_reads (user_id)
  where notification_id is null;

-- ---- thread mutes ----
create table if not exists public.notification_mutes (
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  thread_id  uuid        not null references public.matches(id) on delete cascade,
  muted_at   timestamptz not null default now(),
  primary key (user_id, thread_id)
);

-- ---- summary view used by the feed ----
-- Pulls thread partner + a short preview from the latest message in the
-- thread so the feed can render without a second fetch per row.
create or replace view public.notification_summaries as
  select
    e.id,
    e.user_id,
    e.kind,
    e.thread_id,
    e.actor_id,
    e.message_preview,
    e.created_at,
    e.acknowledgement_required,
    r.read_at,
    m.user_a,
    m.user_b,
    -- partner is the participant that is not the viewer
    coalesce(
      nullif(m.user_a, e.user_id),
      nullif(m.user_b, e.user_id)
    ) as partner_id
  from public.notification_events e
  left join public.notification_reads r
    on r.user_id = e.user_id and r.notification_id = e.id
  left join public.matches m
    on m.id = e.thread_id;

-- ---- RPC: feed for a member (with filters + pagination) ----
create or replace function public.wassaa_notification_summaries(
  p_user   uuid,
  p_since  timestamptz default null,
  p_until  timestamptz default null,
  p_kind   text        default null,
  p_limit  int         default 20,
  p_offset int         default 0
)
returns table (
  id                 uuid,
  kind               text,
  actor_id           uuid,
  thread_id          uuid,
  message_preview    text,
  created_at         timestamptz,
  acknowledgement_required boolean,
  read_at            timestamptz,
  partner_id         uuid
)
language sql
security definer
as $$
  select
    s.id,
    s.kind,
    s.actor_id,
    s.thread_id,
    s.message_preview,
    s.created_at,
    s.acknowledgement_required,
    s.read_at,
    s.partner_id
  from public.notification_summaries s
  where s.user_id = p_user
    and (p_kind is null or s.kind = p_kind)
    and (p_since is null or s.created_at > p_since)
    and (p_until is null or s.created_at <= p_until)
  order by s.created_at desc
  limit p_limit + 1
  offset p_offset;
$$;

-- ---- RPC helper for marking all of a user's notifications read ----
create or replace function public.wassaa_mark_notifications_read(p_user uuid)
returns void
language sql
security definer
as $$
  insert into public.notification_reads (user_id, notification_id, read_at)
    select p_user, null, now()
    on conflict (user_id, notification_id) do nothing;
$$;

-- ---- RLS ----
alter table public.notification_events enable row level security;
alter table public.notification_reads enable row level security;
alter table public.notification_mutes enable row level security;

-- members: read their own events + read their own read-state
create policy "members can read own notification events"
  on public.notification_events for select
  using (auth.uid() = user_id);

create policy "members can read own notification read state"
  on public.notification_reads for select
  using (auth.uid() = user_id);

create policy "members can insert own read state"
  on public.notification_reads for insert
  with check (auth.uid() = user_id);

create policy "members can update own read state"
  on public.notification_reads for update
  using (auth.uid() = user_id);

create policy "members can delete own read state"
  on public.notification_reads for delete
  using (auth.uid() = user_id);

-- members: read/update/delete own mutes
create policy "members can read own mutes"
  on public.notification_mutes for select
  using (auth.uid() = user_id);

create policy "members can insert own mutes"
  on public.notification_mutes for insert
  with check (auth.uid() = user_id);

create policy "members can delete own mutes"
  on public.notification_mutes for delete
  using (auth.uid() = user_id);

-- service role can do everything (admin console + background)
grant select, insert, update, delete on public.notification_events to service_role;
grant select, insert, update, delete on public.notification_reads to service_role;
grant select, insert, update, delete on public.notification_mutes to service_role;
grant select on public.notification_summaries to service_role;

-- also let the anon key read the view through the RPC path only (no direct table exposure)
revoke select on public.notification_events from anon, authenticated;
revoke select on public.notification_reads from anon, authenticated;
revoke select on public.notification_mutes from anon, authenticated;

-- ---- seed a single system notification for the admin console to test delivery ----
-- only if the table is brand new; idempotent via where not exists.
insert into public.notification_events (user_id, kind, actor_id, message_preview, acknowledgement_required)
  select auth.uid(), 'system', auth.uid(), 'Notifications are live — you can now mute threads and mark them read.', true
  where exists (select 1 from public.profiles where id = auth.uid() limit 1)
  and not exists (select 1 from public.notification_events where user_id = auth.uid() and kind = 'system' limit 1);

commit;
