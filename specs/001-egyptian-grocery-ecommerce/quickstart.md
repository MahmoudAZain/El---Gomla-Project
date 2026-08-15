# Quickstart & Validation Guide

**Feature**: `specs/001-egyptian-grocery-ecommerce`

How to bring the project up locally, deploy it, and verify that the guarantees the constitution
insists on actually hold. Written to be runnable by someone joining the project cold.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 22 LTS | Build and runtime toolchain |
| npm | 10+ | Package management |
| Docker | current | Runs the local Supabase stack |
| Supabase CLI | 2.x | Local database, migrations, type generation |
| Wrangler | 4.x | Cloudflare Workers deploy and local preview |

Accounts needed: a Supabase project (free tier) and a Cloudflare account (free tier). Neither
requires a payment method for this stack.

---

## Local setup

```bash
npm install
supabase start                 # Postgres, Auth, Storage on localhost
supabase db reset              # Applies migrations/ then seed.sql
npm run gen:types              # Regenerates src/types/database.ts from the schema
cp .env.example .env.local     # Fill from the `supabase start` output
npm run dev                    # http://localhost:3000 → redirects to /ar
```

`supabase db reset` is the canonical way to rebuild: it applies every migration from empty and
then seeds. If a schema change works only against an already-populated database, the migration
is wrong.

### Environment variables

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Anon key — safe to expose; RLS is the boundary |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Bypasses RLS. Never import into a client component |
| `NEXT_PUBLIC_SITE_URL` | Public | Canonical origin |
| `CRON_SECRET` | Server only | Shared secret for the scheduled endpoints |

`SUPABASE_SERVICE_ROLE_KEY` is used only in `src/lib/supabase/service.ts`, which carries the
`server-only` import guard. If that key ever reaches a client bundle, every RLS policy in the
system is void (FR-066). The build fails rather than shipping it.

### One-time Supabase dashboard configuration

Two settings are not expressible in migrations and must be set on the hosted project:

1. **Authentication → Providers → Email**: enabled, with **"Confirm email" turned off**.
   Without this, signup stalls waiting for a confirmation that can never arrive — there is no
   mailbox behind the synthetic address (research R2).
2. **Authentication → Providers → Phone**: disabled. It would require a paid SMS gateway.

---

## Verifying the critical guarantees

These are the four areas the constitution names as money-or-data critical. Run them before
believing the system works.

### 1. Server-authoritative pricing (Principle I, SC-005, SC-006)

```bash
npm run test:sql -- pricing.test.sql
npm run test:sql -- place_order.test.sql
```

**Expected**: every case in the tables at [contracts/rpc-contracts.md](contracts/rpc-contracts.md)
passes. The decisive ones:

- Submitting `{"product_id": "...", "qty": 1, "unit_price": 1}` produces an order at the
  **database's** price, not `1`.
- Submitting `grand_total: 0` produces the computed total.
- A price changed between `price_cart` and `place_order` results in an order at the placement
  price.

Manual confirmation that the client cannot write a price at all:

```sql
-- As an authenticated customer JWT (not the service role):
INSERT INTO orders (profile_id, governorate_id, subtotal, grand_total, ...) VALUES (...);
-- Expected: new row violates row-level security policy for table "orders"
-- There is no INSERT policy for any role. This is the guarantee, not a check.
```

### 2. Customer and cost isolation (Principle II, SC-007, SC-008)

```bash
npm run test:sql -- rls.test.sql
```

