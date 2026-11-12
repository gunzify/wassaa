-- ============================================================
-- Notifications that actually fire
-- ============================================================
-- The 20261107030000 migration created the tables but nothing ever wrote to
-- them, the preferences column it reads did not exist, and "mark all read"
-- relied on a row with a null notification_id which the composite primary key
-- forbids. This migration fixes all three and adds the triggers that turn
-- real events into notifications:
--
--   match    both sides of a new mutual match (cold threads on promotion only)
--   message  the other participant, collapsed to one unread row per thread
--   like     the person who was liked, unless it immediately became a match
--
-- Everything respects profiles.notifications and notification_mutes, and skips
-- persona recipients (they never read the feed).
-- ============================================================

begin;

-- ---- member preferences (read by the API and the triggers) ----
alter table public.profiles
  add column if not exists notifications jsonb not null
  default '{"match":true,"message":true,"like":true}'::jsonb;

-- Existing rows already carry the column default, but be explicit for rows
-- whose JSON was written before this column existed.
update public.profiles
  set notifications = '{"match":true,"message":true,"like":true}'::jsonb
  where notifications is null;

-- ---- read-state helper: one row per event (never a null id) ----
drop function if exists public.wassaa_mark_notifications_read(uuid);
create or replace function public.wassaa_mark_notifications_read(p_user uuid)
returns integer
language plpgsql
security definer
as $$
declare
  inserted integer;
begin
  insert into public.notification_reads (user_id, notification_id, read_at)
  select p_user, e.id, now()
  from public.notification_events e
  where e.user_id = p_user
  on conflict (user_id, notification_id) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

comment on function public.wassaa_mark_notifications_read(uuid) is
  'Marks every event for a member read. Returns the number of new read rows.';

-- ---- one unread message notification per thread ----
-- The feed would otherwise grow a row per chat message; collapsing keeps the
-- bell meaningful and stops a ten-message burst from burying everything else.
create index if not exists idx_notification_events_thread_unread
  on public.notification_events (user_id, thread_id, created_at desc)
  where kind in ('message', 'match');

-- ---- helpers ----
create or replace function public.wassaa_wants(kind text, profile_id uuid) returns boolean
language sql
stable
as $$
  select case
    when p.id is null then false
    when p.is_npc then false
    else coalesce((p.notifications ->> kind) <> 'false', true)
  end
  from public.profiles p
  where p.id = profile_id;
$$;

create or replace function public.wassaa_notify_match_pair(
  p_match uuid,
  p_user_a uuid,
  p_user_b uuid
) returns void
language plpgsql
security definer
as $$
begin
  if public.wassaa_wants('match', p_user_a)
     and not exists (
       select 1 from public.notification_events e
       where e.user_id = p_user_a and e.thread_id = p_match and e.kind = 'match'
     ) then
    insert into public.notification_events (user_id, kind, thread_id, actor_id)
    values (p_user_a, 'match', p_match, p_user_b);
  end if;

  if public.wassaa_wants('match', p_user_b)
     and not exists (
       select 1 from public.notification_events e
       where e.user_id = p_user_b and e.thread_id = p_match and e.kind = 'match'
     ) then
    insert into public.notification_events (user_id, kind, thread_id, actor_id)
    values (p_user_b, 'match', p_match, p_user_a);
  end if;

  -- A "liked you" that turned into a match in the same breath is noise: the
  -- match row above already tells both people what happened.
  delete from public.notification_events e
  where e.kind = 'like'
    and (
      (e.user_id = p_user_a and e.actor_id = p_user_b)
      or (e.user_id = p_user_b and e.actor_id = p_user_a)
    );
end;
$$;

-- ---- match created (mutual only; cold outreach is a message, not a match) ----
create or replace function public.wassaa_on_match_created()
returns trigger
language plpgsql
security definer
as $$
begin
  if coalesce(NEW.origin, 'match') = 'cold' then
    return NEW;
  end if;
  perform public.wassaa_notify_match_pair(NEW.id, NEW.user_a, NEW.user_b);
  return NEW;
end;
$$;

-- ---- cold thread promoted to a real match ----
create or replace function public.wassaa_on_match_promoted()
returns trigger
language plpgsql
security definer
as $$
begin
  perform public.wassaa_notify_match_pair(NEW.id, NEW.user_a, NEW.user_b);
  return NEW;
