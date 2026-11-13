# Implicit state machines and the invariants that now hold

Audit date: 2026-11-12. Scope: active Edge API (`supabase/functions/api/`),
SQL migrations, the React app shell, and the no-build admin console.

A state machine is "implicit" here when the product has a state but the state is
stored in more than one column/table, or when a transition is a sequence of
writes that can stop halfway. Each section lists the real states, the writers,
the bug that existed, and the invariant now enforced.

The database changes live in
`supabase/migrations/20261112000000_state_invariants.sql`. Never edit applied
migrations; add a new one.

## 1. Account standing (`profiles.blocked_us` + `profiles.account_status`)

- **States:** active, restricted, banned.
- **Writers before:** report-block wrote only `blocked_us`; sanction and
  appeal-grant wrote only `account_status`. A row could be blocked in the deck
  and active in the session, or banned in the session and visible in the deck.
- **Bug:** a `blocked_us` member got `403` before the gate allowlist, so they
  could not file the appeal the app offered them. A granted appeal cleared
  `account_status` but left `blocked_us`, so the member stayed locked out.
- **Invariant:** `blocked_us` is the legacy spelling of `account_status =
  'banned'`; the API reads both through `accountStatusOf()`. Every writer sets
  both. The migration backfills both directions and installs the
  `wassaa_sync_account_standing` trigger, which normalises either spelling on
  write (`blocked_us` implies `banned`, `banned` implies `blocked_us`). Unlike a
  CHECK constraint, the trigger does not reject a legacy single-column write,
  so deploying the migration before the new Edge function cannot break the
  moderation console.
- **Gate:** banned accounts may call `/auth/session`, `/appeals` and
  `/me/account` (erasure is a legal right); everything else returns
  `ACCOUNT_BANNED`. Restricted accounts may read; mutations return
  `ACCOUNT_RESTRICTED`.

## 2. Sanction ladder (`active -> restricted -> banned`)

- **Bug:** an admin could apply `restrict` to a banned account, silently
  widening access from banned to read-only, while `blocked_us` might still say
  banned.
- **Invariant:** `ban -> restrict` is refused with `409`; lift the ban first.
  Lift/ban/restrict all write `blocked_us` in lockstep and audit the action.

## 3. Persona visibility (`npc_active`, `npc_photo_review`, `npc.photoState`)

- **States:** paused, awaiting a human-chosen photo, quarantined, live.
- **Writers before:** discovery checked only `npc_active`; send/reply checked
  only `npc_active`; the admin activation guard checked only quarantine.
- **Bug:** an active-but-quarantined or active-but-face-less persona leaked into
  the deck; a stale card could be liked or messaged; the console could show
  "Active" on a persona members could never see.
- **Invariant:** one predicate, used by discovery, likes, cold opens, send and
  the NPC reply RPC:

  ```sql
  npc_active
  and coalesce(npc_photo_review, 'ok') <> 'quarantine'
  and coalesce(npc->>'photoState', 'ready') <> 'awaiting_upload'
  ```

  Admin activation refuses quarantine and no-photo rows (`409`). A photo upload
  clears the automated quarantine (a human chose the face) and, for a curated
  persona, leaves `npc_active` alone so editing cannot push it live by accident.
- **Follow-up (2026-11-13):** the invariant exposed a second writer drift. Seeding
  set `photoState: 'awaiting_upload'` when the auto face-dealer ran out of faces;
  curation then attached a photo and never cleared the flag, so 25 curated picks
  were refused at activation and 3 of them were live but invisible. `npc-curate.mjs`
  now writes `'ready'` when the pick has a usable face and leaves the flag alone
  when the face is missing or flagged. The repair is idempotent.

## 4. Persona thread engine (`matches.auto_state`)

- **States:** `none` (no greeting yet), `active` (reply window),
  `quiet` (15-reply budget spent), `admin_owned` (staff-operated after a credit
  purchase).
- **Bug:** the reply window was consumed before the answer existed. An AI or DB
  failure left the thread `active` with `auto_next_at = null`, so the member
  paid for a message that would never be answered. A failed opener did the same.
- **Invariant:** the claim is committed first, but a failed reply restores the
  claimed window; a failed opener releases the thread to `none`. The engine
  filters paused/quarantined/face-less personas before claiming anything.

## 5. Message send and price (`wassaa_send_message`)

- **States:** free chat, warm match, cold open (cap 3), persona thread,
  admin-owned thread.
- **Bug:** the RPC spent credits and inserted a message into a thread whose
  partner was banned, erased, paused or face-less. It also keyed warm persona
  pricing on `npc_active`, so pausing a persona mid-conversation silently
  dropped the thread to cold pricing and the three-message cap.
- **Invariant:** partner eligibility is checked before any credit moves
  (`unavailable`, mapped to `403`). `admin_owned` is exempt from the persona
  readiness check because staff, not the engine, answer it. Warm pricing follows
  `is_npc`, not the live flag.

## 6. Boost (`profiles.boosted_until` + credits)

- **Bug:** read timestamp -> spend credit -> write timestamp. Two concurrent
  taps charged twice for one hour; a failed final write kept the credits; the
  "+1 hour" could be computed from a stale timestamp.
- **Invariant:** `wassaa_start_boost(p_profile, p_cost)` takes advisory lock 47,
  checks the account is active, spends, extends from `max(boosted_until, now())`
  and writes in one transaction.

