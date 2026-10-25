-- Keep legacy profile IDs stable while binding each account to Supabase Auth.
alter table public.profiles alter column phone drop not null;
alter table public.profiles add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
alter table public.reports alter column reported_user_id drop not null;
create index if not exists idx_profiles_auth_user on public.profiles(auth_user_id) where auth_user_id is not null;

create or replace function public.link_auth_user_to_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.phone is null or new.phone = '' or new.phone_confirmed_at is null then return new; end if;
  update public.profiles set auth_user_id = new.id, updated_at = now()
   where phone = new.phone and (auth_user_id is null or auth_user_id = new.id);
  if not found then
    insert into public.profiles (id, auth_user_id, phone) values (new.id, new.id, new.phone)
    on conflict (phone) do update set auth_user_id = excluded.auth_user_id, updated_at = now()
      where public.profiles.auth_user_id is null or public.profiles.auth_user_id = excluded.auth_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists wassaa_auth_profile_link on auth.users;
create trigger wassaa_auth_profile_link after insert or update of phone, phone_confirmed_at on auth.users
for each row execute function public.link_auth_user_to_profile();

-- Link accounts that were already phone-authenticated before this migration.
update public.profiles p set auth_user_id = u.id, updated_at = now()
from auth.users u
where u.phone_confirmed_at is not null and u.phone = p.phone
  and (p.auth_user_id is null or p.auth_user_id = u.id);

create or replace function public.wassaa_submit_verification(
  p_user uuid, p_document_type text, p_document_number_masked text, p_id_doc_url text, p_selfie_url text
) returns table(result text, submission_id uuid)
language plpgsql security definer set search_path = '' as $$
declare current_status text; new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 2));
  select verification_status into current_status from public.profiles where id=p_user and deleted_at is null;
  if current_status is null then return query select 'missing'::text, null::uuid; return; end if;
  if current_status='verified' then return query select 'verified'::text, null::uuid; return; end if;
  select id into new_id from public.verification_submissions where user_id=p_user and status='pending' limit 1;
  if new_id is not null then return query select 'pending'::text, new_id; return; end if;
  insert into public.verification_submissions(user_id,document_type,document_number_masked,id_doc_url,selfie_url,status)
  values(p_user,p_document_type,p_document_number_masked,p_id_doc_url,p_selfie_url,'pending') returning id into new_id;
  update public.profiles set verification_status='pending',document_type=p_document_type,updated_at=now() where id=p_user;
  return query select 'created'::text, new_id;
