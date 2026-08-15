# El-Gomala — الجملة

**Egyptian grocery e-commerce, Arabic-first.**

A bilingual (Arabic-default, RTL) grocery storefront and staff admin console for the Egyptian
market. Cash on delivery only, fulfilled by an in-house fleet. The site's job is to capture
correct orders cheaply and safely.

**Status**: Stages 1–6 complete and stage 7 substantially done — Next.js on Cloudflare Workers
with a bilingual Arabic-first RTL shell, the full data layer with 222 passing SQL assertions,
the storefront through to a placed order, a staff console that runs the catalog, promotions and
delivery pricing without a developer, the order lifecycle from submitted to delivered with a
full audit trail, reporting that reconciles to the piastre and exports to CSV or Excel, and
bilingual search plus the scheduled jobs the free tier requires.

**Deployable.** Merging to `main` runs [the deploy workflow](.github/workflows/deploy.yml):
it verifies the commit, applies migrations to Supabase, builds the Workers bundle, publishes
it and smoke-tests the result. Setting that up is a one-time pass through
[the deployment guide](specs/001-egyptian-grocery-ecommerce/quickstart.md#deployment) — ten
repository secrets and one variable, all set through the GitHub web interface. Creating the
first admin is a second workflow, run once from the Actions tab; no terminal is needed to get
the shop live.

Remaining, none of it blocking a launch: incremental listing loading (T112 — listings
paginate today), the image and bundle audits (T119–T120), a throttled Lighthouse run (T121),
the 360px RTL/LTR visual sweep (T122), localized error states (T123) and the accessibility
pass (T124). Each needs a deployed environment or a human eye.

```bash
npm install && npm run dev              # http://localhost:3000 → /ar
npm run cf:build && npx wrangler dev    # the real Workers bundle
supabase start && supabase db reset     # schema + seed
./scripts/run-sql-tests.sh              # pricing, orders, RLS, admin, lifecycle, reporting, search
./scripts/test-deploy-path.sh           # what `supabase db push` alone produces
./scripts/test-concurrency.sh           # two orders race for the last unit
./scripts/check-client-bundle.sh        # no service-role key in the browser
```

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, React 19), TypeScript 6 strict |
| Hosting | Cloudflare Workers via `@opennextjs/cloudflare` |
| Database / Auth / Storage | Supabase (Postgres 15, free tier) |
| i18n | `next-intl` — `ar` default with full RTL, `en` secondary |
| Styling | Tailwind CSS v4, logical properties only (enforced by lint) |
| Testing | Vitest (unit) · Playwright at 360px in Arabic and English |

## Documents