## 7. Reveal likes (`profiles.revealed_likes_at` + credits)

- **Bug:** spend first, stamp second. A failed stamp or a second tap charged
  again; a like list that resolved to no visible profiles still charged 15.
- **Invariant:** `wassaa_reveal_likes(p_profile, p_cost)` locks, treats an open
  24h window as a no-op, and spends + stamps together. The API resolves and
  filters the likers before charging.

## 8. Daily swipe cap and the paid extra swipe

- **Bug:** the paywall spent with ledger reason `extra_swipe`, but the
  `credit_ledger_reason_check` never allowed that value. Every attempt raised a
  check violation, the API treated the null balance as "no credits", and the
  member could not buy past the cap at any balance.
- **Invariant:** the migration adds `extra_swipe` to the ledger check. A failed
  spend is reported as a retryable `500`, not as "no credits".

## 9. Verification review (`verification_submissions` + `profiles`)

- **Bug:** the submission was marked reviewed, then the profile was updated
  without checking the result. A failed profile update left a dead end: the
  member stayed pending forever and the admin could not re-review (409).
- **Invariant:** if the profile update fails, the submission is returned to
  `pending` and the request fails with a retry message.

## 10. Appeal decision (`appeals` + `profiles`)

- **Bug:** the appeal could be marked granted while the profile write failed,
  leaving a "granted" case on a still-banned account. The admin could not decide
  it again (409).
- **Invariant:** a failed reinstate returns the appeal to `pending`; both
  `account_status` and `blocked_us` are cleared on success.

## 11. Payment fulfillment (`payments` + `profiles` + ledger)

- **States:** pending, success, failed.
- **Invariant (already correct):** `wassaa_fulfill_payment` flips pending ->
  success exactly once, then grants credits/tier and promotes the buyer's NPC
  threads to `admin_owned` in the same transaction. Success implies delivered.

## 12. Report + block (`reports.also_blocked` + `blocks`)

- **Bug:** the report was inserted first, the block second and unchecked. A
  failed block still told the member "reported and blocked".
- **Invariant:** when `alsoBlock` is set, the block is written first; if it
  fails, no report is filed and the member sees an error. The safety action is
  never reported as done when it is not.

## 13. Location and radius (`profiles.location_*` + `match_preferences`)

- **Bug:** clearing the device location was one update, then clearing
  `maxDistanceKm` was a second unchecked update. A failure left a radius with no
  coordinates. Discovery then filters on a distance that cannot be computed and
  returns an empty deck forever.
- **Invariant:** both changes are one row update.

## 14. Likes, matches and the cold thread origin (`matches.origin`)

- **States:** cold (one side opened) vs match (both sides liked).
- **Invariant:** `wassaa_record_like` and `wassaa_find_or_create_match` refuse
  banned/erased participants and unreachable personas at the DB level, so the
  deck rule is also the write rule. Promoting a cold thread still inserts the
  single "You matched" system line and the notification trigger fires once.

## 15. Credits ledger

- **Invariant:** balance changes always go through `wassaa_spend_credit` /
  `wassaa_grant_credit`, which take advisory lock 42 (grant: 42) and append a
  ledger row with `balance_after`. Daily drip is idempotent per calendar day.
  The only missing reason (`extra_swipe`) is added by the migration.

## 16. Onboarding gate (client `getProfileCompletion` vs server `isOnboardingComplete`)

- **States:** draft, complete, sanctioned.
- **Invariant:** the server remains authoritative. An `ONBOARDING_REQUIRED`
  response now routes the client to onboarding instead of leaving it on a screen
  whose every action fails. `ACCOUNT_BANNED` routes to the appeal screen and
  updates the local user; `ACCOUNT_RESTRICTED` updates the banner.

## 17. Notifications (`notification_events`, `notification_reads`, mutes)

- **Invariant:** events are one row per event; read state is one row per
  `(user_id, notification_id)`; muting suppresses future triggers only. The
  muted-thread endpoint now keys partner names by thread, not by profile id (it
  used to render every name as "Member").

## 18. Curated persona staging (`npc.curated` + `npc_active`)

- **States:** paused pool, curated/staged, live, quarantined photo.
- **Invariant:** `npc.curated` is a tag, not an activation. Staging sets the tag
  and `npc_active = false`; activation is explicit. Photo upload does not
  auto-activate a curated persona. The console's curated filter and overview
  card read the same tag.

## Intentionally unchanged

- A restriction is visible and read-only; it does not hide the profile from
  others. A ban hides it from discovery and blocks new interactions.
- Unblocking does not restore deleted likes, matches or messages.
- Muting a thread does not delete unread events that already exist.
- `quiet` threads still charge for member messages (the KB says credits, not
  free); the persona simply stops replying.
- Deleting an account purges media and profile rows, but is not a full legal
  retention policy (see KB §10).
- The DB-level checks are the last line of defence; roles/RLS are unchanged.

## Deploy note

The Edge API changes are source-only until the function is redeployed. The SQL
changes are source-only until the migration is pushed. Both are required for
the invariants above to hold in production.

Recommended order: **push the migration first, then deploy the Edge API**. The
new API calls `wassaa_start_boost` and `wassaa_reveal_likes`, which do not exist
until the migration lands, so the reverse order leaves Boost and reveal failing
for the gap. Pushing SQL first is safe for the currently deployed function: the
standing trigger normalises its single-column writes instead of rejecting them.
