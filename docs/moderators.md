# Moderators — scoped staff for the persona deck

The console used to have one kind of operator: an allowlisted account that could
do everything. Writing 800 personas, reviewing IDs, judging reports and answering
every handover thread is one person's job today. Handing a helper full access just
to let them fix a bio and answer a persona thread is how a member gets banned by
accident.

This layer adds three rungs, one owner per persona, and a claim lease so two
people never answer the same member twice.

- Migration: `supabase/migrations/20261118000000_moderators.sql`
- API: `supabase/functions/api/index.ts` (`staffOf`, `staffOwnsPersona`,
  `wassaa_assign_persona`, `wassaa_staff_send`)
- Console: `frontend/public/admin/{index.html,app.js}`
- Test: `node scripts/moderator-smoke.mjs`

## Roles

| Role | Who | Summary |
| --- | --- | --- |
| `owner` | The founder. Exactly one. | Everything, plus staff management and ownership transfer. |
| `admin` | Trusted operators. | Everything except adding/removing staff or changing roles. Can read the staff directory (needed to assign). |
| `moderator` | Persona writers and chat operators. | Only the personas assigned to them, and only their threads. |

The migration promotes the **earliest** row in `wassaa_admin_users` to `owner`
and leaves every other existing row as `admin`, so deploying does not change what
today's accounts can do. The promotion is guarded by `not exists (… role='owner')`
and is idempotent.

Roles live on `wassaa_admin_users`:

```
role          owner | admin | moderator      (default admin)
status        active | suspended            (default active)
persona_limit 1..200                         (default 30)
created_by    display name of the inviter
last_seen_at  reserved for the directory
```

A suspended account is refused at the door (`403 This staff account is
suspended.`), even with a valid Google session. Suspending also releases every
thread lease the account held. Assignments are kept, so reactivation resumes the
same desk.

## Capability matrix

`GET /admin/session` returns the same matrix the API enforces, so the console can
hide what the server would refuse.

| Capability | owner | admin | moderator |
| --- | --- | --- | --- |
| See all personas | yes | yes | assigned only |
| Edit persona profile, bio, prompts, lifestyle | yes | yes | assigned only |
| Add/replace photos | yes | yes | assigned only (upload is a proposal; admin releases) |
| Attach the admin-only photo source link | yes | yes | assigned only |
| Write persona message scripts | yes | yes | assigned only |
| Flag a photo as generated | yes | yes | assigned only |
| Release a quarantined photo | yes | yes | **no** |
| Activate / pause a persona | yes | yes | **no** |
| Add/remove from curated set | yes | yes | **no** |
| Set the verified seal, toggle AI replies | yes | yes | **no** |
| See all threads | yes | yes | assigned personas only |
| Reply as a persona | yes | yes | assigned + hold the lease |
| Claim / release a thread | yes | yes | assigned only |
| Escalate a thread | yes | yes | yes |
| Verifications, reports, appeals, sanctions, blocks, member detail | yes | yes | **no** |
| Notification to a member | yes | yes | **no** |
| Audit log | yes | yes | **no** |
| Staff directory | read + write | read only | **no** |
| Assign personas | yes | yes | **no** |
| Ownership transfer | yes | **no** | **no** |

The whitelist is explicit: `MODERATOR_PATHS` in `index.ts`. A new admin route is
closed to moderators until it is added there on purpose. That is deliberate — the
alternative ("admins minus the buttons we remembered to hide") fails open.

## Assignment model

`wassaa_persona_assignments` is an append-only history:

```
persona_id     profiles(id)   the NPC
moderator_id   auth.users(id) the operator
assigned_by    display name snapshot
assigned_by_id auth user id of the admin
assigned_at    timestamptz
revoked_at     null while active
revoked_by     display name of whoever ended it
note           optional handover note
```

A partial unique index — `wassaa_one_active_moderator_per_persona` on
`persona_id where revoked_at is null` — makes "one character, one voice" a
database invariant, not a UI convention.

`wassaa_assign_persona(persona, moderator, actor, actor_id, note)` runs the whole
transition in one transaction under an advisory lock on the moderator:

