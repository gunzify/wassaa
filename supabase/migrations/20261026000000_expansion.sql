-- 2026-10-26 expansion (additive — KB §15: applied migrations are never edited):
--   A. Role/skill taxonomy: class_of_service + org_role (officer|soldier) + skill
--   B. NPC population: is_npc / npc_active / npc persona
--   C. Credit economy: balance column + append-only credit_ledger + Paystack packs
--   D. Account sanctions (restrict/ban with reason) + appeals
--   E. NPC conversation thread state (auto greeting/reply, admin takeover)
--   F. Moderation evidence on reports (match/message linkage, review fields)
--   G. NPC-aware discovery (real candidates first, NPC share decays to a 25% floor)
--   H. wassaa_seed_npcs bulk loader for the ~300-profile NPC deck

-- ============================================================ A. taxonomy
alter table public.profiles
  add column if not exists class_of_service text
    check (class_of_service in ('military','police','paramilitary','civilian')),
  add column if not exists org_role text
    check (org_role in ('officer','soldier')),
  add column if not exists skill text check (char_length(skill) <= 60);

-- Derive the class of service from the profession category chosen before this
-- taxonomy existed; org_role/skill stay null until the member picks them.
update public.profiles set class_of_service = case
    when profession_category = 'Military' then 'military'
    when profession_category = 'Police' then 'police'
    when profession_category = 'Paramilitary' then 'paramilitary'
    else 'civilian' end
where class_of_service is null;

-- ============================================================ B. NPC columns
alter table public.profiles
  add column if not exists is_npc boolean not null default false,
  add column if not exists npc_active boolean not null default true,
  add column if not exists npc jsonb;

-- ============================================================ C. credits
alter table public.profiles
  add column if not exists credits integer not null default 0,
  add column if not exists last_credit_drip date,
  add column if not exists boosted_until timestamptz,
  add column if not exists revealed_likes_at timestamptz;

create table if not exists public.credit_ledger (
  id bigserial primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in (
    'signup_grant','daily_drip','purchase','npc_message','super_like',
    'boost','reveal_likes','refund','admin_adjust')),
  reference text,
  balance_after integer not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_credit_ledger_profile
  on public.credit_ledger (profile_id, created_at desc);
create index if not exists idx_credit_ledger_reason_ref
  on public.credit_ledger (reason, reference) where reference is not null;
alter table public.credit_ledger enable row level security;
revoke all on public.credit_ledger from anon, authenticated;
grant all on public.credit_ledger to service_role;

-- Credit packs carry their credit amount on the payment row.
alter table public.payments add column if not exists credits_amount integer;

-- ============================================================ D. sanctions
alter table public.profiles
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active','restricted','banned')),
  add column if not exists restriction_reason text,
  add column if not exists restricted_at timestamptz,
  add column if not exists restricted_by text;

create table if not exists public.appeals (
  id bigserial primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  sanction_reason text,
  note text not null check (char_length(note) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending','granted','denied')),
  decision_note text,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_appeals_status on public.appeals (status, created_at desc);
create index if not exists idx_appeals_profile on public.appeals (profile_id, created_at desc);
alter table public.appeals enable row level security;
revoke all on public.appeals from anon, authenticated;
grant all on public.appeals to service_role;

-- ============================================ E. NPC conversation threads
-- none      → NPC has not opened yet (greeting due when auto_next_at arrives)
-- active    → auto engine replies (15-reply lifetime budget for unpaid threads)
-- quiet     → budget spent; NPC stays silent, member messages are free
-- admin_owned → a staff member answers personally (after a credit purchase)
alter table public.matches
  add column if not exists auto_state text not null default 'none'
    check (auto_state in ('none','active','quiet','admin_owned')),
  add column if not exists auto_next_at timestamptz,
  add column if not exists auto_spent integer not null default 0,
  add column if not exists taken_over_by text;

-- ================================================ F. report evidence
alter table public.reports
  add column if not exists match_id uuid references public.matches(id) on delete set null,
  add column if not exists message_id uuid references public.messages(id) on delete set null,
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz;

-- ================================================ G. credit movement RPCs
create or replace function public.wassaa_grant_credit(
  p_profile uuid, p_delta integer, p_reason text, p_reference text
) returns integer language plpgsql security definer set search_path = '' as $$
declare bal integer;
begin
  if p_delta <= 0 then return -1; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_profile::text, 42));
  update public.profiles set credits = credits + p_delta, updated_at = now()
   where id = p_profile returning credits into bal;
  if bal is null then return -1; end if;
  insert into public.credit_ledger(profile_id, delta, reason, reference, balance_after)
  values (p_profile, p_delta, p_reason, p_reference, bal);
  return bal;
