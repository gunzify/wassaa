-- Google identities are optional and linked only after the member verifies a
-- phone number already on, or newly created for, their WASSAA profile.
alter table profiles add column if not exists google_sub text;
alter table profiles add column if not exists google_email text;

create unique index if not exists idx_profiles_google_sub_active
  on profiles (google_sub)
  where google_sub is not null and deleted_at is null;