**Expected**: all 20 assertions in
[contracts/rls-policies.md](contracts/rls-policies.md#verification-matrix) pass. Spot-check the
two that matter most, using two real customer JWTs:

```sql
-- As Customer A, asking for Customer B's orders:
SELECT * FROM orders WHERE profile_id = '<customer-B-uuid>';
-- Expected: 0 rows. Not an error — simply nothing, because the policy filters it away.

-- As a customer, and again as staff:
SELECT * FROM product_costs;
-- Expected: permission denied for table product_costs
-- Not an empty result — no grant exists at all.
```

The distinction matters: 0 rows means the policy worked; `permission denied` means the table is
not reachable by that role under any query. Cost data gets the stronger treatment.

### 3. Order lifecycle integrity (Principle VII, SC-010, SC-011)

```bash
npm run test:sql -- transitions.test.sql
```

**Expected**: every legal transition succeeds, every illegal one raises `invalid_transition`,
and each accepted transition appends exactly one history row. Confirm immutability directly:

```sql
UPDATE order_status_history SET to_status = 'delivered' WHERE id = '<any>';
-- Expected: denied for every role including admin. No UPDATE policy exists.
```

### 4. Report accuracy and margin isolation (SC-017, SC-018)

```bash
npm run test:sql -- reporting.test.sql
npm run test:sql -- reporting-authz.test.sql
npm run test:integration -- report-export
```

**Expected**: every aggregate reconciles exactly against the orders behind it, and margin data
is unreachable by staff. The cases that catch real bugs:

```sql
-- Deliver one order at 23:50 and another at 00:10 Cairo time, then:
SELECT * FROM report_sales_by_day('2026-08-13', '2026-08-14');
-- Expected: each lands on its own Cairo day. Grouping by UTC would push the
-- 23:50 order into the next day and no daily total would match the till.

-- As staff:
SELECT * FROM report_product_margin('2026-08-01', '2026-08-31');
-- Expected: raises not_authorized. Not an empty set — an empty set is
-- indistinguishable from an empty date range, and enforces nothing.
```

Verify the export encoding by hand once — it is the detail most likely to be silently wrong:

```bash
curl -s '<host>/api/reports/sales-by-product/export?format=csv&from=2026-08-01&to=2026-08-31' \
  | head -c 3 | xxd
# Expected: 00000000: efbb bf
```

Those three bytes are the UTF-8 byte-order mark. Without them, Excel on Windows opens the file
in the system codepage and every Arabic product name becomes mojibake — the export is worthless
to the people who need it. Open one file in Excel and confirm Arabic renders before calling this
done.

### 5. Concurrency (SC-016)

```bash
npm run test:integration -- concurrent-order
```

Two simultaneous `place_order` calls for the last unit of stock. **Expected**: exactly one
order exists; the other call raises `insufficient_stock`; `stock_qty` is `0`, never negative.

---

## End-to-end journey (SC-001, SC-012, SC-013)

```bash
npm run test:e2e
```

Playwright drives the primary journey at a 360px viewport in Arabic:

1. Land on `/` → redirected to `/ar`, `<html dir="rtl">`.
2. Browse a category, open a product, confirm both languages and the promotional price.
3. Add to cart; confirm the total comes from the server.
4. Register with name, phone, governorate, address and **landmark** — confirm the form refuses a blank
   landmark.
5. Check out; confirm the delivery fee matches the selected governorate.
6. Place the order; confirm the reference, the totals and "cash on delivery".
7. Open order history; confirm the order appears with status *submitted*.
8. Cancel it; confirm it moves to *cancelled* and the history records the customer as actor.

Two assertions run on every page: **no horizontal overflow at 360px** (SC-012), and **switching
language mid-flow preserves the cart and the current page** (SC-013).

### Manual checks worth doing by hand

- Switch to English mid-checkout: layout flips to LTR, cart intact, same step.
- Register the same number as `01001234567` and `+20 100 123 4567`: the second is refused as
  already registered (FR-009, FR-011).
- Sign in with a wrong password five times: further attempts are refused (FR-014).
- As a signed-in customer, navigate directly to `/ar/admin`: denied, with no admin data in the
  response body (FR-064).

---

## Deployment

Publishing happens from GitHub: merging to `main` runs `.github/workflows/deploy.yml`,
which verifies the commit, applies migrations, builds the Workers bundle and deploys it.
Set the configuration below once and every later release is a merge.

### 1. Create the two accounts

A Supabase project (free tier is the documented target) and a Cloudflare account.
From Supabase → Settings → API, note the project URL, the `anon` key and the
`service_role` key. From Cloudflare, create an API token with the **Edit Cloudflare
Workers** template, and note the account ID.

### 2. Turn off what cannot work

Supabase → Authentication → Providers:

- **Email confirmations: off.** Accounts are keyed to a synthetic address on a
  non-routable domain (`<digits>@phone.elgomala.local`), so a confirmation email can
  never arrive and every signup would hang waiting for one.
- **Phone provider: disabled.** There is no SMS in this design; the phone number is
  the business identity, not an auth channel.

### 3. Configure the repository

GitHub → Settings → Secrets and variables → Actions.

| Name | Kind | Where it comes from |
|---|---|---|
| `SUPABASE_PROJECT_REF` | secret | The subdomain of the project URL |
| `SUPABASE_ACCESS_TOKEN` | secret | Supabase → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | secret | Chosen when the project was created |
| `NEXT_PUBLIC_SUPABASE_URL` | secret | Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | secret | Settings → API → `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | Settings → API → `service_role` key |
| `CRON_SECRET` | secret | Generate: `openssl rand -base64 32` |
| `CLOUDFLARE_API_TOKEN` | secret | Cloudflare → My Profile → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | secret | Cloudflare dashboard sidebar |
| `NEXT_PUBLIC_SITE_URL` | **variable** | The production origin, no trailing slash |

`NEXT_PUBLIC_SITE_URL` is a *variable* rather than a secret because it is not one, and
because the smoke test at the end of the deploy prints it. On the first deploy, before a
custom domain exists, use the `https://el-gomala.<subdomain>.workers.dev` address
Cloudflare assigns; change it later and re-run the workflow.

The anon key sits among the secrets for tidiness, not protection — it is designed to be
public, and Row Level Security is the boundary (Principle II).

### 4. Merge

Merging to `main` publishes. The workflow refuses to deploy if the typecheck, lint or
unit tests fail on the merge commit, and it applies migrations *before* deploying, so
the Worker never queries a column the database does not have yet.

### 5. Create the first admin

Nobody can reach `/admin` yet: staff accounts are made by an administrator and never
self-registered (FR-060), so the first one has to be made from outside the app. Run this
once, locally:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role key> \
ADMIN_PASSWORD='<choose one now>' \
node --experimental-strip-types scripts/bootstrap-admin.ts \
  --phone 01001234567 --name 'Your Name'
```

Creating the user through the Supabase dashboard instead does **not** work, and fails
confusingly: the app's notion of who someone is lives in `public.profiles`, `is_admin()`
reads `profiles.role`, and no trigger creates that row. A dashboard-only user gets a
login that is then refused by every policy. The script writes both rows, and normalizes
the phone with the same function the storefront uses so the number matches at sign-in.

### 6. Set delivery coverage

The shop serves nowhere until you say so. Sign in, open **/ar/admin/governorates**, and
for each governorate you deliver to set the fee, set the minimum order value, and switch
it on. All 27 are listed; none is active and none has a fee, because those are business
decisions and this project keeps them out of the code entirely (FR-056a). They stay
editable from that screen forever — no deploy, no developer.

### Deploying from a laptop instead

```bash
supabase link --project-ref <ref>
supabase db push

npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put CRON_SECRET

NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
NEXT_PUBLIC_SITE_URL=https://... npm run cf:build
npx wrangler deploy --var NEXT_PUBLIC_SITE_URL:https://...
```

The `NEXT_PUBLIC_*` values must be present for the **build**, not just the deploy: Next
inlines them into the bundle, so setting them afterwards as Worker variables does
nothing. This is the single most common way a first deploy comes up broken.

### Scheduled jobs (`wrangler.jsonc`)

| Schedule | Job | Why |
|---|---|---|
| `0 */6 * * *` | Keep-alive | Free-tier projects pause after 7 days without an API request |
| `0 3 * * *` | Login-attempt sweep | Bounds the table against the 500 MB ceiling |
| `0 4 * * 0` | Orphan image sweep | Reclaims storage objects no photo row references |
| `0 5 * * 0` | Data export | **The free tier has no backups** — this is the only recovery point |

Cloudflare invokes these through the `scheduled` handler, which the OpenNext-generated
worker does not export — `worker/index.ts` adds it and delegates every request unchanged.
Without that file the triggers fire into nothing, silently, and the keep-alive that stops
the database pausing never runs.

### Post-deploy checklist

Walk this once, on the deployed site, in this order. Everything above is automated;
these are the things only a person can confirm.

**It came up**

- [ ] `https://<site>/ar` returns the storefront in Arabic, laid out right-to-left
- [ ] `https://<site>/en` returns the same page in English, left-to-right
- [ ] Cloudflare → Workers → el-gomala → Logs shows no startup error
      (an `Invalid client environment` here means a `NEXT_PUBLIC_*` was missing at
      build time — fix the secret and re-run the workflow, redeploying alone will not
      help)

**Configuration**

- [ ] Email confirmations **off**; phone provider **disabled**
- [ ] `product-images` bucket exists, public read, admin write
      (created by migration 0011 — check Supabase → Storage)
- [ ] `backups` bucket exists and is **private**, with no policy for any client role
- [ ] All 27 governorates listed at `/ar/admin/governorates`
- [ ] At least one governorate active, with a real fee and minimum order value
- [ ] Bootstrap admin can sign in and reach `/ar/admin`

**The guarantees**

- [ ] Register a throwaway customer, place a small order, and confirm the total is
      subtotal − discount + the delivery fee you just set
- [ ] Change that governorate's fee in the admin, reload the shop: a **new** cart prices
      at the new fee, and the order already placed still shows the old one — the driver
      collects what the customer agreed (FR-056a)
- [ ] `admin_audit_log` has a row for that change, naming who made it
- [ ] Signed in as that customer, open `/ar/admin`: refused, with no admin data anywhere
      in the response body (FR-064)
- [ ] Sign in with a wrong password five times: further attempts are refused (FR-014)
- [ ] View source on a storefront page and search for `service_role`: absent (FR-066)

**The jobs**

- [ ] Cloudflare → Workers → el-gomala → Settings → Triggers lists all four crons
- [ ] Trigger the keep-alive by hand and confirm a 200:
      `curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/keepalive`
- [ ] After the first Sunday, the `backups` bucket contains a dated export.
      **This is the only recovery point the free tier has** — if it is empty, the shop is
      running with no backups at all

**Then**

- [ ] Delete the throwaway customer and its order
- [ ] Record who holds the admin password, and where `CRON_SECRET` is kept

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Signup hangs, no session | Email confirmation left on | Turn it off in Auth settings — nothing can confirm a synthetic address |
| Queries return 0 rows unexpectedly | RLS filtering the anon role | Confirm `is_active`; check the JWT is actually attached |
| `permission denied for table product_costs` | Working as intended | Only `admin` may read it |
| Layout looks wrong in Arabic | Physical `left`/`right` used | Replace with logical `start`/`end` utilities; the lint rule catches these |
| Prices show as `4500` | Formatting skipped | Piastres — divide by 100 at the render boundary only |
| Site unreachable after a quiet week | Free-tier project paused | Resume in the dashboard; confirm the keep-alive cron is firing |
| Deploy fails on Node APIs | `nodejs_compat` missing | Add the compatibility flag in `wrangler.jsonc` |
| Search misses an Arabic product | Term not normalized | Both sides must pass through `search_normalize()` |
