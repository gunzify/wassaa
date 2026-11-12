-- Fix dashboard account deletion ("Database error deleting user").
--
-- `wassaa_purge_profile_data` read profile photos as JSON:
--   jsonb_array_elements_text(coalesce(p.photos, '[]'::jsonb))
-- but `profiles.photos` is `text[] not null default '{}'` in this schema, so
-- Postgres raised 42804 "COALESCE types text[] and jsonb cannot be matched"
-- on every call. Because the function runs from the BEFORE DELETE trigger on
-- auth.users, that surfaced as "Database error deleting user" for *any*
-- deletion — dashboard, admin panel and the auth admin API alike. The key list
-- is now built from the real text[] column with an empty-array fallback.

create or replace function public.wassaa_purge_profile_data(p_auth_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_id uuid;
  media_keys text[];
begin
  -- The profile usually shares the auth id; older accounts were linked later
  -- through auth_user_id or a confirmed phone/email match.
  select id into target_id from public.profiles where id = p_auth_user or auth_user_id = p_auth_user limit 1;
  if target_id is null then return; end if;

  -- Only keys this member owns: their own profile photos, their own identity
  -- documents, and messages they sent. Partner-sent chat media is deliberately
  -- excluded so one account deletion cannot destroy another member's photos.
  select coalesce(array_agg(distinct k) filter (where k is not null), '{}'::text[])
    into media_keys
  from (
    select unnest(coalesce(p.photos, '{}'::text[])) as k
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
     or (k like 'chat/' || target_id::text || '/%');

  insert into public.wassaa_media_purge_queue (user_id, keys)
  values (p_auth_user, media_keys)
  on conflict (user_id) do update set keys = excluded.keys, enqueued_at = now();

  -- Redact safety/audit records exactly like the API deletion path.
  update public.reports set reported_user_id = null, details = '[Report subject account deleted]', service_branch = null
    where reported_user_id = target_id;
  perform public.wassaa_anonymize_admin_audit(target_id);

  delete from public.profiles where id = target_id;
end $$;

revoke all on function public.wassaa_purge_profile_data(uuid) from public, anon, authenticated;
grant execute on function public.wassaa_purge_profile_data(uuid) to service_role;
