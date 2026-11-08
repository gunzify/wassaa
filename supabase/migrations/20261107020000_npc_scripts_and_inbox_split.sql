-- Inbox split, editable NPC scripts, and NPC photo quarantine.
--
-- Three related changes:
--   1. A thread now records how it started. `matches.origin` is 'match' for a
--      genuine mutual swipe and 'cold' for outreach opened from a profile, so
--      the inbox can keep cold DMs out of the matches list and the client can
--      stop claiming "You matched" on a one-sided thread.
--   2. Persona openers and replies move out of the shared Edge cargo cult
--      (10 greetings for 500 personas) into `npc_scripts`, one row per line,
--      editable in the admin console. The engine falls back to the built-in
--      pools only when a persona has no rows.
--   3. `profiles.npc_photo_review` lets staff quarantine a persona whose
--      photo reads as generated. A quarantined persona is paused, hidden from
--      discovery, and never sends anything until its photos are replaced.

-- ---------- 1. Thread origin ----------
alter table public.matches
  add column if not exists origin text not null default 'match';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.matches'::regclass and conname = 'matches_origin_check'
  ) then
    alter table public.matches
      add constraint matches_origin_check check (origin in ('match', 'cold'));
  end if;
end $$;

-- Backfill: a thread is cold when either side never liked the other. Mutual
-- threads (both swipes present, or a swipe row exists in each direction) keep
-- 'match'. Persona threads are warm by the 20261107010000 rule, so they stay
-- 'match' even when the persona's like row was never written.
update public.matches m
set origin = 'cold'
where not exists (
  select 1 from public.swipes s
  where s.from_user_id = m.user_a and s.to_user_id = m.user_b and s.kind <> 'pass'
)
or not exists (
  select 1 from public.swipes s
  where s.from_user_id = m.user_b and s.to_user_id = m.user_a and s.kind <> 'pass'
);

update public.matches m
set origin = 'match'
where exists (
  select 1 from public.profiles p
  where p.id in (m.user_a, m.user_b) and p.is_npc
);

create index if not exists idx_matches_origin on public.matches (origin);

-- ---------- 2. Summaries carry origin + mutual ----------
drop function if exists public.wassaa_match_summaries(uuid, integer);

create or replace function public.wassaa_match_summaries(p_user uuid, p_limit integer default 100)
returns table(match_id uuid, matched_at timestamptz, partner_id uuid, unread_count integer,
              last_kind text, last_text text, last_caption text, last_created_at timestamptz,
              origin text, mutual boolean)
language sql stable security definer set search_path = '' as $$
  select m.id, m.created_at,
         case when m.user_a = p_user then m.user_b else m.user_a end,
         (select count(*)::integer from public.messages unread
           where unread.match_id = m.id
             and unread.sender_id = (case when m.user_a = p_user then m.user_b else m.user_a end)::text
             and unread.kind <> 'system'
             and unread.created_at > coalesce(r.last_read_at, m.created_at)),
         last_msg.kind, last_msg.text, last_msg.caption, last_msg.created_at,
         m.origin,
         (m.origin = 'match')
  from public.matches m
  left join public.match_reads r on r.match_id = m.id and r.user_id = p_user
  left join lateral (
    select msg.kind, msg.text, msg.caption, msg.created_at
    from public.messages msg where msg.match_id = m.id
    order by msg.created_at desc limit 1
  ) last_msg on true
  where m.user_a = p_user or m.user_b = p_user
  order by coalesce(last_msg.created_at, m.created_at) desc
  limit least(greatest(p_limit, 1), 100)
$$;

revoke all on function public.wassaa_match_summaries(uuid, integer) from public, anon, authenticated;
grant execute on function public.wassaa_match_summaries(uuid, integer) to service_role;

-- A cold thread promoted to a real match must say so, once. The original
-- function returned early for an existing thread, so a member who replied to
-- cold outreach never got the "You matched" line or the origin flip.
create or replace function public.wassaa_find_or_create_match(p_a uuid, p_b uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; b uuid; match_id uuid; partner_name text; v_origin text;
begin
  if p_a = p_b then return null; end if;
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

-- ---------- 3. Editable persona scripts ----------
create table if not exists public.npc_scripts (
  id         uuid primary key default gen_random_uuid(),
  npc_id     uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('greeting', 'reply')),
  intent     text,
  body       text not null check (char_length(body) between 1 and 600),
  position   integer not null default 0,
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'greeting' or intent is not null)
);

create index if not exists idx_npc_scripts_npc on public.npc_scripts (npc_id, kind);
create unique index if not exists idx_npc_scripts_slot
  on public.npc_scripts (npc_id, kind, coalesce(intent, ''), position);

alter table public.npc_scripts enable row level security;
-- No policies: only the service role (the Edge API) reads or writes scripts.

-- ---------- 4. Photo review + AI switch ----------
alter table public.profiles
  add column if not exists npc_photo_review text not null default 'ok',
  add column if not exists npc_quarantine_reason text,
  add column if not exists npc_quarantined_at timestamptz,
  add column if not exists npc_ai_enabled boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_npc_photo_review_check'
  ) then
    alter table public.profiles
      add constraint profiles_npc_photo_review_check
      check (npc_photo_review in ('ok', 'quarantine'));
  end if;
end $$;

-- Quarantined personas are paused immediately. Reversible: clearing the flag
-- does not auto-activate, staff choose when the replacement photo is ready.
update public.profiles
set npc_active = false
where is_npc
  and npc_photo_review = 'quarantine'
  and npc_active;

create index if not exists idx_profiles_npc_photo_review
  on public.profiles (npc_photo_review)
  where is_npc;
