-- Email-first accounts. A confirmed email now creates or links a WASSAA
-- profile, exactly as a confirmed phone number did. Phone verification stays
-- available, but it is no longer required to sign in or use the app.

alter table public.profiles add column if not exists email text;
create unique index if not exists idx_profiles_email_unique
  on public.profiles (lower(email))
  where email is not null;

-- Link, or create, the profile for an Auth user whenever a verified identity
-- attribute appears. Handles three shapes:
--   1. first sign-in with a confirmed email (email OTP or Google)
--   2. first sign-in with a confirmed phone
--   3. an existing member adding the other channel later
create or replace function public.link_auth_user_to_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  linked uuid;
  has_phone boolean := coalesce(new.phone, '') <> '' and new.phone_confirmed_at is not null;
  has_email boolean := coalesce(new.email, '') <> '' and new.email_confirmed_at is not null;
begin
  select id into linked from public.profiles where auth_user_id = new.id limit 1;

  if linked is null and has_phone then
    select id into linked from public.profiles
     where phone = new.phone and (auth_user_id is null or auth_user_id = new.id)
     limit 1;
    if linked is null then
      begin
        insert into public.profiles (id, auth_user_id, phone)
        values (new.id, new.id, new.phone)
        returning id into linked;
      exception when unique_violation then
        select id into linked from public.profiles
         where phone = new.phone and (auth_user_id is null or auth_user_id = new.id)
         limit 1;
      end;
    end if;
  end if;

  if linked is null and has_email then
    select id into linked from public.profiles
     where lower(email) = lower(new.email) and (auth_user_id is null or auth_user_id = new.id)
     limit 1;
    if linked is null then
      begin
        insert into public.profiles (id, auth_user_id, email)
        values (new.id, new.id, lower(new.email))
        returning id into linked;
      exception when unique_violation then
        select id into linked from public.profiles
         where lower(email) = lower(new.email) and (auth_user_id is null or auth_user_id = new.id)
         limit 1;
      end;
    end if;
  end if;

  if linked is not null then
    begin
      update public.profiles
         set auth_user_id = coalesce(auth_user_id, new.id),
             phone = case when has_phone then new.phone else phone end,
             email = case when has_email then lower(new.email) else email end,
             updated_at = now()
       where id = linked;
    exception when unique_violation then
      -- Another profile already owns this email/phone. Never fail the auth
      -- write because of a mirror column; support resolves the duplicate.
      null;
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.link_auth_user_to_profile() from public, anon, authenticated;
grant execute on function public.link_auth_user_to_profile() to supabase_auth_admin;

drop trigger if exists wassaa_auth_profile_link on auth.users;
create trigger wassaa_auth_profile_link
  after insert or update of phone, phone_confirmed_at, email, email_confirmed_at on auth.users
  for each row execute function public.link_auth_user_to_profile();

-- Repair accounts created before this migration: link confirmed emails to
-- profiles that already carry the address, then create the missing profiles
-- for Google members who previously stopped at the phone gate.
update public.profiles p set auth_user_id = u.id, updated_at = now()
from auth.users u
where p.auth_user_id is null
  and u.email_confirmed_at is not null
  and p.email is not null
  and lower(p.email) = lower(u.email);

insert into public.profiles (id, auth_user_id, email)
select u.id, u.id, lower(u.email)
from auth.users u
where u.email_confirmed_at is not null
  and coalesce(u.email, '') <> ''
  and not exists (select 1 from public.profiles p where p.auth_user_id = u.id)
  and not exists (select 1 from public.profiles p where lower(p.email) = lower(u.email))
on conflict do nothing;
