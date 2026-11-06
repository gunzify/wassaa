-- Audit follow-up (2026-11-06) — free chat must come from an attested region.
--
-- Before this migration, `wassaa_is_free_chat` read `profiles.country_code`,
-- which the member writes through `PATCH /me/profile` with only a two-letter
-- shape check. Any verified member could therefore set their country to a
-- market where Paystack cannot settle and message for free (0 credits per
-- message) with one request.
--
-- This migration records the region a reviewer actually attested during the
-- identity review, and binds the attestation to the value that was reviewed:
--
--   * `region_attested_code` is the country the reviewer saw.
--   * `wassaa_is_free_chat` requires `region_attested_code = country_code`,
--     so a later self-service country edit silently invalidates the grant.
--
-- Existing verified members are grandfathered on today's claim so nobody loses
-- access mid-conversation; their next country change requires a new review.

alter table public.profiles
  add column if not exists region_attested_at timestamptz,
  add column if not exists region_attested_code text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_region_attested_code_shape') then
    alter table public.profiles add constraint profiles_region_attested_code_shape
      check (region_attested_code is null or region_attested_code ~ '^[A-Z]{2}$') not valid;
  end if;
end $$;

-- Grandfather: pin the current claim for already-verified members. `verified_at`
-- is a date, so fall back to now() when it was never stamped.
update public.profiles
   set region_attested_at = coalesce(verified_at::timestamptz, now()),
       region_attested_code = country_code
 where verification_status = 'verified'
   and region_attested_code is null;

create or replace function public.wassaa_is_free_chat(p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    p.verification_status = 'verified'
    and p.region_attested_code is not null
    and p.region_attested_code = p.country_code
    and not public.wassaa_credit_region_supported(p.country_code),
    false)
  from public.profiles p where p.id = p_profile;
$$;

-- Every other data-bearing RPC is service_role only; this one returned to
-- PUBLIC because it never had a revoke. It only exposes values already visible
-- through /discovery, but it should match the rest of the schema.
revoke all on function public.wassaa_is_free_chat(uuid) from public, anon, authenticated;
grant execute on function public.wassaa_is_free_chat(uuid) to service_role;
