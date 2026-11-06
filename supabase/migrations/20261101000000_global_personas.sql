-- WASSAA migration 0011 — global personas + region-aware free chat.
--
-- 1. `profiles.country_code` gives every member and persona a country. Personas
--    are seeded worldwide; members pick theirs during onboarding.
-- 2. Credit packs are sold through Paystack, which only settles in a handful of
--    markets. A verified member outside those markets can never buy a pack, so
--    messaging is free for them. Unverified members outside those markets get a
--    meaningful daily allowance (5 credits) instead of the standard 1 until
--    they verify — verification is the gate, not payment.
-- 3. The seed RPC learns `countryCode`.
-- 4. An admin helper lists paying members so paid conversations sort first.

-- ===================================================== A. country on profiles
alter table public.profiles
  add column if not exists country_code text not null default 'NG';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_country_code_shape') then
    alter table public.profiles add constraint profiles_country_code_shape
      check (country_code ~ '^[A-Z]{2}$') not valid;
  end if;
end $$;
create index if not exists idx_profiles_country on public.profiles (country_code) where deleted_at is null;

-- ===================================================== B. credit region policy
-- Markets where Paystack can actually settle a card payment today.
create or replace function public.wassaa_credit_region_supported(p_country text)
returns boolean language sql immutable as $$
  select coalesce(upper(nullif(btrim(p_country), '')), 'NG') in ('NG', 'GH', 'ZA', 'KE');
$$;

-- Free messaging: verified member in a market where packs cannot be sold.
create or replace function public.wassaa_is_free_chat(p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p.verification_status = 'verified'
              and not public.wassaa_credit_region_supported(p.country_code), false)
  from public.profiles p where p.id = p_profile;
$$;

-- Daily allowance: unsupported-region members who are not verified yet get
-- enough credits to hold a conversation (5/day); everyone else keeps 1/day.
create or replace function public.wassaa_daily_drip(p_profile uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  bal integer;
  grant_amount integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile::text, 44));
  select case when public.wassaa_is_free_chat(p_profile) then 0
              when not public.wassaa_credit_region_supported(p.country_code)
                   and p.verification_status is distinct from 'verified' then 5
              else 1 end
    into grant_amount
    from public.profiles p where p.id = p_profile;
  if grant_amount is null then return -1; end if;
  update public.profiles set last_credit_drip = current_date
   where id = p_profile and (last_credit_drip is null or last_credit_drip < current_date);
  if not found then
    select credits into bal from public.profiles where id = p_profile;
    return coalesce(bal, -1);
  end if;
  update public.profiles set credits = credits + grant_amount, updated_at = now()
   where id = p_profile returning credits into bal;
  if bal is null then return -1; end if;
  insert into public.credit_ledger(profile_id, delta, reason, reference, balance_after)
  values (p_profile, grant_amount, 'daily_drip', current_date::text, bal);
  return bal;
end $$;
revoke all on function public.wassaa_daily_drip(uuid) from public, anon, authenticated;
grant execute on function public.wassaa_daily_drip(uuid) to service_role;

-- ===================================================== C. send with free chat
-- Same contract as before, plus: a free-chat member spends nothing, and the
-- response says so (`free: true`) so the client can explain it.
create or replace function public.wassaa_send_message(
  p_match uuid,
  p_sender uuid,
  p_kind text default 'text',
  p_text text default null,
  p_media_url text default null,
  p_caption text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_match record;
  v_partner uuid;
  v_is_npc boolean := false;
  v_free boolean := false;
  v_bal integer;
  v_msg_id uuid;
begin
  if p_kind not in ('text', 'photo') then
    return jsonb_build_object('error', 'bad_kind');
  end if;
  if p_kind = 'text' and coalesce(btrim(p_text), '') = '' then
    return jsonb_build_object('error', 'bad_text');
  end if;
  if p_kind = 'photo' and coalesce(btrim(p_media_url), '') = '' then
    return jsonb_build_object('error', 'bad_media');
  end if;

  select user_a, user_b, auto_state into v_match
    from public.matches where id = p_match;
  if v_match.user_a is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if p_sender is null or (p_sender <> v_match.user_a and p_sender <> v_match.user_b) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  v_partner := case when p_sender = v_match.user_a then v_match.user_b else v_match.user_a end;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_sender and b.blocked_id = v_partner)
       or (b.blocker_id = v_partner and b.blocked_id = p_sender)
  ) then
    return jsonb_build_object('error', 'blocked');
  end if;

  select coalesce(n.is_npc and n.npc_active and n.deleted_at is null, false)
    into v_is_npc
    from public.profiles n where n.id = v_partner;

  v_free := public.wassaa_is_free_chat(p_sender);
  if v_free then
    select credits into v_bal from public.profiles where id = p_sender;
    v_bal := coalesce(v_bal, 0);
  else
    -- 1 credit per message sent, persona or real (KB §18E).
    select public.wassaa_spend_credit(
      p_sender, 1,
      case when v_is_npc then 'npc_message' else 'message' end,
      p_match::text
    ) into v_bal;
    if v_bal is null or v_bal < 0 then
      return jsonb_build_object('error', 'no_credits');
    end if;
  end if;

  insert into public.messages (match_id, sender_id, kind, text, media_url, caption)
  values (p_match, p_sender::text, p_kind, p_text, p_media_url, p_caption)
  returning id into v_msg_id;

  -- Persona threads: a member message opens the engine's reply window. Quiet
  -- (reply budget spent) and admin-owned (human-operated) threads stay put.
  if v_is_npc and v_match.auto_state in ('none', 'active') then
    update public.matches
       set auto_state = 'active',
           auto_next_at = now() + make_interval(secs => (20 + floor(random() * 70))::int)
     where id = p_match;
  end if;

  return jsonb_build_object('ok', true, 'messageId', v_msg_id, 'balance', v_bal, 'free', v_free);