end $$;
revoke all on function public.wassaa_submit_verification(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.wassaa_submit_verification(uuid,text,text,text,text) to service_role;

-- Deny direct browser access. The API Edge Function verifies user JWTs, then
-- applies ownership checks before using its server-only service key.
do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','otp_sessions','swipes','matches','messages','match_reads','blocks','reports','verification_submissions','payments','admin_audit'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end $$;
grant usage, select on sequence public.admin_audit_id_seq to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

revoke all on function public.link_auth_user_to_profile() from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.link_auth_user_to_profile() to supabase_auth_admin;

-- Serialize likes per member and create mutual matches atomically. These RPCs
-- run as definer because browser roles have no table privileges.
create or replace function public.wassaa_record_like(
  p_from uuid, p_to uuid, p_kind text, p_daily_limit integer, p_weekly_super_limit integer
) returns text language plpgsql security definer set search_path = '' as $$
declare used integer;
begin
  if p_from = p_to or p_kind not in ('like','super') then return 'invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_from::text, 0));
  if exists (select 1 from public.swipes where from_user_id=p_from and to_user_id=p_to) then return 'already'; end if;
  if exists (select 1 from public.blocks where (blocker_id=p_from and blocked_id=p_to) or (blocker_id=p_to and blocked_id=p_from)) then return 'blocked'; end if;
  if p_daily_limit >= 0 then
    select count(*) into used from public.swipes where from_user_id=p_from and kind <> 'pass' and created_at >= date_trunc('day', now());
    if used >= p_daily_limit then return 'daily_limit'; end if;
  end if;
  if p_kind='super' then
    select count(*) into used from public.swipes where from_user_id=p_from and kind='super' and created_at >= now() - interval '7 days';
    if used >= p_weekly_super_limit then return 'super_limit'; end if;
  end if;
  insert into public.swipes(from_user_id,to_user_id,kind) values(p_from,p_to,p_kind);
  return 'recorded';
end $$;

create or replace function public.wassaa_find_or_create_match(p_a uuid, p_b uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; b uuid; match_id uuid; partner_name text;
begin
  if p_a=p_b then return null; end if;
  a := least(p_a,p_b); b := greatest(p_a,p_b);
  perform pg_advisory_xact_lock(hashtextextended(a::text || b::text, 1));
  select id into match_id from public.matches where user_a=a and user_b=b;
  if match_id is not null then return match_id; end if;
  if not exists(select 1 from public.swipes where from_user_id=p_a and to_user_id=p_b and kind <> 'pass')
     or not exists(select 1 from public.swipes where from_user_id=p_b and to_user_id=p_a and kind <> 'pass') then return null; end if;
  insert into public.matches(user_a,user_b) values(a,b) on conflict(user_a,user_b) do update set user_a=excluded.user_a returning id into match_id;
  select name into partner_name from public.profiles where id=p_b;
  insert into public.messages(match_id,sender_id,kind,text)
  values(match_id,'system','system','You matched! Be kind, be safe — say hello to ' || coalesce(partner_name,'your match') || '.')
  on conflict do nothing;
  return match_id;
end $$;

revoke all on function public.wassaa_record_like(uuid,uuid,text,integer,integer) from public, anon, authenticated;
revoke all on function public.wassaa_find_or_create_match(uuid,uuid) from public, anon, authenticated;
grant execute on function public.wassaa_record_like(uuid,uuid,text,integer,integer) to service_role;
grant execute on function public.wassaa_find_or_create_match(uuid,uuid) to service_role;

create or replace function public.wassaa_match_summaries(p_user uuid, p_limit integer default 100)
returns table(match_id uuid, matched_at timestamptz, partner_id uuid, unread_count integer, last_kind text, last_text text, last_caption text, last_created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.created_at,
         case when m.user_a=p_user then m.user_b else m.user_a end,
         (select count(*)::integer from public.messages unread
           where unread.match_id=m.id
             and unread.sender_id=(case when m.user_a=p_user then m.user_b else m.user_a end)::text
             and unread.kind <> 'system'
             and unread.created_at > coalesce(r.last_read_at,m.created_at)),
         last_msg.kind, last_msg.text, last_msg.caption, last_msg.created_at
  from public.matches m
  left join public.match_reads r on r.match_id=m.id and r.user_id=p_user
  left join lateral (
    select msg.kind,msg.text,msg.caption,msg.created_at
    from public.messages msg where msg.match_id=m.id
    order by msg.created_at desc limit 1
  ) last_msg on true
  where m.user_a=p_user or m.user_b=p_user
  order by coalesce(last_msg.created_at,m.created_at) desc
  limit least(greatest(p_limit,1),100)
$$;
revoke all on function public.wassaa_match_summaries(uuid,integer) from public, anon, authenticated;
grant execute on function public.wassaa_match_summaries(uuid,integer) to service_role;

create table if not exists public.api_rate_limits (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  bucket text not null,
  window_started_at timestamptz not null,
  hits integer not null,
  primary key(actor_id,bucket)
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;
grant all on public.api_rate_limits to service_role;

create or replace function public.wassaa_consume_rate_limit(p_actor uuid, p_bucket text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare rl public.api_rate_limits%rowtype;
begin
  insert into public.api_rate_limits(actor_id,bucket,window_started_at,hits)
  values(p_actor,p_bucket,now(),1)
  on conflict(actor_id,bucket) do update set
    window_started_at = case when public.api_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= now() then now() else public.api_rate_limits.window_started_at end,
    hits = case when public.api_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= now() then 1 else public.api_rate_limits.hits + 1 end
  returning * into rl;
  return rl.hits <= p_max;
end $$;
revoke all on function public.wassaa_consume_rate_limit(uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.wassaa_consume_rate_limit(uuid,text,integer,integer) to service_role;

create or replace function public.wassaa_fulfill_payment(p_reference text, p_channel text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare payment_row public.payments%rowtype;
begin
  update public.payments set status='success', channel=p_channel, paid_at=now()
  where reference=p_reference and status='pending' returning * into payment_row;
  if not found then return false; end if;
  if payment_row.plan_id in ('premium','hyper_premium') then
    update public.profiles set tier = case
      when payment_row.plan_id='hyper_premium' then 'hyper_premium'
      when tier='free' then 'premium'
      else tier end,
      updated_at=now()
    where id=payment_row.user_id;
  end if;
  return true;
end $$;
revoke all on function public.wassaa_fulfill_payment(text,text) from public, anon, authenticated;
grant execute on function public.wassaa_fulfill_payment(text,text) to service_role;

create or replace function public.wassaa_anonymize_admin_audit(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  update public.admin_audit set target_id=null, detail=coalesce(detail,'{}'::jsonb) - 'userId'
  where target_id=p_user::text or detail->>'userId'=p_user::text
$$;
revoke all on function public.wassaa_anonymize_admin_audit(uuid) from public, anon, authenticated;
grant execute on function public.wassaa_anonymize_admin_audit(uuid) to service_role;