end $$;
revoke all on function public.wassaa_grant_credit(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.wassaa_grant_credit(uuid, integer, text, text) to service_role;

create or replace function public.wassaa_spend_credit(
  p_profile uuid, p_delta integer, p_reason text, p_reference text
) returns integer language plpgsql security definer set search_path = '' as $$
declare bal integer;
begin
  if p_delta <= 0 then return -1; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_profile::text, 43));
  update public.profiles set credits = credits - p_delta, updated_at = now()
   where id = p_profile and credits >= p_delta returning credits into bal;
  if bal is null then return -1; end if;   -- insufficient balance, nothing moved
  insert into public.credit_ledger(profile_id, delta, reason, reference, balance_after)
  values (p_profile, -p_delta, p_reason, p_reference, bal);
  return bal;
end $$;
revoke all on function public.wassaa_spend_credit(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.wassaa_spend_credit(uuid, integer, text, text) to service_role;

-- One free credit per calendar day, applied lazily when a member loads their
-- session — no cron required, idempotent per day.
create or replace function public.wassaa_daily_drip(p_profile uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare bal integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile::text, 44));
  update public.profiles set last_credit_drip = current_date
   where id = p_profile and (last_credit_drip is null or last_credit_drip < current_date);
  if not found then
    select credits into bal from public.profiles where id = p_profile;
    return coalesce(bal, -1);
  end if;
  update public.profiles set credits = credits + 1, updated_at = now()
   where id = p_profile returning credits into bal;
  if bal is null then return -1; end if;
  insert into public.credit_ledger(profile_id, delta, reason, reference, balance_after)
  values (p_profile, 1, 'daily_drip', current_date::text, bal);
  return bal;
end $$;
revoke all on function public.wassaa_daily_drip(uuid) from public, anon, authenticated;
grant execute on function public.wassaa_daily_drip(uuid) to service_role;

-- Welcome grant for every auth-linked profile created from here on
-- (NPC rows are inserted with auth_user_id null and never trip this).
create or replace function public.wassaa_on_profile_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare bal integer;
begin
  if new.is_npc = false and coalesce(new.credits, 0) = 0 then
    update public.profiles set credits = credits + 25 where id = new.id returning credits into bal;
    insert into public.credit_ledger(profile_id, delta, reason, reference, balance_after)
    values (new.id, 25, 'signup_grant', 'welcome', bal);
  end if;
  return new;
end $$;
drop trigger if exists wassaa_profile_signup_credit on public.profiles;
create trigger wassaa_profile_signup_credit
  after insert on public.profiles
  for each row when (new.auth_user_id is not null)
  execute function public.wassaa_on_profile_signup();

-- Members who signed up before this migration get the same welcome grant.
do $$
declare r record;
begin
  for r in
    select id from public.profiles
     where is_npc = false and credits = 0 and deleted_at is null
  loop
    perform public.wassaa_grant_credit(r.id, 25, 'signup_grant', 'backfill_20261026');
  end loop;
end $$;

