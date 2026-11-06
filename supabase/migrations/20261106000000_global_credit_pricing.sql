-- Global credit pricing (2026-11-06).
--
-- Until now credit packs were only sold in the four markets this Paystack
-- account was assumed to settle in ('NG','GH','ZA','KE'), and a verified member
-- anywhere else messaged for free. Paystack's own documentation contradicts
-- that assumption: international cards are charged in the merchant's local
-- currency and the cardholder's bank does the conversion, so a Nigerian
-- account can take a card from any of 195+ countries. Free chat was therefore
-- gating on a limitation that does not exist, and every non-paying member
-- outside four countries was being cross-subsidised.
--
-- This migration
--   1. opens the paid path to every country (`wassaa_credit_region_supported`
--      is now unconditionally true, which also switches free chat off and
--      retires the 5-credit "abroad, unverified" drip through the functions
--      that already derive from it — no rewrite of send_message needed),
--   2. moves the price list into the database (`credit_packs` +
--      `credit_pack_prices`) so prices are editable without a redeploy,
--   3. adds three price bands — Nigeria, the rest of Africa, and the global
--      band — because a single worldwide price is both unaffordable locally
--      and too cheap abroad,
--   4. stores approximate FX rates so every member is shown a price in their
--      own currency while the charge stays in naira (the only settlement
--      currency this account has).
--
-- The charged amount is always `amount_minor` (NGN kobo). Display prices are
-- labelled approximate in the client; the exact naira amount is shown beside
-- them so a foreign cardholder knows what is actually charged.

-- ============================================ A. every country can pay
create or replace function public.wassaa_credit_region_supported(p_country text)
returns boolean language sql immutable as $$
  -- Cards from every country are accepted; the issuer converts to NGN.
  -- `p_country` is kept for call-site compatibility and audit history.
  select p_country is not null or true;
$$;

