-- Discovery as a single server-side query.
--
-- The previous Edge implementation sent every already-swiped UUID inside the
-- request URL (`id=not.in.(...)`). PostgREST/Cloudflare reject long URLs, so the
-- discovery deck broke for any member with a few hundred swipes. Filtering in
-- SQL removes that limit and also applies the reciprocal preference checks that
-- were previously done in the client after the row limit had already been hit.

create or replace function public.wassaa_discovery(
  p_viewer uuid,
  p_limit integer default 15,
  p_profession text default null,
  p_service text default null,
  p_city text default null,
  p_gender text default null,
  p_min_age integer default null,
  p_max_age integer default null
) returns setof public.profiles
language sql stable security definer set search_path = '' as $$
  with viewer as (
    select v.id, v.gender, v.birth_date,
           coalesce(p_min_age, (v.match_preferences->>'minAge')::int, 18) as min_age,
           coalesce(p_max_age, (v.match_preferences->>'maxAge')::int, 99) as max_age,
           -- explicit filter accepts both UI vocabularies ('men'/'women' and 'male'/'female')
           case lower(coalesce(p_gender, ''))
             when 'men' then 'male' when 'women' then 'female'
             when 'male' then 'male' when 'female' then 'female' else null end as wanted_gender,
           -- an explicit gender filter overrides the viewer's saved preference
           case when lower(coalesce(p_gender, '')) in ('men','women','male','female') then null
                else v.match_preferences->>'gender' end as pref_gender
    from public.profiles v where v.id = p_viewer
  )
  select c.*
  from public.profiles c, viewer
  where c.id <> viewer.id
    and c.deleted_at is null
    and c.blocked_us = false
    and cardinality(c.photos) > 0
    and c.birth_date is not null
    and not exists (
      select 1 from public.swipes s
      where s.from_user_id = viewer.id and s.to_user_id = c.id)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = viewer.id and b.blocked_id = c.id)
         or (b.blocker_id = c.id and b.blocked_id = viewer.id))
    -- viewer's age window
    and c.birth_date <= current_date - make_interval(years => viewer.min_age)
    and c.birth_date >  current_date - make_interval(years => viewer.max_age + 1)
    -- viewer's gender preference ('men'/'women'/'everyone'/null)
    and (viewer.pref_gender is null or viewer.pref_gender = 'everyone'
         or (viewer.pref_gender = 'men'   and c.gender = 'male')
         or (viewer.pref_gender = 'women' and c.gender = 'female'))
    -- the candidate's own age/gender preferences must accept the viewer
    and (coalesce(c.match_preferences->>'gender', 'everyone') = 'everyone'
         or (c.match_preferences->>'gender' = 'men'   and viewer.gender = 'male')
         or (c.match_preferences->>'gender' = 'women' and viewer.gender = 'female'))
    and (viewer.birth_date is null
         or (c.match_preferences->>'minAge' is null and c.match_preferences->>'maxAge' is null)
         or extract(year from age(viewer.birth_date))::int
            between coalesce((c.match_preferences->>'minAge')::int, 18)
                and coalesce((c.match_preferences->>'maxAge')::int, 99))
    -- optional explicit filters
    and (p_profession is null or p_profession = 'All' or c.profession_category = p_profession)
    and (p_service    is null or p_service    = 'All' or c.service = p_service)
    and (p_city       is null or p_city       = 'All' or c.city ilike p_city)
    and (viewer.wanted_gender is null or c.gender = viewer.wanted_gender)
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit, 15), 1), 30)
$$;

revoke all on function public.wassaa_discovery(uuid, integer, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.wassaa_discovery(uuid, integer, text, text, text, text, integer, integer) to service_role;
