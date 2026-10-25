# WASSAA Monetization & Economy

> How WASSAA earns money, member-by-member, with pricing and entitlements that are enforced **server-side**.
> Server source of truth: `backend/src/routes/billing.ts` (`PLANS`, `CONSUMABLES`, `entitlementsFor`).

---

## 1. Revenue model

Three direct-to-member revenue lines. The platform never sells gate-kept human matchmaking in Phase 1 (see §4 Legality).

| Line | What the member buys | Revenue shape |
|---|---|---|
| Subscription | A tier with connection & discretion entitlements | Recurring monthly (Paystack-hosted checkout + webhook) |
| Identity verification | One-time **manual** review of ID + live selfie | Single payment (₦1,500) |
| Consumables | Spotify-style spotlight visibility | Single payment, per-use |

## 2. Pricing (source of truth = server)

### Membership tiers

| Tier | Price | Entitlements (`GET /billing/entitlements`) |
|---|---|---|
| **Free** | ₦0 / month | 30 likes/day · 1 Super Like/week · no see-likes · no rewind · no incognito · 0 boosts/mo · no read receipts |
| **Premium (WASSAA Plus)** | ₦1,500 / month | Unlimited likes · 5 Super Likes/week · see who liked you · rewind last pass · advanced discovery filters · 1 boost/mo |
| **Hyper Premium (WASSAA VIP)** | ₦5,000 / month | Everything in Premium · Private Introduction (consent-gated) · Incognito browse · 3 boosts/mo · read receipts · priority placement in the match queue |

Design intent: the free tier makes the community real (30 meaningful likes/day is enough to get matches), while the paywall targets **knowing who is interested and being seen** — not messaging between matched people, which is free for everyone.

### One-time items

| Item | Price | Notes |
|---|---|---|
| `verification_fee` | ₦1,500 | Pays for the human reviewer's time to adjudicate ID + selfie. Not a "verified account membership". |
| `boost_1` (Spotlight Boost) | ₦700 | 30 minutes of boosted placement in the discovery deck. |
| `superlike_pack_5` | ₦1,000 | Pack of 5 Super Likes. |

## 3. Enforcement mechanics

- **Checkout** (`POST /billing/checkout`): creates a `pending` payment row, then initializes a Paystack transaction. Member redirected to the Paystack-hosted page; on return the client can activate.
- **Webhook** (`POST /billing/webhook`): raw-body HMAC verification (`PAYSTACK_WEBHOOK_SECRET`), idempotent fulfilment — `resolvePayment` guards double-spend, tier is **never downgraded** by a lower plan purchase, preview/sandbox never applies in production.
- **Activation** (`POST /billing/activate`): validates the payment belongs to the calling user and is `success` before promoting the tier. The client cannot invent entitlements.
- **Entitlements** (`GET /billing/entitlements`): every rate-limiting decision (daily likes, super likes, see-likes, rewind, boosts) reads from the server, never from the client.

## 4. Legality of matching-fee monetization

The core risk identified in the blueprint was fee-based subscription/dating platforms in Nigeria... human matchmaking is generally blurred with regulations limiting adult-entertainment matching. WASSAA's position:

1. **Sold in Phase 1:** software features (likes, visibility, discovery filters, boosts) — analogous to dating apps, not an introduction agency.
2. **Sold, but framed carefully:** the ₦1,500 verification fee pays for **document adjudication labor**, and is disclosed as such in-product.
3. **Deferred to Phase 4:** any "we find you a match" disclosure-based match introduction service — a human-hours service with pricing-per-introduction — only launches after legal guidance, separate contracts, and geo-distribution readiness.
4. **Card / professionalism guardrails verified as product features, not purchasable status:** a verified badge never conveys rank, duty station or branch; private introductions are consent-gated and opt-in.

## 5. Economy rationale

| Decision | Rationale |
|---|---|
| Free messaging after mutual match | Keeps safety/sanity — paywalling conversation invites pay-for-harassment would otherwise create duties; conversation stays free and reportable. |
| ₦1,500 / ₦5,000 price points | Below 1% of a net-salary; a monthly connectivity tier a consumer will renew. Naira-denominated, no dollar surprises. |
| Verification priced once, not monthly | Identity is not a lease. One fee → one review → one badge, forever, unless revoked by safety moderation. |
| Boosts as consumables, not subscription features (₦700/30min) | Volunteers control exactly when they want visibility (e.g., weekend evenings in Lagos) without a bigger plan. |
| Server-authoritative entitlements | Enables future growth without trusting clients, and clean audit trail on every naira. |

## 6. Revenue scenarios (order-of-magnitude)

Assume 10,000 registered accounts in Year 1, 8% monthly conversion to Premium (₦1,500), 2% to VIP (₦5,000), plus ~1,200 verification fees and 2,000 boost packs.

| Revenue stream | Monthly estimate |
|---|---|
| Premium: 800 × ₦1,500 | ₦1,200,000 |
| VIP: 200 × ₦5,000 | ₦1,000,000 |
| Verification fees: ~100/mo × ₦1,500 | ₦150,000 |
| Consumables (boosts + super-like packs) | ₦300,000 |
| **Gross (monthly)** | **≈ ₦2,650,000** |

Before: Paystack fees (~1.5% local cards, 3.9% international), payment processing loss, SMS OTP costs (≈ ₦4/request), reviewer costs for verification, and operations. The verification fee is priced to cover review labor at roughly ₦1,000–₦1,100 net per case, with a small margin.

Churn guards built into the product: rewind + see-likes are weekly-refreshable rituals; VIP's read-receipts and incognito are daily habits.