-- Free chat is now unreachable by construction. Kept as a function because
-- wassaa_send_message and wassaa_daily_drip call it, and because a future
-- promo can restore a carve-out in one place.
create or replace function public.wassaa_is_free_chat(p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select false;
$$;
revoke all on function public.wassaa_is_free_chat(uuid) from public, anon, authenticated;
grant execute on function public.wassaa_is_free_chat(uuid) to service_role;

-- ============================================ B. price bands
-- Nigeria pays the local ladder. The rest of Africa pays a step up that still
-- matches local purchasing power. Everyone else pays global-standard pricing.
-- Update this list to re-band a country; no redeploy needed.
create or replace function public.wassaa_pack_band(p_country text)
returns text language sql immutable as $$
  select case
    when upper(coalesce(nullif(btrim(p_country), ''), 'NG')) = 'NG' then 'ng'
    when upper(coalesce(nullif(btrim(p_country), ''), 'NG')) in (
      'DZ','AO','BJ','BW','BF','BI','CM','CV','CF','TD','KM','CG','CD','CI','DJ','EG',
      'GQ','ER','SZ','ET','GA','GM','GH','GN','GW','KE','LS','LR','LY','MG','MW','ML',
      'MR','MU','MA','MZ','NA','NE','RW','ST','SN','SC','SL','SO','ZA','SS','SD','TZ',
      'TG','TN','UG','ZM','ZW'
    ) then 'africa'
    else 'global'
  end;
$$;

-- ============================================ C. pack catalogue
create table if not exists public.credit_packs (
  code        text primary key,
  name        text not null,
  tagline     text,
  credits     integer not null check (credits > 0),
  features    jsonb not null default '[]'::jsonb,
  sort_order  integer not null default 0,
  is_popular  boolean not null default false,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists public.credit_pack_prices (
  pack_code    text not null references public.credit_packs(code) on delete cascade,
  band         text not null check (band in ('ng', 'africa', 'global')),
  amount_minor bigint not null check (amount_minor > 0), -- NGN kobo, the charged amount
  primary key (pack_code, band)
);

alter table public.credit_packs enable row level security;
alter table public.credit_pack_prices enable row level security;
-- No policies: the catalogue is read through the API's RPCs with the service
-- role. Members never query these tables directly.
revoke all on table public.credit_packs from public, anon, authenticated;
revoke all on table public.credit_pack_prices from public, anon, authenticated;
grant select, insert, update, delete on table public.credit_packs to service_role;
grant select, insert, update, delete on table public.credit_pack_prices to service_role;

insert into public.credit_packs (code, name, tagline, credits, features, sort_order, is_popular) values
  ('credit_150',  'Starter',    'Start strong',        150,  '["150 credits","About 30 text messages","Credits never expire"]', 1, false),
  ('credit_450',  'Standard',   'Most members pick this', 450, '["450 credits","About 90 text messages","Credits never expire"]', 2, true),
  ('credit_1200', 'Best Value', 'Never run dry',       1200, '["1,200 credits","About 240 text messages","Credits never expire"]', 3, false)
on conflict (code) do update
  set name = excluded.name,
      tagline = excluded.tagline,
      credits = excluded.credits,
      features = excluded.features,
      sort_order = excluded.sort_order,
      is_popular = excluded.is_popular,
      updated_at = now();

insert into public.credit_pack_prices (pack_code, band, amount_minor) values
  -- Nigeria: unchanged, tuned against local purchasing power.
  ('credit_150',  'ng',     200000),
  ('credit_450',  'ng',     500000),
  ('credit_1200', 'ng',    1200000),
  -- Rest of Africa: local purchasing power, but not naira-subsidised.
  ('credit_150',  'africa',  450000),
  ('credit_450',  'africa', 1100000),
  ('credit_1200', 'africa', 2600000),
  -- Global: roughly $5.9 / $13 / $30 at the seeded rate.
  ('credit_150',  'global',  890000),
  ('credit_450',  'global', 1990000),
  ('credit_1200', 'global', 4490000)
on conflict (pack_code, band) do update
  set amount_minor = excluded.amount_minor;

-- ============================================ D. display currencies
-- Approximate naira per one unit. Display only: the charge is always
-- amount_minor. Refreshing these changes what foreign members see, never what
-- they are charged. Unlisted currencies fall back to USD.
create table if not exists public.fx_rates (
  currency     text primary key check (currency ~ '^[A-Z]{3}$'),
  ngn_per_unit numeric(14, 4) not null check (ngn_per_unit > 0),
  updated_at   timestamptz not null default now()
);
alter table public.fx_rates enable row level security;
revoke all on table public.fx_rates from public, anon, authenticated;
grant select, insert, update, delete on table public.fx_rates to service_role;

insert into public.fx_rates (currency, ngn_per_unit) values
  ('NGN',    1.0000),
  ('USD', 1500.0000),
  ('EUR', 1620.0000),
  ('GBP', 1900.0000),
  ('CAD', 1080.0000),
  ('AUD',  980.0000),
  ('AED',  408.0000),
  ('INR',   17.5000),
  ('GHS',  100.0000),
  ('KES',   11.6000),
  ('ZAR',   82.0000),
  ('EGP',   30.0000),
  ('XOF',    2.4500),
  ('XAF',    2.4500),
  ('RWF',    1.1500),
  ('TZS',    0.5600),
  ('UGX',    0.4000),
  ('ZMW',   55.0000),
  ('MWK',    0.8700),
  ('MAD',  150.0000),
  ('TND',  480.0000),
  ('ETB',   12.0000),
  ('BWP',  110.0000),
  ('MUR',   32.0000),
  ('MZN',   23.5000),
  ('NAD',   82.0000),
  ('SLL',    0.0700),
  ('CVE',  14.7000)
on conflict (currency) do update
  set ngn_per_unit = excluded.ngn_per_unit,
      updated_at = now();

-- Country -> display currency. Deliberately coarse: any country not listed
-- shows USD, which is still only a display conversion.
create or replace function public.wassaa_display_currency(p_country text)
returns text language sql immutable as $$
  select case upper(coalesce(nullif(btrim(p_country), ''), 'NG'))
    when 'NG' then 'NGN'
    when 'GH' then 'GHS'
    when 'KE' then 'KES'
    when 'ZA' then 'ZAR'
    when 'NA' then 'NAD'
    when 'BW' then 'BWP'
    when 'ZM' then 'ZMW'
    when 'MW' then 'MWK'
    when 'MZ' then 'MZN'
    when 'MU' then 'MUR'
    when 'TZ' then 'TZS'
    when 'UG' then 'UGX'
    when 'RW' then 'RWF'
    when 'EG' then 'EGP'
    when 'MA' then 'MAD'
    when 'TN' then 'TND'
    when 'ET' then 'ETB'
    when 'SL' then 'SLL'
    when 'CV' then 'CVE'
    when 'CI' then 'XOF' when 'SN' then 'XOF' when 'BJ' then 'XOF'
    when 'BF' then 'XOF' when 'ML' then 'XOF' when 'NE' then 'XOF'
    when 'TG' then 'XOF' when 'GW' then 'XOF'
    when 'CM' then 'XAF' when 'GA' then 'XAF' when 'CG' then 'XAF'
    when 'TD' then 'XAF' when 'CF' then 'XAF' when 'GQ' then 'XAF'
    when 'GB' then 'GBP'
    when 'IE' then 'EUR' when 'FR' then 'EUR' when 'DE' then 'EUR'
    when 'ES' then 'EUR' when 'IT' then 'EUR' when 'NL' then 'EUR'
    when 'PT' then 'EUR' when 'BE' then 'EUR' when 'AT' then 'EUR'
    when 'FI' then 'EUR' when 'GR' then 'EUR' when 'LU' then 'EUR'
    when 'CA' then 'CAD'
    when 'AU' then 'AUD' when 'NZ' then 'AUD'
    when 'AE' then 'AED'
    when 'IN' then 'INR'
    else 'USD'
  end;
$$;

-- ============================================ E. read RPCs
-- The catalogue as this member sees it: their band's price, their currency,
-- and the naira amount actually charged.
create or replace function public.wassaa_credit_packs_for(p_country text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with ctx as (
    select public.wassaa_pack_band(p_country) as band,
           public.wassaa_display_currency(p_country) as cur,
           coalesce((select f.ngn_per_unit from public.fx_rates f
                      where f.currency = public.wassaa_display_currency(p_country)),
                    (select f.ngn_per_unit from public.fx_rates f where f.currency = 'USD')) as rate
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.code,
           'name', p.name,
           'tagline', p.tagline,
           'credits', p.credits,
           'features', p.features,
           'isPopular', p.is_popular,
           'band', c.band,
           'priceNgn', (pr.amount_minor / 100)::numeric,
           'amountMinor', pr.amount_minor,
           'currency', 'NGN',
           'displayCurrency', c.cur,
           'displayPrice', round((pr.amount_minor / 100.0) / c.rate)
         ) order by p.sort_order), '[]'::jsonb)
    from public.credit_packs p
    join public.credit_pack_prices pr on pr.pack_code = p.code
    join ctx c on c.band = pr.band
   where p.active;
$$;
revoke all on function public.wassaa_credit_packs_for(text) from public, anon, authenticated;
grant execute on function public.wassaa_credit_packs_for(text) to service_role;

-- Authoritative single-pack lookup for checkout: the client never sends a
-- price, only a pack code.
create or replace function public.wassaa_credit_pack(p_code text, p_country text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'id', p.code,
           'name', p.name,
           'credits', p.credits,
           'band', public.wassaa_pack_band(p_country),
           'amountMinor', pr.amount_minor,
           'currency', 'NGN'
         )
    from public.credit_packs p
    join public.credit_pack_prices pr
      on pr.pack_code = p.code
     and pr.band = public.wassaa_pack_band(p_country)
   where p.code = p_code and p.active;
$$;
revoke all on function public.wassaa_credit_pack(text, text) from public, anon, authenticated;
grant execute on function public.wassaa_credit_pack(text, text) to service_role;