end;
$$;

-- ---- message received ----
create or replace function public.wassaa_on_message_created()
returns trigger
language plpgsql
security definer
as $$
declare
  thread public.matches%rowtype;
  recipient uuid;
  sender uuid;
  preview text;
begin
  if NEW.kind = 'system' or NEW.sender_id is null or NEW.sender_id = 'system' then
    return NEW;
  end if;
  if NEW.sender_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return NEW;
  end if;
  sender := NEW.sender_id::uuid;

  select * into thread from public.matches where id = NEW.match_id;
  if not found then
    return NEW;
  end if;

  preview := left(
    coalesce(
      nullif(btrim(NEW.text), ''),
      nullif(btrim(NEW.caption), ''),
      case NEW.kind
        when 'photo' then 'Sent a photo'
        when 'voice' then 'Sent a voice note'
        else 'New message'
      end
    ),
    140
  );

  foreach recipient in array array[thread.user_a, thread.user_b] loop
    if recipient = sender then
      continue;
    end if;
    if not public.wassaa_wants('message', recipient) then
      continue;
    end if;
    if exists (
      select 1 from public.notification_mutes m
      where m.user_id = recipient and m.thread_id = NEW.match_id
    ) then
      continue;
    end if;

    update public.notification_events e
      set created_at = now(),
          message_preview = preview,
          actor_id = sender
      where e.id = (
        select e2.id
        from public.notification_events e2
        where e2.user_id = recipient
          and e2.thread_id = NEW.match_id
          and e2.kind = 'message'
          and not exists (
            select 1 from public.notification_reads r
            where r.user_id = e2.user_id and r.notification_id = e2.id
          )
        order by e2.created_at desc
        limit 1
      );
    if found then
      continue;
    end if;

    insert into public.notification_events (user_id, kind, thread_id, actor_id, message_preview)
    values (recipient, 'message', NEW.match_id, sender, preview);
  end loop;

  return NEW;
end;
$$;

-- ---- someone liked you ----
create or replace function public.wassaa_on_swipe_like()
returns trigger
language plpgsql
security definer
as $$
begin
  if NEW.kind not in ('like', 'super') then
    return NEW;
  end if;
  if tg_op = 'UPDATE' and OLD.kind = NEW.kind then
    return NEW;
  end if;

  -- A mutual like is a match; the match trigger owns that notification.
  if exists (
    select 1 from public.matches m
    where (m.user_a = NEW.from_user_id and m.user_b = NEW.to_user_id)
       or (m.user_a = NEW.to_user_id and m.user_b = NEW.from_user_id)
  ) then
    return NEW;
  end if;

  if not public.wassaa_wants('like', NEW.to_user_id) then
    return NEW;
  end if;

  if exists (
    select 1
    from public.notification_events e
    where e.user_id = NEW.to_user_id
      and e.kind = 'like'
      and e.actor_id = NEW.from_user_id
      and not exists (
        select 1 from public.notification_reads r
        where r.user_id = e.user_id and r.notification_id = e.id
      )
  ) then
    return NEW;
  end if;

  insert into public.notification_events (user_id, kind, actor_id)
  values (NEW.to_user_id, 'like', NEW.from_user_id);
  return NEW;
end;
$$;

-- ---- triggers ----
drop trigger if exists wassaa_notify_match_created on public.matches;
create trigger wassaa_notify_match_created
  after insert on public.matches
  for each row execute function public.wassaa_on_match_created();

drop trigger if exists wassaa_notify_match_promoted on public.matches;
create trigger wassaa_notify_match_promoted
  after update of origin on public.matches
  for each row
  when (OLD.origin = 'cold' and NEW.origin = 'match')
  execute function public.wassaa_on_match_promoted();

drop trigger if exists wassaa_notify_message on public.messages;
create trigger wassaa_notify_message
  after insert on public.messages
  for each row execute function public.wassaa_on_message_created();

drop trigger if exists wassaa_notify_like on public.swipes;
create trigger wassaa_notify_like
  after insert or update of kind on public.swipes
  for each row execute function public.wassaa_on_swipe_like();

commit;
