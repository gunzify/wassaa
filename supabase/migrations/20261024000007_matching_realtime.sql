-- Private device coordinates, radius filtering, compatibility ranking, and
-- authorized realtime message broadcasts.

alter table public.profiles
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_location_coordinates_valid') then
    alter table public.profiles add constraint profiles_location_coordinates_valid
      check (
        (location_lat is null and location_lng is null)
        or (location_lat is not null and location_lng is not null
          and location_lat between -90 and 90 and location_lng between -180 and 180)
      );
  end if;
end $$;

create index if not exists idx_profiles_location_available
  on public.profiles (location_lat, location_lng) where location_lat is not null and location_lng is not null and deleted_at is null;

drop function if exists public.wassaa_discovery(uuid, integer, text, text, text, text, integer, integer);

create function public.wassaa_discovery(
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
             when 'male' then 'male' when 'female' then 'female' else null end as wanted_gender,
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
      + greatest(0, 8 - extract(day from now() - e.created_at)::int * 0.2) as compatibility_score
    from eligible e
  )
  select (r.full_row).* from ranked r
  where r.max_distance_km is null
     or (r.distance_km is not null and r.distance_km <= r.max_distance_km)
  order by r.compatibility_score desc, r.distance_km asc nulls last, r.created_at desc
  limit least(greatest(coalesce(p_limit, 15), 1), 30)
$$;

revoke all on function public.wassaa_discovery(uuid, integer, text, text, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.wassaa_discovery(uuid, integer, text, text, text, text, integer, integer, integer) to service_role;

-- Realtime Broadcast is private and restricted to authenticated members of the
-- match topic. Clients still fetch message bodies through the ownership-checked
-- Edge API so private photo keys are converted to short-lived signed URLs.
create or replace function public.wassaa_broadcast_chat_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('message_id', new.id),
    'new_message',
    'match:' || new.match_id::text,
    true
  );
  return new;
end;
$$;

revoke all on function public.wassaa_broadcast_chat_message() from public, anon, authenticated;
drop trigger if exists wassaa_chat_message_broadcast on public.messages;
create trigger wassaa_chat_message_broadcast
  after insert on public.messages
  for each row execute function public.wassaa_broadcast_chat_message();

create or replace function public.wassaa_can_access_match_topic(p_topic text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.matches m
    join public.profiles p on p.id = m.user_a or p.id = m.user_b
    where p_topic = 'match:' || m.id::text
      and p.auth_user_id = (select auth.uid())
      and p.deleted_at is null and p.blocked_us = false
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = m.user_a and b.blocked_id = m.user_b)
           or (b.blocker_id = m.user_b and b.blocked_id = m.user_a)
      )
  )
$$;
revoke all on function public.wassaa_can_access_match_topic(text) from public, anon;
grant execute on function public.wassaa_can_access_match_topic(text) to authenticated;

drop policy if exists "Wassaa match members can receive chat broadcasts" on realtime.messages;
create policy "Wassaa match members can receive chat broadcasts"
  on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and public.wassaa_can_access_match_topic(realtime.topic())
  );