1. `moderator = null` → revoke the active holder and stop.
2. Validate the target is active staff with role `moderator`.
3. Validate the target row is an NPC.
4. Count the moderator's active assignments. If at `persona_limit` and this
   persona is not already theirs, return `{error:'limit'}`.
5. Revoke the persona's current active assignment.
6. Insert the new one.

Two admins assigning at the same time cannot overfill a moderator or leave two
active rows. Reassigning a persona is a **move**: the previous moderator loses
edit and chat access immediately.

`POST /admin/npcs/assign` applies the same RPC to up to 100 ids and reports
`{assigned, skipped, limitHit}`. The console exposes single-persona assignment on
each card; bulk is available for scripts and future UI.

## Thread claim lease

`auto_state = 'admin_owned'` says a human answers a thread. It does not say which
human, so two moderators could both start typing. A claim adds:

```
matches.claimed_by          auth user id of the operator
matches.claim_expires_at    now() + 30 minutes, renewed on every send
```

- **Claim** (`POST /admin/threads/:id/claim`) is a conditional update: allowed
  when unclaimed, already yours, or the previous lease expired. Losing the race
  returns `409` with the holder's name.
- **Send** goes through `wassaa_staff_send`, which locks the match row, checks
  assignment (moderators only), checks the lease, takes/renews it, sets
  `auto_state='admin_owned'`, clears any escalation and inserts the message — one
  transition, no check-then-write window.
- **Release** (`POST …/release`) is allowed for the holder, or any admin as a
  force-release.
- A moderator typing into an unclaimed thread simply claims it by sending. The
  console disables the composer when someone else holds a live lease and shows
  when it ends.

Claims expire on their own. Nothing sweeps them: the claim check treats an
expired `claim_expires_at` as free, so a crashed browser cannot lock a member out.

## Escalation

`matches.escalated_at` + `escalation_note` are a hand-raise, not a handover.

- A moderator escalates with a required note (member never sees it).
- The admin bell (`/admin/activity`) and overview count escalations.
- An admin clears it (`DELETE …/escalate`) or replies — `wassaa_staff_send`
  clears it automatically when a human answers.
- Escalating does not release the lease; the moderator keeps working the thread
  unless an admin takes over.

## Attribution and audit

Persona messages keep `sender_id = persona` for members. The console also stores:

```
messages.sent_by_staff   auth user id
messages.sent_by_name    display-name snapshot
```

`staffMessageRow` exposes `sentByStaff` / `sentByName` **only** on admin routes.
The member message route uses `messageRow`, which does not include them — members
must not be able to tell personas from people.

Every staff action writes to `admin_audit` with both `admin_id` (name) and
`actor_user_id` (id). Names can collide; ids cannot. Actions added:

```
npc.assigned            npc.unassigned
npc.assigned_bulk       npc.unassigned_bulk
thread.claimed          thread.released
thread.escalated        thread.escalation_cleared
thread.message
staff.added             staff.updated
staff.removed           staff.ownership_transferred
```

Sends are rate-limited per operator (`staff_message`, 30 per 60 s) so a moderator
cannot flood a member faster than a human could type.

## Staff lifecycle

1. The person signs in with Google once. They will see `Admin access is not
   enabled for this account` — that is expected; it creates the auth account.
2. The owner adds them in **Staff** by that email, choosing role and persona
   limit. The API resolves the email through `wassaa_staff_find` (service-role
   only) and inserts the allowlist row.
3. The owner assigns personas. A moderator's **Personas** tab is their assignment
   list; **Chats** is every thread on those personas.
4. Suspension ends access and claims immediately; assignments survive.
5. Removal revokes assignments, releases claims and deletes the allowlist row.
   The person's member account is untouched.
6. Ownership transfer promotes exactly one other account and demotes the current
   owner to admin. Both changes are audited.

Guardrails: you cannot remove or demote the last owner, cannot suspend the owner,
cannot change your own role, and cannot remove your own access. The owner is
always shown but not editable; transfer ownership first.

## API surface

