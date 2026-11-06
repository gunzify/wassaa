-- Pricing v2 (KB §18E): a text is 5 credits, a photo is 10. In a thread that
-- is not yet mutually liked ("cold open"), every outgoing message costs 2x —
-- the cold opener included. Once the partner likes back, the normal price
-- applies automatically because matched-ness is computed on send, not stored.
-- Verified members whose region is outside the payment-merchant footprint
-- keep chatting free (wassaa_is_free_chat). Super Like (3) and reveal-likes
-- (15) keep their prices; the 20-swipe daily cap and 1-credit extra swipes
-- live in the Edge API (/likes), not here.

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

  select coalesce(n.is_npc and n.npc_active and n.deleted_at is null, false)
    into v_is_npc
    from public.profiles n where n.id = v_partner;

  -- Matched (both directions liked) recieves normal pricing; a one-sided
  -- thread — the cold-open case — pays 2x per message.
  v_mutual :=
       exists(select 1 from public.swipes s where s.from_user_id = p_sender and s.to_user_id = v_partner and s.kind <> 'pass')
   and exists(select 1 from public.swipes s where s.from_user_id = v_partner and s.to_user_id = p_sender and s.kind <> 'pass');

  v_free := public.wassaa_is_free_chat(p_sender);
  if v_free then
    select credits into v_bal from public.profiles where id = p_sender;
    v_bal := coalesce(v_bal, 0);
  else
    -- text 5 / photo 10 in a mutual thread, 2x (10 / 20) in a cold one.
    v_cost := case
      when p_kind = 'text' then case when v_mutual then 5 else 10 end
      else case when v_mutual then 10 else 20 end
    end;
    select public.wassaa_spend_credit(
      p_sender, v_cost,
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
