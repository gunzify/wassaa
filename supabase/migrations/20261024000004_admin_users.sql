-- Admin identities are explicitly allowlisted by an owner through SQL.
create table if not exists public.wassaa_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);
alter table public.wassaa_admin_users enable row level security;
revoke all on public.wassaa_admin_users from anon, authenticated;
grant select on public.wassaa_admin_users to service_role;
