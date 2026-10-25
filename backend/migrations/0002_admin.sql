-- WASSAA schema migration 0002: admin audit trail
-- Apply with: npm run db:migrate   (idempotent)

create table if not exists admin_audit (
  id          bigserial primary key,
  admin_id    text not null,
  action      text not null,              -- verification.approved | verification.rejected | user.blocked | report.status
  target_id   text,                       -- submission / user / report id
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_admin_audit_created on admin_audit (created_at desc);

-- Review console reads the queue by status + age, and reports by status.
create index if not exists idx_reports_status on reports (status, created_at desc);
create index if not exists idx_verif_user on verification_submissions (user_id, submitted_at desc);
