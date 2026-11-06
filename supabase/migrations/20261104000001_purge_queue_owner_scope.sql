-- Audit follow-up (2026-11-06) — the deletion purge must not delete another
-- member's chat media.
--
-- `wassaa_purge_profile_data` queued `messages.media_url` for every message in
-- every thread the departing member belonged to, with no sender filter. Chat
-- photos are stored under `chat/<sender-id>/`, so a photo the partner sent was
-- queued and then deleted from the private bucket while the partner's message
-- row still referenced it. The same unrestricted selection existed in the Edge
-- API's self-service and admin deletion paths; this migration fixes the SQL
-- side, and the API was fixed in the same commit.
--
-- The function is also repinned to an empty search_path (every relation in it
-- is already schema-qualified), matching the rest of the schema.

create or replace function public.wassaa_purge_profile_data(p_auth_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_id uuid;
begin
  -- The profile usually shares the auth id; older accounts were linked later
  -- through auth_user_id or a confirmed phone/email match.
  select id into target_id from public.profiles where id = p_auth_user or auth_user_id = p_auth_user limit 1;
  if target_id is null then return; end if;

  -- Only keys this member owns: their own profile photos, their own identity
  -- documents, and messages they sent. Partner-sent chat media is deliberately
  -- excluded so one account deletion cannot destroy another member's photos.
  insert into public.wassaa_media_purge_queue (user_id, keys)
  select p_auth_user, coalesce(array_remove(array_agg(distinct k), null), '{}')
  from (
    select jsonb_array_elements_text(coalesce(p.photos, '[]'::jsonb)) as k
      from public.profiles p where p.id = target_id
    union all
    select v.id_doc_url as k from public.verification_submissions v where v.user_id = target_id
    union all
    select v.selfie_url as k from public.verification_submissions v where v.user_id = target_id
    union all
    select m.media_url as k from public.messages m
      where m.sender_id = target_id::text and m.media_url is not null
  ) media
  where (k like 'photos/' || target_id::text || '/%')
     or (k like 'verification/' || target_id::text || '/%')
     or (k like 'chat/' || target_id::text || '/%')
  on conflict (user_id) do update set keys = excluded.keys, enqueued_at = now();

  -- Redact safety/audit records exactly like the API deletion path.
  update public.reports set reported_user_id = null, details = '[Report subject account deleted]', service_branch = null
    where reported_user_id = target_id;
  perform public.wassaa_anonymize_admin_audit(target_id);

  delete from public.profiles where id = target_id;
end $$;

revoke all on function public.wassaa_purge_profile_data(uuid) from public, anon, authenticated;
grant execute on function public.wassaa_purge_profile_data(uuid) to service_role;