-- =========================================== H. NPC conversation RPCs
-- The member's side of an NPC thread: costs 1 credit (except while the thread
-- is quietly over budget) and schedules the NPC's next reply window.
create or replace function public.wassaa_npc_send_message(
  p_match uuid, p_sender uuid, p_text text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches%rowtype; npc_id uuid; partner uuid; bal integer; msg_id uuid;
begin
  select * into m from public.matches where id = p_match;
  if not found then return jsonb_build_object('error','not_found'); end if;
  if m.user_a <> p_sender and m.user_b <> p_sender then
    return jsonb_build_object('error','forbidden'); end if;
  partner := case when m.user_a = p_sender then m.user_b else m.user_a end;
  select id into npc_id from public.profiles
   where id = partner and is_npc and npc_active and deleted_at is null;
  if npc_id is null then return jsonb_build_object('error','not_npc'); end if;
  if exists (select 1 from public.blocks b
             where (b.blocker_id = p_sender and b.blocked_id = partner)
                or (b.blocker_id = partner and b.blocked_id = p_sender)) then
    return jsonb_build_object('error','blocked'); end if;

  if m.auto_state <> 'quiet' then
    select public.wassaa_spend_credit(p_sender, 1, 'npc_message', p_match::text) into bal;
    if bal < 0 then return jsonb_build_object('error','no_credits'); end if;
  else
    select credits into bal from public.profiles where id = p_sender;
    if bal is null then bal := 0; end if;
  end if;

  insert into public.messages (match_id, sender_id, kind, text)
  values (p_match, p_sender::text, 'text', p_text)
  returning id into msg_id;

  update public.matches set
    auto_state = case when auto_state = 'none' then 'active' else auto_state end,
    auto_next_at = case
      when auto_state in ('none','active')
        then now() + make_interval(secs => (20 + floor(random() * 70))::int)
      else auto_next_at end
  where id = p_match;

  return jsonb_build_object('ok', true, 'messageId', msg_id, 'balance', bal);
end $$;
revoke all on function public.wassaa_npc_send_message(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wassaa_npc_send_message(uuid, uuid, text) to service_role;

-- The engine's side: post the NPC's reply, count it against the 15-message
-- lifetime budget of unpaid threads, and go quiet when the budget is spent.
create or replace function public.wassaa_npc_reply(p_match uuid, p_text text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.matches%rowtype; npc_id uuid; msg_id uuid; spent integer;
begin
  select * into m from public.matches where id = p_match for update;
  if not found then return null; end if;
  if m.auto_state not in ('none','active') then return null; end if;
  select id into npc_id from public.profiles
   where id in (m.user_a, m.user_b)
     and is_npc and npc_active and deleted_at is null;
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

-- ================================================== I. payment fulfillment
-- pending → success exactly once (webhook + activate share this path).
-- Legacy tier purchases keep advancing profiles.tier; credit packs credit the
-- balance and flip the buyer's NPC threads to staff-operated conversations.
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
  if payment_row.credits_amount is not null and payment_row.credits_amount > 0 then
    perform public.wassaa_grant_credit(
      payment_row.user_id, payment_row.credits_amount, 'purchase', payment_row.reference);
    update public.matches m set auto_state='admin_owned', taken_over_by='credit_purchase'
     where m.auto_state <> 'admin_owned'
       and (m.user_a = payment_row.user_id or m.user_b = payment_row.user_id)
       and exists (
         select 1 from public.profiles p
          where p.id in (m.user_a, m.user_b)
            and p.id <> payment_row.user_id
            and p.is_npc and p.deleted_at is null);
  end if;
  return true;
end $$;
revoke all on function public.wassaa_fulfill_payment(text,text) from public, anon, authenticated;
grant execute on function public.wassaa_fulfill_payment(text,text) to service_role;

-- ==================================================== J. NPC-aware discovery
-- Deck composition (KB §18C): real candidates first; NPCs fill what real
-- candidates cannot. NPC share = clamp(1 − real_candidates_in_range/30, .25, 1)
-- — decays as real density grows but never below a 25% floor, so NPCs are
-- never phased out entirely. Boosted real profiles gain +15 score inside the
-- real partition only.
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
      and (c.is_npc = false or c.npc_active = true)
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

-- ================================================== K. NPC bulk seeding
-- Called by scripts/seed-npcs.mjs over PostgREST with the service-role key.
-- Rows land verified, flagged is_npc, with persona jsonb and real city
-- coordinates so they pass every wassaa_discovery predicate.
create or replace function public.wassaa_seed_npcs(p_profiles jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; n integer := 0;
begin
  if jsonb_typeof(p_profiles) <> 'array' then
    raise exception 'expected a jsonb array of NPC profiles';
  end if;
  for item in select value from jsonb_array_elements(p_profiles) loop
    insert into public.profiles (
      name, birth_date, gender,
      profession_category, profession_title, service, org_role, skill,
      city, state, bio, photos, interests, dating_goal, match_preferences,
      location_lat, location_lng,
      class_of_service, is_npc, npc, npc_active,
      verification_status, verified_at, credits, account_status, created_at
    ) values (
      left(item->>'name', 60),
      (item->>'birthDate')::date,
      item->>'gender',
      left(item->>'professionCategory', 60),
      left(item->>'professionTitle', 80),
      left(item->>'service', 80),
      item->>'orgRole',
      left(item->>'skill', 60),
      left(item->>'city', 100),
      left(item->>'state', 100),
      left(item->>'bio', 1000),
      array(select jsonb_array_elements_text(item->'photos')),
      array(select jsonb_array_elements_text(item->'interests')),
      item->>'datingGoal',
      (item->'matchPreferences')::jsonb,
      (item->>'lat')::double precision,
      (item->>'lng')::double precision,
      item->>'classOfService',
      true,
      (item->'persona')::jsonb,
      coalesce((item->>'active')::boolean, true),
      'verified', current_date, 0, 'active',
      now() - make_interval(days => coalesce((item->>'ageDays')::int, 0))
    );
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.wassaa_seed_npcs(jsonb) from public, anon, authenticated;
grant execute on function public.wassaa_seed_npcs(jsonb) to service_role;
