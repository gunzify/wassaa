-- Moderators: scoped staff who own a slice of the persona deck.
--
-- The console had one kind of operator: an allowlisted account that could do
-- everything. That does not scale — reviewing IDs, judging reports and writing
-- 800 personas is one person's job today, and handing a helper full access just
-- to let them edit a bio and answer a persona thread is how a member gets banned
-- by accident.
--
-- This migration adds three rungs (owner / admin / moderator), one active
-- moderator per persona, and the thread-claim state that stops two people from
-- answering the same member twice.

-- ---------------------------------------------------------------- staff roles
alter table public.wassaa_admin_users
  add column if not exists role text not null default 'admin'
    check (role in ('owner', 'admin', 'moderator')),
  add column if not exists status text not null default 'active'
    check (status in ('active', 'suspended')),
  add column if not exists persona_limit integer not null default 30
    check (persona_limit between 1 and 200),
  add column if not exists created_by text,
  add column if not exists last_seen_at timestamptz;

-- Exactly one owner: the earliest allowlisted account (whoever set the console
-- up). Everyone else stays an admin until the owner says otherwise. The guard
-- makes the backfill idempotent and keeps a re-run from promoting a second row.
update public.wassaa_admin_users s
   set role = 'owner'
 where s.user_id = (
         select user_id from public.wassaa_admin_users
          order by created_at, user_id
          limit 1
       )
   and not exists (select 1 from public.wassaa_admin_users where role = 'owner');

create index if not exists idx_admin_users_role
  on public.wassaa_admin_users (role, status);

-- One active moderator per persona. A persona is a character with one voice;
-- two people replying as the same character read as two different people.
create table if not exists public.wassaa_persona_assignments (
  id            uuid primary key default gen_random_uuid(),
  persona_id    uuid not null references public.profiles(id) on delete cascade,
  moderator_id  uuid not null references auth.users(id) on delete cascade,
  assigned_by   text,
  assigned_by_id uuid,
  assigned_at   timestamptz not null default now(),
  revoked_at    timestamptz,
  revoked_by    text,
  note          text check (char_length(note) <= 300)
);
create unique index if not exists wassaa_one_active_moderator_per_persona
  on public.wassaa_persona_assignments (persona_id)
  where revoked_at is null;
create index if not exists idx_persona_assignments_moderator
  on public.wassaa_persona_assignments (moderator_id, revoked_at);
create index if not exists idx_persona_assignments_persona
  on public.wassaa_persona_assignments (persona_id, revoked_at);

alter table public.wassaa_persona_assignments enable row level security;
revoke all on public.wassaa_persona_assignments from anon, authenticated;
grant select, insert, update, delete on public.wassaa_persona_assignments to service_role;

-- ------------------------------------------------------- thread claim state
-- `auto_state = 'admin_owned'` says a human answers this thread. It does not
-- say *which* human, so two moderators could both start replying. A claim is a
-- 30-minute lease that renews on every send: the first person to open the
-- thread owns it, everyone else sees who has it and how long is left.
alter table public.matches
  add column if not exists claimed_by uuid,
  add column if not exists claim_expires_at timestamptz,
  add column if not exists escalated_at timestamptz,
  add column if not exists escalation_note text;

create index if not exists idx_matches_claimed_by
  on public.matches (claimed_by, claim_expires_at);
create index if not exists idx_matches_escalated
  on public.matches (escalated_at)
  where escalated_at is not null;

-- Who actually typed a persona message. Members keep reading `sender_id` (the
-- persona); the console shows the operator so handovers are legible and every
-- line can be traced to a person.
alter table public.messages
  add column if not exists sent_by_staff uuid,
  add column if not exists sent_by_name text;

create index if not exists idx_messages_sent_by_staff
  on public.messages (sent_by_staff)
  where sent_by_staff is not null;

-- The audit trail used to name operators by display name only. Two people can
-- share a display name; the id cannot.
alter table public.admin_audit
  add column if not exists actor_user_id uuid;

create index if not exists idx_admin_audit_actor
  on public.admin_audit (actor_user_id, created_at desc);

