-- ==================================================== message credits everywhere
-- KB §18E revision (owner decision): every message a member sends costs
-- 1 credit — persona threads and real-member threads alike. Persona replies
-- stay on the house. Supersedes the NPC-only charge from 20261026000000.

-- The ledger needs a reason for real-member sends.
alter table public.credit_ledger drop constraint if exists credit_ledger_reason_check;
alter table public.credit_ledger
  add constraint credit_ledger_reason_check check (reason in (
    'signup_grant','daily_drip','purchase','npc_message','message','super_like',
    'boost','reveal_likes','refund','admin_adjust'));

-- Atomic send for every thread: membership + block guard, 1-credit spend,
-- message insert, and the persona reply window (persona threads only).
-- A failed spend never leaves a message behind.
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

  -- 1 credit per message sent, NPC or real (KB §18E).
  select public.wassaa_spend_credit(
    p_sender, 1,
    case when v_is_npc then 'npc_message' else 'message' end,
    p_match::text
  ) into v_bal;
  if v_bal is null or v_bal < 0 then
    return jsonb_build_object('error', 'no_credits');
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

  return jsonb_build_object('ok', true, 'messageId', v_msg_id, 'balance', v_bal);
end $$;
revoke all on function public.wassaa_send_message(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.wassaa_send_message(uuid, uuid, text, text, text, text) to service_role;

-- Superseded by the universal sender above.
drop function if exists public.wassaa_npc_send_message(uuid, uuid, text);