Planned with [GitHub Spec Kit](https://github.com/github/spec-kit). Read in this order:

| Document | What it covers |
|---|---|
| [Constitution](.specify/memory/constitution.md) | The seven non-negotiable principles governing every change |
| [Specification](specs/001-egyptian-grocery-ecommerce/spec.md) | 7 user stories, 85 functional requirements, 21 success criteria |
| [Research](specs/001-egyptian-grocery-ecommerce/research.md) | 20 technical decisions with rationale and rejected alternatives |
| [Data model](specs/001-egyptian-grocery-ecommerce/data-model.md) | 15 tables, RLS summary, state machine, report functions |
| [Plan](specs/001-egyptian-grocery-ecommerce/plan.md) | Architecture, structure, build order, risks |
| [Tasks](specs/001-egyptian-grocery-ecommerce/tasks.md) | 126 tasks across 7 phases |
| [Quickstart](specs/001-egyptian-grocery-ecommerce/quickstart.md) | Setup, verification, deployment |

Contracts: [RPC functions](specs/001-egyptian-grocery-ecommerce/contracts/rpc-contracts.md) ·
[RLS policies](specs/001-egyptian-grocery-ecommerce/contracts/rls-policies.md) ·
[Reporting](specs/001-egyptian-grocery-ecommerce/contracts/reporting-contracts.md) ·
[Routes and actions](specs/001-egyptian-grocery-ecommerce/contracts/routes-and-actions.md)

## The decisions that shape everything

1. **Orders have no `INSERT` policy for any role.** The only way an order comes into existence
   is `place_order()`, a `SECURITY DEFINER` function that recomputes every amount from stored
   data under row locks. The browser sends product IDs and quantities — nothing else. Prices
   cannot be tampered with because there is no path by which a client writes one.

2. **Cost prices live in a separate table with no grant to customers or staff.** A restricted
   column would depend on every query, forever, remembering to omit it. A table nobody has a
   grant on cannot leak.

3. **All money is integer piastres.** A one-piastre floating-point drift is a cash dispute at
   the door when the driver collects.

4. **Delivery pricing is data, not code.** The fee, the minimum order value and whether a
   governorate is served at all are three editable numbers per row in the admin console,
   changeable at any moment with no deployment. A change applies to the next cart priced; orders
   already placed keep the fee the customer was quoted, because the order stores its own copy.
   Every change writes the before and after to `admin_audit_log` with the name of whoever made
   it, so "when did the fee to Giza go up, and who raised it" always has an answer.

5. **Phone-only auth with no SMS and no email.** Numbers normalize to `+201XXXXXXXXX` and map
   to a synthetic internal identifier over Supabase Auth, keeping password hashing, JWTs and
   `auth.uid()` in RLS. The trade-off — no self-service password reset — is handled by a
   staff-mediated reset with an audit trail.

## Build order

| Stage | Delivers |
|---|---|
| 1. Foundation ✅ | Next.js on Workers, Supabase project, RTL shell, CI |
| 2. Data layer ✅ | 15 tables, RLS, pricing and order functions, tests |
| 3. Storefront ✅ | Register, browse, cart, checkout — **MVP, real orders** |
| 4. Admin ✅ | Products, categories, brands, promotions, governorates |
| 5. Order operations ✅ | Staff queue and transitions; customer tracking |
| 6. Reporting ✅ | Dashboard, sales/customer/promotion reports, CSV and Excel export |
| 7. Discovery 🎯 | Arabic/English search, offers, scheduled jobs, hardening |

Stage 2 precedes all UI because the correctness and isolation guarantees are database-resident.
Stages 3 and 4 can run in parallel. Stage 6 follows stage 5 because there is nothing to report
until orders run their full lifecycle.

## Confirmed decisions

| Question | Decision |
|---|---|
| Order flow | Customer creates the order → ops team sees it → confirms by phone → marks confirmed → through to delivered |
| Backups | **Free tier** plus the weekly export job (T117). Worst case is losing up to a week; revisit when order history becomes critical |
| SMS verification | **Not needed for v1** — phone plus password, staff-mediated password reset |
| Delivery coverage | **Cairo and Giza** at launch; all 27 governorates pre-loaded in the admin, activated with a fee and a minimum as coverage grows |
| Deferred | Delivery time slots, coupon codes, cross-device cart sync — all additive later |

## Known risk

The Supabase free tier provides **no backups**, and the business has chosen to launch on it. The
weekly export job (T117) is therefore the only recovery point, and is required rather than
optional. Point-in-time recovery would need the $25/month Pro tier.

It runs every Sunday at 05:00 UTC and writes newline-delimited JSON to the private `backups`
bucket, in an order that replays cleanly against foreign keys. One limitation is worth knowing
now rather than on the day it matters: **passwords are not in it and cannot be**. They live in
`auth.users` as hashes the API does not expose, so a restore recreates accounts without
credentials — which is what the staff-mediated reset exists for.

## Continuing the work

```bash
uvx --from git+https://github.com/github/spec-kit.git specify check
```

Spec Kit skills are installed in `.claude/skills/`. `/speckit-implement` executes
`tasks.md`; `/speckit-analyze` checks cross-artifact consistency first.