-- ------------------------------------------------------------- assignment RPC
-- Assignment is a capacity-checked transition, not two writes the console does
-- in sequence: the previous holder is revoked, the new one inserted, and the
-- moderator's cap enforced in one locked step so two admins assigning at once
-- cannot overfill a moderator.
create or replace function public.wassaa_assign_persona(
  p_persona uuid,
  p_moderator uuid,
  p_actor text,
  p_actor_id uuid,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_status text;
  v_limit integer;
  v_active integer;
  v_is_npc boolean;
begin
  if p_moderator is null then
    -- Unassign: revoke whoever holds the persona now.
    update public.wassaa_persona_assignments
       set revoked_at = now(), revoked_by = coalesce(p_actor, 'staff')
     where persona_id = p_persona and revoked_at is null;
    return jsonb_build_object('ok', true, 'assigned', false);
  end if;

  -- Lock the moderator (capacity) and the persona (one holder). Without the
  -- second lock two admins reassigning the same persona can race the partial
  -- unique index and one request fails on a constraint instead of a clean move.
  perform pg_advisory_xact_lock(hashtextextended(p_persona::text, 72));
  perform pg_advisory_xact_lock(hashtextextended(p_moderator::text, 71));

  select role, status, persona_limit into v_role, v_status, v_limit
    from public.wassaa_admin_users where user_id = p_moderator;
  if not found then return jsonb_build_object('error', 'not_staff'); end if;
  if v_status <> 'active' then return jsonb_build_object('error', 'suspended'); end if;
  -- Only moderators hold personas. Admins already see every persona; an
  -- assignment row for them would be noise that consumes a capacity slot.
  if v_role <> 'moderator' then return jsonb_build_object('error', 'bad_role'); end if;

  select is_npc into v_is_npc from public.profiles where id = p_persona;
  if not found or v_is_npc is not true then return jsonb_build_object('error', 'not_persona'); end if;

  -- Already theirs: no-op, and no new history row.
  if exists (
    select 1 from public.wassaa_persona_assignments
     where persona_id = p_persona and moderator_id = p_moderator and revoked_at is null
  ) then
    return jsonb_build_object('ok', true, 'assigned', true, 'unchanged', true);
  end if;

  select count(*) into v_active
    from public.wassaa_persona_assignments
   where moderator_id = p_moderator and revoked_at is null;
  if v_active >= v_limit then
    return jsonb_build_object('error', 'limit', 'limit', v_limit, 'active', v_active);
  end if;

  update public.wassaa_persona_assignments
     set revoked_at = now(), revoked_by = coalesce(p_actor, 'staff')
   where persona_id = p_persona and revoked_at is null;

  insert into public.wassaa_persona_assignments
    (persona_id, moderator_id, assigned_by, assigned_by_id, note)
  values (p_persona, p_moderator, p_actor, p_actor_id, nullif(btrim(coalesce(p_note, '')), ''));

  return jsonb_build_object('ok', true, 'assigned', true, 'limit', v_limit, 'active', v_active + 1);
end $$;
revoke all on function public.wassaa_assign_persona(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.wassaa_assign_persona(uuid, uuid, text, uuid, text) to service_role;

-- ------------------------------------------------------------ staff send RPC
-- Claiming and replying used to be three separate writes (check the claim, set
-- auto_state, insert the message). Two moderators tapping send at the same time
-- could both pass the check. This owns the whole transition behind one lock.
create or replace function public.wassaa_staff_send(
  p_match uuid,
  p_staff uuid,
  p_name text,
  p_text text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_match public.matches%rowtype;
  v_npc uuid;
  v_member uuid;
  v_role text;
  v_status text;
  v_msg public.messages%rowtype;
  v_name text;
begin
  if coalesce(btrim(p_text), '') = '' then return jsonb_build_object('error', 'empty'); end if;

  select role, status into v_role, v_status
    from public.wassaa_admin_users where user_id = p_staff;
  if not found then return jsonb_build_object('error', 'not_staff'); end if;
  if v_status <> 'active' then return jsonb_build_object('error', 'suspended'); end if;
  v_name := coalesce(nullif(btrim(p_name), ''), 'Staff');

  select * into v_match from public.matches where id = p_match for update;
  if not found then return jsonb_build_object('error', 'missing'); end if;

  select id into v_npc from public.profiles
   where id in (v_match.user_a, v_match.user_b) and is_npc and deleted_at is null;
  select id into v_member from public.profiles
   where id in (v_match.user_a, v_match.user_b) and id <> v_npc;
  if v_npc is null or v_member is null then return jsonb_build_object('error', 'no_persona'); end if;

  if v_role = 'moderator' and not exists (
    select 1 from public.wassaa_persona_assignments
     where persona_id = v_npc and moderator_id = p_staff and revoked_at is null
  ) then
    return jsonb_build_object('error', 'not_assigned');
  end if;

  if v_match.claimed_by is not null
     and v_match.claimed_by <> p_staff
     and coalesce(v_match.claim_expires_at, to_timestamp(0)) > now() then
    return jsonb_build_object('error', 'claimed', 'expires', v_match.claim_expires_at);
  end if;

  update public.matches
     set claimed_by = p_staff,
         claim_expires_at = now() + interval '30 minutes',
         auto_state = 'admin_owned',
         taken_over_by = v_name,
         escalated_at = null,
         escalation_note = null
   where id = p_match;

  insert into public.messages (match_id, sender_id, kind, text, sent_by_staff, sent_by_name)
  values (p_match, v_npc::text, 'text', left(p_text, 4000), p_staff, v_name)
  returning * into v_msg;

  return jsonb_build_object('ok', true, 'message', to_jsonb(v_msg),
    'claimExpiresAt', now() + interval '30 minutes');
end $$;
revoke all on function public.wassaa_staff_send(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.wassaa_staff_send(uuid, uuid, text, text) to service_role;

-- ------------------------------------------------------------- staff lookup
-- Adding staff happens by email before that person has ever signed in. The Edge
-- API runs as service_role but PostgREST cannot read auth.users, so expose one
-- narrow lookup instead of a table.
create or replace function public.wassaa_staff_find(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1
$$;
revoke all on function public.wassaa_staff_find(text) from public, anon, authenticated;
grant execute on function public.wassaa_staff_find(text) to service_role;
