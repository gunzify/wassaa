-- WASSAA migration 0010 — one profile contract for members and personas.
--
-- Onboarding has always collected three things that had nowhere to land:
--   * conversation prompts (answers members typed on the personality step)
--   * lifestyle habits (step 7)
--   * values & family (step 8)
-- They were dropped on submit, so the front-facing profile could never show
-- them — while seeded personas kept their prompts inside the `npc` blob.
-- This migration gives all three a real column, moves legacy persona prompts
-- into it, and teaches the seed RPC to write the same shape.

-- ============================================ A. the three missing columns
alter table public.profiles
  add column if not exists prompts         jsonb not null default '[]'::jsonb,
  add column if not exists lifestyle       jsonb,
  add column if not exists values_family   jsonb,
  -- Onboarding step 4 also collects these two, and the profile screen renders
  -- them — they had no column either.
  add column if not exists education_level text,
  add column if not exists alma_mater      text;

comment on column public.profiles.prompts is
  'Conversation prompts: [{"id","question","answer"}], max 3. Members and personas share this column.';
comment on column public.profiles.lifestyle is
  '{"exercise","drinking","smoking","pets"} — optional.';
comment on column public.profiles.values_family is
  '{"faith","faithImportance","familyPlans"} — optional.';
comment on column public.profiles.alma_mater is 'School / academy, shown beside the trade on the profile.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_prompts_shape') then
    -- CASE keeps the length check from being evaluated on a non-array.
    alter table public.profiles add constraint profiles_prompts_shape
      check (case when jsonb_typeof(prompts) = 'array' then jsonb_array_length(prompts) <= 3 else false end) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_lifestyle_shape') then
    alter table public.profiles add constraint profiles_lifestyle_shape
      check (lifestyle is null or jsonb_typeof(lifestyle) = 'object') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_values_shape') then
    alter table public.profiles add constraint profiles_values_shape
      check (values_family is null or jsonb_typeof(values_family) = 'object') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_alma_mater_len') then
    alter table public.profiles add constraint profiles_alma_mater_len
      check (alma_mater is null or char_length(alma_mater) <= 120) not valid;
  end if;
end $$;

-- ============================================ B. persona prompts → prompts
-- Seeded personas stored [{q,a}]; the client expects {id,question,answer}.
-- Ids are derived from position so the same row always yields the same ids.
update public.profiles p
set prompts = coalesce((
  select jsonb_agg(jsonb_build_object(
    'id', 'p' || (e.ord - 1)::text,
    'question', left(coalesce(e.value->>'q', ''), 60),
    'answer', left(coalesce(e.value->>'a', ''), 220)
  ) order by e.ord)
  from jsonb_array_elements(coalesce(p.npc->'prompts', '[]'::jsonb)) with ordinality as e(value, ord)
  where coalesce(e.value->>'q', '') <> '' and coalesce(e.value->>'a', '') <> ''
    and e.ord <= 3
), '[]'::jsonb)
where p.is_npc
  and p.prompts = '[]'::jsonb
  and jsonb_typeof(coalesce(p.npc->'prompts', '[]'::jsonb)) = 'array'
  and jsonb_array_length(coalesce(p.npc->'prompts', '[]'::jsonb)) > 0;

-- ============================================ C. seed RPC writes the contract
-- Same call signature and behaviour as before; the three detail fields now
-- land in columns instead of being buried in `persona`.
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
      city, state, bio, photos, interests, dating_goal, match_preferences,
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

-- ============================================ D. backfill guard
-- Existing personas have no lifestyle/values yet. The seed script can fill
-- them with `node scripts/seed-npcs.mjs --backfill`; until then they simply
-- render without those sections, exactly like a member who skipped them.
