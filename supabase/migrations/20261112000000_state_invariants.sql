-- State invariants (2026-11-12)
--
-- Several product states were encoded in more than one place, so a legal-looking
-- row could mean two different things at once:
--
--   account standing : profiles.blocked_us  vs  profiles.account_status
--   persona visibility: profiles.npc_active vs  npc_photo_review / npc.photoState
--   boost             : read boosted_until, charge, write boosted_until (3 steps)
--   reveal likes      : charge, then write revealed_likes_at (2 steps)
--
-- This migration makes the database the single source of truth for the states
-- that are only reachable through SQL, and adds atomic transitions where a
-- crash or a double tap could charge a member twice. Applied migrations are
-- never edited; every body below is a full replacement of the current one.

-- =========================================================== 1. discovery
-- Banned accounts must not appear in anyone's deck, and a persona is only
-- visible when it has an approved face: active, not quarantined, and not
-- waiting for a human-chosen photo. Previously only npc_active was checked,
-- so a quarantined-but-active row (direct DB write, legacy seed) leaked.
create or replace function public.wassaa_discovery(
  p_viewer uuid,
  p_limit integer default 15,
  p_profession text default null,
  p_service text default null,
  p_city text default null,
  p_gender text default null,
  p_min_age integer default null,
  p_max_age integer default null,
  p_max_distance_km integer default null
) returns setof public.profiles
language sql stable security definer set search_path = '' as $$
  with viewer as (
    select v.id, v.gender, v.birth_date, v.city, v.state, v.profession_category, v.service,
           v.interests, v.dating_goal, v.location_lat, v.location_lng,
           v.match_preferences,
           coalesce(p_min_age, (v.match_preferences->>'minAge')::int, 18) as min_age,
           coalesce(p_max_age, (v.match_preferences->>'maxAge')::int, 99) as max_age,
           coalesce(p_max_distance_km, nullif(v.match_preferences->>'maxDistanceKm', '')::int) as max_distance_km,
           case lower(coalesce(p_gender, ''))
             when 'men' then 'male' when 'women' then 'female'
             when 'male' then 'male' when 'female' then 'female'
             else null end as wanted_gender,
           case when lower(coalesce(p_gender, '')) in ('men','women','male','female') then null
                else v.match_preferences->>'gender' end as pref_gender
    from public.profiles v where v.id = p_viewer
  ), eligible as (
    select c.*, c as full_row,
      case when v.location_lat is null or v.location_lng is null or c.location_lat is null or c.location_lng is null then null
           else 6371.0 * 2 * asin(sqrt(least(1.0, greatest(0.0,
             power(sin(radians(c.location_lat - v.location_lat) / 2), 2)
             + cos(radians(v.location_lat)) * cos(radians(c.location_lat))
             * power(sin(radians(c.location_lng - v.location_lng) / 2), 2)
           )))) end as distance_km,
      v.id as viewer_id, v.gender as viewer_gender, v.birth_date as viewer_birth_date,
      v.city as viewer_city, v.state as viewer_state,
      v.profession_category as viewer_profession, v.service as viewer_service,
      v.interests as viewer_interests, v.dating_goal as viewer_goal,
      v.min_age as viewer_min_age, v.max_age as viewer_max_age,
      v.max_distance_km, v.wanted_gender, v.pref_gender
    from public.profiles c cross join viewer v
    where c.id <> v.id
      and c.deleted_at is null and c.blocked_us = false
      and coalesce(c.account_status, 'active') <> 'banned'
      and (c.is_npc = false or (
        c.npc_active = true
        and coalesce(c.npc_photo_review, 'ok') <> 'quarantine'
        and coalesce(c.npc->>'photoState', 'ready') <> 'awaiting_upload'
      ))
      and char_length(btrim(coalesce(c.name, ''))) >= 2 and c.name <> 'New member'
      and c.gender in ('female', 'male')
      and cardinality(c.photos) >= 2
      and char_length(btrim(coalesce(c.profession_title, ''))) >= 2
      and char_length(btrim(coalesce(c.city, ''))) >= 2
      and char_length(btrim(coalesce(c.state, ''))) >= 2
      and char_length(btrim(coalesce(c.bio, ''))) >= 10
      and cardinality(c.interests) >= 3
      and c.dating_goal is not null
      and c.birth_date is not null
      and not exists (select 1 from public.swipes s where s.from_user_id = v.id and s.to_user_id = c.id)
      and not exists (select 1 from public.blocks b where (b.blocker_id = v.id and b.blocked_id = c.id) or (b.blocker_id = c.id and b.blocked_id = v.id))
      -- Latitude bounding box uses the partial coordinate index to reduce
      -- candidates before the precise great-circle radius check below.
      and (v.max_distance_km is null or v.location_lat is null
        or (c.location_lat is not null and c.location_lat between
          greatest(-90.0, v.location_lat - v.max_distance_km / 111.0)
          and least(90.0, v.location_lat + v.max_distance_km / 111.0)))
      and c.birth_date <= current_date - make_interval(years => v.min_age)
      and c.birth_date > current_date - make_interval(years => v.max_age + 1)
      and (v.pref_gender is null or v.pref_gender = 'everyone'
        or (v.pref_gender = 'men' and c.gender = 'male')
        or (v.pref_gender = 'women' and c.gender = 'female'))
      and (coalesce(c.match_preferences->>'gender', 'everyone') = 'everyone'
        or (c.match_preferences->>'gender' = 'men' and v.gender = 'male')
        or (c.match_preferences->>'gender' = 'women' and v.gender = 'female'))
      and (v.birth_date is null
        or (c.match_preferences->>'minAge' is null and c.match_preferences->>'maxAge' is null)
        or extract(year from age(v.birth_date))::int between coalesce((c.match_preferences->>'minAge')::int, 18)
          and coalesce((c.match_preferences->>'maxAge')::int, 99))
      and (p_profession is null or p_profession = 'All' or c.profession_category = p_profession)
      and (p_service is null or p_service = 'All' or c.service = p_service)
      and (p_city is null or p_city = 'All' or c.city ilike p_city)
      and (v.wanted_gender is null or c.gender = v.wanted_gender)
  ), ranked as (
    select e.*,
      (case
        when e.dating_goal = e.viewer_goal then 24
        when e.dating_goal in ('marriage','long_term','intentional') and e.viewer_goal in ('marriage','long_term','intentional') then 17
        when e.dating_goal is null or e.viewer_goal is null then 8
        else 4 end)
      + case when cardinality(e.viewer_interests) > 0 and cardinality(e.interests) > 0 then
          20.0 * (select count(*) from unnest(e.interests) ci where ci = any(e.viewer_interests))
          / greatest(least(cardinality(e.interests), cardinality(e.viewer_interests)), 1)
        else 0 end
      + case when e.profession_category = e.viewer_profession then 7 else 0 end
      + case when e.service is not null and e.service = e.viewer_service then 5 else 0 end
      + case when e.distance_km is not null then greatest(0.0, 22.0 * (1.0 - least(e.distance_km, 500.0) / 500.0))
             when lower(e.city) = lower(e.viewer_city) and lower(e.state) = lower(e.viewer_state) then 12 else 0 end
      + least(cardinality(e.photos), 5) * 2
      + least(char_length(e.bio), 300) / 60.0
      + greatest(0, 8 - extract(day from now() - e.created_at)::int * 0.2)
      + case when e.boosted_until is not null and e.boosted_until > now() then 15 else 0 end
      as compatibility_score
    from eligible e
  ), filtered as (
    select * from ranked r
    where r.max_distance_km is null
       or (r.distance_km is not null and r.distance_km <= r.max_distance_km)
  ), comp as (
    select f.*,
      row_number() over (partition by f.is_npc
        order by f.compatibility_score desc, f.distance_km asc nulls last, f.created_at desc) as rn,
      count(*) filter (where f.is_npc) over () as n_npc,
      count(*) filter (where not f.is_npc) over () as n_real,
      least(greatest(coalesce(p_limit, 15), 1), 30) as take
    from filtered f
  ), plan as (
    -- Real candidates claim their slots first; NPCs pad the remainder, but a
    -- 25% floor guarantees NPCs never disappear entirely as real density grows.
    select c.*,
      least(c.n_npc,
        greatest(c.take - c.n_real, round(c.take * 0.25)::int)) as npc_take
    from comp c
  )
  select (p.full_row).* from plan p
  where (not p.is_npc and p.rn <= p.take - p.npc_take)
     or (p.is_npc and p.rn <= p.npc_take)
  order by p.is_npc asc, p.compatibility_score desc, p.distance_km asc nulls last, p.created_at desc
  -- LIMIT may only contain function parameters, never column references (42P10);
  -- this expression equals `take`, and the row_number filters already cap it.
  limit least(greatest(coalesce(p_limit, 15), 1), 30)
