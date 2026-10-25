-- WASSAA schema migration 0001 (Postgres / Supabase)
-- Run with: psql "$SUPABASE_DB_URL" -f backend/migrations/0001_init.sql
-- (or paste into the Supabase SQL editor)

create extension if not exists pgcrypto;

-- ============ PROFILES ============
create table if not exists profiles (
  id                  uuid primary key default gen_random_uuid(),
  phone               text unique not null,
  name                text check (char_length(name) <= 60),
  birth_date          date,
  gender              text check (gender in ('female','male')),
  pronouns            text,
  profession_category text not null default 'Others' check (char_length(profession_category) <= 60),
  profession_title    text check (char_length(profession_title) <= 80),
  company_or_org      text check (char_length(company_or_org) <= 120),
  service             text check (char_length(service) <= 80),
  rank                text check (char_length(rank) <= 80),
  duty_station        text check (char_length(duty_station) <= 120),
  city                text not null default '' check (char_length(city) <= 100),
  state               text not null default '' check (char_length(state) <= 100),
  bio                 text not null default '' check (char_length(bio) <= 1000),
  photos              text[] not null default '{}',
  interests           text[] not null default '{}',
  dating_goal         text,
  match_preferences   jsonb,
  tier                text not null default 'free' check (tier in ('free','premium','hyper_premium')),
  verification_status text not null default 'not_started' check (verification_status in ('verified','pending','rejected','not_started')),
  verified_at         date,
  document_type       text check (char_length(document_type) <= 40),
  privacy             jsonb not null default '{"serviceVisibility":"matches","rankVisibility":"private","verificationDisplay":"badge","chatNotifications":true,"twoFactorAuth":false,"privateIntroductionOptIn":true}',
  blocked_us          boolean not null default false,   -- admin-blocked account (fraud, abuse)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index if not exists idx_profiles_discovery on profiles (profession_category, city, verification_status) where deleted_at is null;

-- ============ OTP SESSIONS ============
create table if not exists otp_sessions (
  phone            text primary key,
  code             text not null,
  expires_at       timestamptz not null,
  attempts         int not null default 0,
  last_request_at  timestamptz not null
);

-- ============ SWIPES ============
create table if not exists swipes (
  from_user_id uuid not null references profiles(id) on delete cascade,
  to_user_id   uuid not null references profiles(id) on delete cascade,
  kind         text not null check (kind in ('like','pass','super')),
  created_at   timestamptz not null default now(),
  primary key (from_user_id, to_user_id)
);
create index if not exists idx_swipes_target on swipes (to_user_id, kind, created_at);

-- ============ MATCHES ============
create table if not exists matches (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references profiles(id) on delete cascade,
  user_b     uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a <> user_b)
);
create index if not exists idx_matches_user_a on matches (user_a);
create index if not exists idx_matches_user_b on matches (user_b);

-- ============ CHAT ============
create table if not exists messages (
  id             uuid primary key default gen_random_uuid(),
  match_id       uuid not null references matches(id) on delete cascade,
  sender_id      text not null,                -- profile uuid or 'system'
  kind           text not null check (kind in ('text','voice','photo','system')),
  text           text check (char_length(text) <= 4000),
  media_url      text,
  caption        text check (char_length(caption) <= 500),
  voice_duration int,
  created_at     timestamptz not null default now()
);
create index if not exists idx_messages_match on messages (match_id, created_at);

create table if not exists match_reads (
  user_id       uuid not null references profiles(id) on delete cascade,
  match_id      uuid not null references matches(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (user_id, match_id)
);

-- ============ BLOCKS ============
create table if not exists blocks (
  id          bigserial primary key,
  blocker_id  uuid not null references profiles(id) on delete cascade,
  blocked_id  uuid not null references profiles(id) on delete cascade,
  reason      text check (char_length(reason) <= 255),
  created_at  timestamptz not null default now(),
  unique (blocker_id, blocked_id)
);

-- ============ SAFETY REPORTS ============
create table if not exists reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references profiles(id) on delete cascade,
  reported_user_id uuid not null,
  category         text not null,
  category_label   text not null,
  details          text not null check (char_length(details) <= 2000),
  service_branch   text,
  also_blocked     boolean not null default false,
  status           text not null default 'pending_review' check (status in ('pending_review','investigating','resolved','dismissed')),
  created_at       timestamptz not null default now()
);

-- ============ VERIFICATION SUBMISSIONS (manual review) ============
-- ID/selfie binaries are references to storage objects. Per the zero-retention
-- policy the URL columns are nulled the moment a decision is recorded.
create table if not exists verification_submissions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references profiles(id) on delete cascade,
  document_type           text not null check (document_type in ('NIN','Passport','DriversLicense','ServiceID')),
  document_number_masked  text not null default '',
  id_doc_url              text,
  selfie_url              text,
  status                  text not null default 'pending' check (status in ('pending','verified','rejected')),
  submitted_at            timestamptz not null default now(),
  reviewed_at             timestamptz,
  reviewed_by             text,
  review_note             text
);
create index if not exists idx_verif_pending on verification_submissions (status, submitted_at);

-- ============ PAYMENTS ============
create table if not exists payments (
  reference   text primary key,
  user_id     uuid not null references profiles(id) on delete cascade,
  plan_id     text not null,
  amount_kobo int not null,
  currency    text not null default 'NGN',
  status      text not null default 'pending' check (status in ('pending','success','failed')),
  channel     text,
  paid_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_payments_user on payments (user_id, created_at desc);
