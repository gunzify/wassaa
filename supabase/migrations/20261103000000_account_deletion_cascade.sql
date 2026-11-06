-- Account deletion cascade (KB §18D deletion governance).
--
-- Deleting a user in the Supabase dashboard (or via auth admin) used to leave
-- the matching profile row behind: discovery showed a "dead" member and
-- uploaded R2 media survived. This migration closes that gap:
--
--   1. A BEFORE DELETE trigger on auth.users finds the profile (or any legacy
--      profile linked by phone/email), redacts safety records, queues the
--      member's R2 media keys for the out-of-band purge script, and deletes
--      the profile row. Every relational row (swipes, matches, messages,
--      match_reads, blocks, verification_submissions, payments,
--      api_rate_limits, media_items, appeals…) cascades with it.
--   2. Self-service DELETE /me/account and admin panel deletions already
--      remove R2 objects before the auth row goes, so the queue stays empty
--      for them; the trigger queue is only for dashboard deletions, drained
--      by scripts/account-deletion.mjs --purge-queue.

create table if not exists public.wassaa_media_purge_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  keys text[] not null default '{}',
  enqueued_at timestamptz not null default now(),
  purged_at timestamptz
);
alter table public.wassaa_media_purge_queue enable row level security;
revoke all on public.wassaa_media_purge_queue from anon, authenticated;
grant all on public.wassaa_media_purge_queue to service_role;

create or replace function public.wassaa_purge_profile_data(p_auth_user uuid)
returns void language plpgsql security definer set search_path = 'public,extensions' as $$
declare
  target_id uuid;
begin
  -- The profile usually shares the auth id; older accounts were linked later
  -- through auth_user_id or a confirmed phone/email match.
  select id into target_id from public.profiles where id = p_auth_user or auth_user_id = p_auth_user limit 1;
  if target_id is null then return; end if;

  -- The auth_user_id FK is set null on delete, so record the link now (the
  -- profiles row below is about to disappear).
  insert into public.wassaa_media_purge_queue (user_id, keys)
  select p_auth_user, coalesce(array_remove(array_agg(distinct k), null), '{}')
  from (
    select jsonb_array_elements_text(coalesce(p.photos, '[]'::jsonb)) as k from public.profiles p where p.id = target_id
    union all
    select v.id_doc_url as k from public.verification_submissions v where v.user_id = target_id
    union all
    select v.selfie_url as k from public.verification_submissions v where v.user_id = target_id
    union all
    select m.media_url as k from public.messages m
      join public.matches mt on mt.id = m.match_id
      where (mt.user_a = target_id or mt.user_b = target_id) and m.media_url is not null
  ) media
  where k like 'photos/%' or k like 'chat/%' or k like 'verification/%'
  on conflict (user_id) do update set keys = excluded.keys, enqueued_at = now();

  -- Redact safety/audit records exactly like the API deletion path.
  update public.reports set reported_user_id = null, details = '[Report subject account deleted]', service_branch = null
    where reported_user_id = target_id;
  perform public.wassaa_anonymize_admin_audit(target_id);

  delete from public.profiles where id = target_id;
end $$;

revoke all on function public.wassaa_purge_profile_data(uuid) from public, anon, authenticated;
grant execute on function public.wassaa_purge_profile_data(uuid) to service_role;

create or replace function public.wassaa_on_auth_user_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.wassaa_purge_profile_data(old.id);
  return old;
end $$;

drop trigger if exists wassaa_auth_user_deleted on auth.users;
create trigger wassaa_auth_user_deleted before delete on auth.users
for each row execute function public.wassaa_on_auth_user_deleted();

revoke all on function public.wassaa_on_auth_user_deleted() from public, anon, authenticated;
grant execute on function public.wassaa_on_auth_user_deleted() to supabase_auth_admin;

-- Profiles deleted before this trigger existed can leave queued media with no
-- auth row; those are cleaned by the same script from the queue's user ids.