$$;
revoke all on function public.wassaa_discovery(uuid, integer, text, text, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.wassaa_discovery(uuid, integer, text, text, text, text, integer, integer, integer) to service_role;

-- ======================================================= 2. send_message
-- Refuse to charge a member for a thread whose other side can never answer:
-- a banned or erased member, or a persona that is paused, quarantined or has
-- no human-approved photo. The old body kept spending credits and inserting
-- messages into those dead threads.
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
  v_mutual boolean := false;
  v_cold_sent integer := 0;
  v_cost integer;
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

  -- One definition of "reachable", checked before a single credit moves.
  -- An admin-owned thread is staff-operated, so a paused persona does not make
  -- it dead; every other thread requires a persona the deck would show.
  if exists (
    select 1 from public.profiles p
    where p.id = v_partner
      and (
        p.deleted_at is not null
        or p.blocked_us
        or coalesce(p.account_status, 'active') = 'banned'
        or (p.is_npc and v_match.auto_state <> 'admin_owned' and (
          not p.npc_active
          or coalesce(p.npc_photo_review, 'ok') = 'quarantine'
          or coalesce(p.npc->>'photoState', 'ready') = 'awaiting_upload'
        ))
      )
  ) then
    return jsonb_build_object('error', 'unavailable');
  end if;

  -- Warm pricing follows the participant type, not the persona's live flag:
  -- pausing a persona mid-conversation used to drop the thread to cold pricing
  -- and the three-message cap.
  select coalesce(n.is_npc, false)
    into v_is_npc
    from public.profiles n where n.id = v_partner;

  -- Mutual = both directions liked. A one-sided thread is a cold open, but a
  -- live persona thread is always treated as warm (see header).
  v_mutual :=
       exists(select 1 from public.swipes s where s.from_user_id = p_sender and s.to_user_id = v_partner and s.kind <> 'pass')
   and exists(select 1 from public.swipes s where s.from_user_id = v_partner and s.to_user_id = p_sender and s.kind <> 'pass');

  v_free := public.wassaa_is_free_chat(p_sender);
  if v_free then
    select credits into v_bal from public.profiles where id = p_sender;
    v_bal := coalesce(v_bal, 0);
  else
    if v_mutual or v_is_npc then
      v_cost := case when p_kind = 'text' then 5 else 10 end;
    else
      select count(*) into v_cold_sent
        from public.messages
       where match_id = p_match
         and sender_id = p_sender::text
         and kind in ('text', 'photo');
      if v_cold_sent >= 3 then
        return jsonb_build_object(
          'error', 'cold_limit',
          'message', 'You can send up to 3 messages before they like you back.');
      end if;
      -- 10 / 15 / 20 for text, 20 / 25 / 30 for media.
      v_cost := (case when p_kind = 'text' then 10 else 20 end) + (v_cold_sent * 5);
    end if;

    select public.wassaa_spend_credit(
      p_sender, v_cost,
      case when v_is_npc then 'npc_message' else 'message' end,
      p_match::text
    ) into v_bal;
    if v_bal is null or v_bal < 0 then
      return jsonb_build_object('error', 'no_credits', 'cost', v_cost);
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

  return jsonb_build_object(
    'ok', true,
    'messageId', v_msg_id,
    'balance', v_bal,
    'free', v_free,
    'mutual', v_mutual or v_is_npc,
    'cost', v_cost);
end $$;
revoke all on function public.wassaa_send_message(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.wassaa_send_message(uuid, uuid, text, text, text, text) to service_role;

-- ======================================================== 3. npc_reply
-- The lazy engine already filters these rows, but the RPC is the write path:
-- it must not speak for a paused, quarantined or face-less persona either.
create or replace function public.wassaa_npc_reply(p_match uuid, p_text text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.matches%rowtype; npc_id uuid; msg_id uuid; spent integer;
begin
  select * into m from public.matches where id = p_match for update;
  if not found then return null; end if;
  if m.auto_state not in ('none','active') then return null; end if;
  select id into npc_id from public.profiles
   where id in (m.user_a, m.user_b)
     and is_npc and npc_active and deleted_at is null
     and coalesce(npc_photo_review, 'ok') <> 'quarantine'
     and coalesce(npc->>'photoState', 'ready') <> 'awaiting_upload';
  if npc_id is null then return null; end if;
  if m.auto_spent >= 15 then
    update public.matches set auto_state = 'quiet', auto_next_at = null where id = p_match;
    return null;
  end if;
  spent := m.auto_spent + 1;
  insert into public.messages (match_id, sender_id, kind, text)
  values (p_match, npc_id::text, 'text', p_text)
  returning id into msg_id;
  update public.matches set
    auto_spent = spent,
    auto_next_at = null,
    auto_state = case
      when spent >= 15 then 'quiet'
      when auto_state = 'none' then 'active'
      else auto_state end
  where id = p_match;
  return msg_id;
end $$;
revoke all on function public.wassaa_npc_reply(uuid, text) from public, anon, authenticated;
grant execute on function public.wassaa_npc_reply(uuid, text) to service_role;

-- ======================================================== 4. start_boost
-- One transition: lock the member, spend, extend, write. Two concurrent taps
-- used to both read the same pre-boost timestamp (two charges, one hour) and a
-- failed write after a successful spend silently took the credits.
create or replace function public.wassaa_start_boost(p_profile uuid, p_cost integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_until timestamptz;
  v_bal integer;
begin
  if p_cost is null or p_cost <= 0 then
    return jsonb_build_object('error', 'bad_cost');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_profile::text, 47));
  select boosted_until into v_until
    from public.profiles
   where id = p_profile
     and deleted_at is null
     and blocked_us = false
     and coalesce(account_status, 'active') = 'active';
  if not found then
    return jsonb_build_object('error', 'unavailable');
  end if;
  select public.wassaa_spend_credit(p_profile, p_cost, 'boost', null) into v_bal;
  if v_bal is null or v_bal < 0 then
    return jsonb_build_object('error', 'no_credits', 'cost', p_cost);
  end if;
  v_until := greatest(coalesce(v_until, now()), now()) + interval '1 hour';
  update public.profiles
     set boosted_until = v_until, updated_at = now()
   where id = p_profile;
  return jsonb_build_object('ok', true, 'balance', v_bal, 'boostedUntil', v_until);
end $$;
revoke all on function public.wassaa_start_boost(uuid, integer) from public, anon, authenticated;
grant execute on function public.wassaa_start_boost(uuid, integer) to service_role;

-- ======================================================= 5. reveal_likes
-- The 15-credit reveal was charged first and stamped second. A failed stamp or
-- a second tap inside the same second charged the member again. This RPC owns
-- both steps and treats an already-open 24h window as a no-op.
create or replace function public.wassaa_reveal_likes(p_profile uuid, p_cost integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_until timestamptz;
  v_bal integer;
  v_now timestamptz := now();
begin
  if p_cost is null or p_cost <= 0 then
    return jsonb_build_object('error', 'bad_cost');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_profile::text, 49));
  select revealed_likes_at into v_until
    from public.profiles
   where id = p_profile and deleted_at is null;
  if not found then
    return jsonb_build_object('error', 'unavailable');
  end if;
  if v_until is not null and v_until > v_now - interval '24 hours' then
    select credits into v_bal from public.profiles where id = p_profile;
    return jsonb_build_object('ok', true, 'already', true, 'balance', coalesce(v_bal, 0), 'revealedAt', v_until);
  end if;
  select public.wassaa_spend_credit(p_profile, p_cost, 'reveal_likes', null) into v_bal;
  if v_bal is null or v_bal < 0 then
    return jsonb_build_object('error', 'no_credits', 'cost', p_cost);
  end if;
  update public.profiles
     set revealed_likes_at = v_now, updated_at = v_now
   where id = p_profile;
  return jsonb_build_object('ok', true, 'already', false, 'balance', v_bal, 'revealedAt', v_now);
end $$;
revoke all on function public.wassaa_reveal_likes(uuid, integer) from public, anon, authenticated;
grant execute on function public.wassaa_reveal_likes(uuid, integer) to service_role;

-- ==================================================== 6. standing backfill
-- Rows written before `account_status` existed carry only `blocked_us`. Fold
-- both directions into one standing before enforcing it.
update public.profiles
   set account_status = 'banned',
       restriction_reason = coalesce(restriction_reason, 'Blocked by staff after a report review.'),
       blocked_us = true,
       updated_at = now()
 where blocked_us
   and account_status <> 'banned';

update public.profiles
   set blocked_us = true, updated_at = now()
 where account_status = 'banned'
   and not blocked_us;

-- `blocked_us` is now only a mirror of the banned rung. A writer cannot create
-- the old half-state (blocked in the deck, active in the session) again: a
-- trigger normalises either spelling instead of rejecting it, so a console or
-- script that still writes only one column lands in the same state.
create or replace function public.wassaa_sync_account_standing()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.blocked_us and coalesce(new.account_status, 'active') <> 'banned' then
    new.account_status := 'banned';
    new.restriction_reason := coalesce(new.restriction_reason, 'Blocked by staff after a report review.');
  end if;
  if new.account_status = 'banned' then
    new.blocked_us := true;
  end if;
  return new;
end $$;

drop trigger if exists wassaa_sync_account_standing on public.profiles;
create trigger wassaa_sync_account_standing
  before insert or update of blocked_us, account_status on public.profiles
  for each row execute function public.wassaa_sync_account_standing();

-- ================================================= 7. paid-swipe ledger reason
-- The daily swipe cap sells one extra swipe for a credit with reason
-- 'extra_swipe', but the ledger check never listed it. Every attempt raised a
-- check violation and the member was told they had no credits, even with a
-- full balance. Add the missing reason.
alter table public.credit_ledger drop constraint if exists credit_ledger_reason_check;
alter table public.credit_ledger
  add constraint credit_ledger_reason_check check (reason in (
    'signup_grant','daily_drip','purchase','npc_message','message','super_like',
    'boost','reveal_likes','refund','admin_adjust','extra_swipe'));

-- ================================================== 8. like / match guards
-- `/likes` checks the target, but the RPCs are the last line of defence: no
-- swipe and no match may involve a banned or erased account, or a persona the
-- deck is hiding.
create or replace function public.wassaa_record_like(
  p_from uuid, p_to uuid, p_kind text, p_daily_limit integer, p_weekly_super_limit integer
) returns text language plpgsql security definer set search_path = '' as $$
declare used integer;
begin
  if p_from = p_to or p_kind not in ('like','super') then return 'invalid'; end if;
  if exists (
    select 1 from public.profiles p
     where p.id in (p_from, p_to)
       and (p.deleted_at is not null or p.blocked_us or coalesce(p.account_status, 'active') = 'banned')
  ) then return 'blocked'; end if;
  if exists (
    select 1 from public.profiles p
     where p.id = p_to and p.is_npc
       and (not p.npc_active
            or coalesce(p.npc_photo_review, 'ok') = 'quarantine'
            or coalesce(p.npc->>'photoState', 'ready') = 'awaiting_upload')
  ) then return 'blocked'; end if;
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
revoke all on function public.wassaa_record_like(uuid,uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.wassaa_record_like(uuid,uuid,text,integer,integer) to service_role;

create or replace function public.wassaa_find_or_create_match(p_a uuid, p_b uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; b uuid; match_id uuid; partner_name text; v_origin text;
begin
  if p_a = p_b then return null; end if;
  if exists (
    select 1 from public.profiles p
     where p.id in (p_a, p_b)
       and (p.deleted_at is not null or p.blocked_us or coalesce(p.account_status, 'active') = 'banned')
  ) then return null; end if;
  a := least(p_a, p_b); b := greatest(p_a, p_b);
  perform pg_advisory_xact_lock(hashtextextended(a::text || b::text, 1));
  select id, origin into match_id, v_origin from public.matches where user_a = a and user_b = b;
  if match_id is not null then
    if v_origin = 'cold' then
      update public.matches set origin = 'match' where id = match_id;
      select name into partner_name from public.profiles where id = p_b;
      insert into public.messages(match_id, sender_id, kind, text)
      values(match_id, 'system', 'system',
             'You matched! Be kind, be safe — say hello to ' || coalesce(partner_name, 'your match') || '.')
      on conflict do nothing;
    end if;
    return match_id;
  end if;
  if not exists (select 1 from public.swipes where from_user_id = p_a and to_user_id = p_b and kind <> 'pass')
     or not exists (select 1 from public.swipes where from_user_id = p_b and to_user_id = p_a and kind <> 'pass') then
    return null;
  end if;
  insert into public.matches(user_a, user_b, origin) values(a, b, 'match')
  on conflict (user_a, user_b) do update set origin = 'match'
  returning id into match_id;
  select name into partner_name from public.profiles where id = p_b;
  insert into public.messages(match_id, sender_id, kind, text)
  values(match_id, 'system', 'system',
         'You matched! Be kind, be safe — say hello to ' || coalesce(partner_name, 'your match') || '.')
  on conflict do nothing;
  return match_id;
end $$;
revoke all on function public.wassaa_find_or_create_match(uuid, uuid) from public, anon, authenticated;
grant execute on function public.wassaa_find_or_create_match(uuid, uuid) to service_role;