end $$;
revoke all on function public.wassaa_send_message(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.wassaa_send_message(uuid, uuid, text, text, text, text) to service_role;

-- ===================================================== D. seed RPC + country
create or replace function public.wassaa_seed_npcs(p_profiles jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; n integer := 0;
begin
  if jsonb_typeof(p_profiles) <> 'array' then
    raise exception 'expected a jsonb array of NPC profiles';
  end if;
  for item in select value from jsonb_array_elements(p_profiles) loop
    insert into public.profiles (
      name, birth_date, gender, pronouns,
      profession_category, profession_title, company_or_org, service, org_role, skill, duty_station,
      education_level, alma_mater,
      city, state, country_code, bio, photos, interests, dating_goal, match_preferences,
      prompts, lifestyle, values_family,
      location_lat, location_lng,
      class_of_service, is_npc, npc, npc_active,
      verification_status, verified_at, credits, account_status, created_at
    ) values (
      left(item->>'name', 60),
      (item->>'birthDate')::date,
      item->>'gender',
      nullif(left(coalesce(item->>'pronouns', ''), 40), ''),
      left(item->>'professionCategory', 60),
      left(item->>'professionTitle', 80),
      nullif(left(coalesce(item->>'companyOrOrg', ''), 120), ''),
      nullif(left(coalesce(item->>'service', ''), 80), ''),
      nullif(left(coalesce(item->>'orgRole', ''), 20), ''),
      nullif(left(coalesce(item->>'skill', ''), 60), ''),
      nullif(left(coalesce(item->>'dutyStation', ''), 120), ''),
      nullif(left(coalesce(item->>'educationLevel', ''), 80), ''),
      nullif(left(coalesce(item->>'almaMater', ''), 120), ''),
      left(item->>'city', 100),
      left(item->>'state', 100),
      coalesce(nullif(upper(left(item->>'countryCode', 2)), ''), 'NG'),
      left(item->>'bio', 1000),
      array(select jsonb_array_elements_text(coalesce(item->'photos', '[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(item->'interests', '[]'::jsonb))),
      item->>'datingGoal',
      (item->'matchPreferences')::jsonb,
      case when jsonb_typeof(item->'prompts') = 'array' then item->'prompts' else '[]'::jsonb end,
      nullif((item->'lifestyle')::jsonb, 'null'::jsonb),
      nullif((item->'values')::jsonb, 'null'::jsonb),
      (item->>'lat')::double precision,
      (item->>'lng')::double precision,
      item->>'classOfService',
      true,
      (item->'persona')::jsonb,
      coalesce((item->>'active')::boolean, true),
      case when item->>'verificationStatus' = 'not_started' then 'not_started' else 'verified' end,
      case when item->>'verificationStatus' = 'not_started' then null else current_date end,
      0, 'active',
      now() - make_interval(days => coalesce((item->>'ageDays')::int, 0))
    );
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.wassaa_seed_npcs(jsonb) from public, anon, authenticated;
grant execute on function public.wassaa_seed_npcs(jsonb) to service_role;

-- ===================================================== E. admin priority helper
-- Paying members, most recent purchase first. Admin thread lists use this to
-- put paid conversations at the top of the queue.
create or replace function public.wassaa_admin_paid_members()
returns table(profile_id uuid, purchased_at timestamptz, credits_bought bigint)
language sql stable security definer set search_path = '' as $$
  select l.profile_id, max(l.created_at) as purchased_at, sum(l.delta)::bigint as credits_bought
  from public.credit_ledger l
  where l.reason = 'purchase' and l.delta > 0
  group by l.profile_id;
$$;
revoke all on function public.wassaa_admin_paid_members() from public, anon, authenticated;
grant execute on function public.wassaa_admin_paid_members() to service_role;

-- ===================================================== F. thread activity
-- Admin queues sort by the last thing said. A trigger keeps the timestamp on
-- the match row, so listing threads never needs an N+1 message query.
alter table public.matches add column if not exists last_message_at timestamptz;
create index if not exists idx_matches_last_message on public.matches (last_message_at desc);

create or replace function public.wassaa_touch_match() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.matches set last_message_at = new.created_at where id = new.match_id;
  return new;
end $$;

drop trigger if exists trg_messages_touch_match on public.messages;
create trigger trg_messages_touch_match after insert on public.messages
  for each row execute function public.wassaa_touch_match();

update public.matches m
   set last_message_at = x.last_at
  from (select match_id, max(created_at) as last_at from public.messages group by match_id) x
 where x.match_id = m.id and m.last_message_at is null;