| Route | Method | Who |
| --- | --- | --- |
| `/admin/session` | GET | any staff; returns role + capabilities |
| `/admin/overview` | GET | admin: full; moderator: own desk counters |
| `/admin/activity` | GET | admin: queues; moderator: waiting threads + escalations |
| `/admin/npcs` | GET | admin: all (filters incl. `assigned=none\|<id>`); moderator: assigned |
| `/admin/npcs/:id` | PATCH | admin: all fields; moderator: assigned + non-publishing fields |
| `/admin/npcs/:id/photo-presign` | POST | admin, assigned moderator |
| `/admin/npcs/:id/photos` | POST | admin, assigned moderator (no auto-release / no activation for mods) |
| `/admin/npcs/:id/scripts…` | GET/POST/PATCH/DELETE | admin, assigned moderator |
| `/admin/npcs/:id/quarantine` | POST | flag: admin + assigned moderator; release: admin only |
| `/admin/npcs/:id/assign` | POST | admin (`moderatorId: null` unassigns) |
| `/admin/npcs/assign` | POST | admin, bulk up to 100 |
| `/admin/threads` | GET | admin: all; moderator: assigned (adds `escalated=1`) |
| `/admin/threads/:id/messages` | GET/POST | admin; assigned moderator (POST uses the lease) |
| `/admin/threads/:id/claim` | POST | admin; assigned moderator |
| `/admin/threads/:id/release` | POST | holder, admin |
| `/admin/threads/:id/escalate` | POST/DELETE | admin; assigned moderator |
| `/admin/staff` | GET | owner, admin (read) |
| `/admin/staff` | POST | owner |
| `/admin/staff/:id` | PATCH/DELETE | owner |

## Console changes

- **Role chip** in the header (`name · role`).
- Moderators see only **Chats** and **Personas**. Their overview is their desk:
  assigned, live, waiting replies, threads, escalations, limit.
- Persona cards show the holder (`owned by X` / `unassigned`) and an **Assign**
  action for admins. Publishing buttons are absent for moderators; a moderator
  sees **Flag photo** instead of release.
- The edit sheet keeps publishing controls visible but read-only for moderators,
  and the save payload omits `active`, `curated`, `aiEnabled`,
  `verificationStatus` — the API would 403 otherwise.
- Chats show a `waiting for a reply` badge, last line with operator attribution,
  claim state, **Take over / Release**, and **Escalate**.
- The persona edit sheet carries a **Photo source** field: an `http(s)` link to
  the folder, drive or stock-photo page the face came from, with **Open link**
  and **Copy link**. It is stored as `profiles.npc.photoSourceUrl`, is editable
  by an assigned moderator, and is never serialised by `profileForViewer`, so
  members cannot see it. Cards with a source render a **Source** shortcut.
- The thread sheet shows the lease banner, disables the composer when someone
  else holds it, and labels persona bubbles with `· via <operator>` (console only).
- **Staff** tab: add by email, role, persona limit; per-row save, suspend,
  make owner, remove. Admins get a read-only roster.

## Rollout

1. `npx supabase db push` — migration first; the API writes `actor_user_id` on
   every audit row and calls RPCs that only exist after it.
2. `npx supabase functions deploy api --no-verify-jwt` (or the project's deploy
   script).
3. Verify: `node scripts/moderator-smoke.mjs` (creates and removes its fixtures).
4. The earliest existing admin becomes owner. Sign in and confirm the **Staff**
   tab appears. Add the first moderator by the email they used to sign in.

If the earliest row was a QA/staff account rather than you, the console will show
the staff list read-only for your account. Reassign ownership once in SQL:

```sql
update wassaa_admin_users set role = 'admin' where role = 'owner';
update wassaa_admin_users set role = 'owner' where user_id = '<your auth user id>';
```

The id is the `sub` of your Google session; the console’s role chip and the
`staff` row in `/admin/session` show your name so you can confirm the target.

## Known limits

- Staff are Google accounts; adding by email requires that first sign-in.
- The directory stores a display-name snapshot, not email. Emails stay in
  `auth.users`; the console shows ids.
- No per-shift analytics yet. `last_seen_at` exists but is not written; the audit
  trail is the source of truth for who did what.
- Moderators cannot hand a persona to another moderator; only admins assign.
