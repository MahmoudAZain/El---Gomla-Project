---
description: "Task list for Egyptian Grocery E-Commerce Platform"
---

# Tasks: Egyptian Grocery E-Commerce Platform

**Input**: Design documents from `specs/001-egyptian-grocery-ecommerce/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Included for the four areas the constitution names as money-or-data critical —
pricing, order placement, status transitions, and RLS isolation — plus report accuracy and
margin isolation, and an end-to-end journey. Broad presentational unit tests are deliberately
not mandated.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on another incomplete task
- **[Story]**: The user story this serves (US1–US7), or blank for shared infrastructure

## Path Conventions

Single Next.js application at the repository root, with SQL under `supabase/`. Paths follow the
structure in [plan.md](plan.md#source-code-repository-root).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: A deployable, Arabic-first RTL shell on Cloudflare with a working local database.

- [x] T001 Initialize the Next.js 15 App Router project with TypeScript strict mode at the
      repository root (`package.json`, `tsconfig.json`, `next.config.ts`)
- [x] T002 Add and configure `@opennextjs/cloudflare`: `open-next.config.ts`, `wrangler.jsonc`
      with `nodejs_compat`, and the `build` / `deploy` / `preview` scripts (research R1)
- [x] T003 [P] Configure Tailwind CSS v4 in `src/app/globals.css` with the Arabic/Latin font
      stack and design tokens; set the base 44px touch-target sizing (Principle IV)
- [x] T004 [P] Add the ESLint rule banning physical `left`/`right` Tailwind utilities in favour
      of logical properties, in `eslint.config.mjs` (Principle III)
- [x] T005 [P] Configure Vitest and Playwright with a 360px mobile project in
      `vitest.config.ts` and `playwright.config.ts`
- [x] T006 Initialize the local Supabase stack (`supabase/config.toml`) and the `db:reset` /
      `gen:types` npm scripts
- [x] T007 [P] Add `.env.example` and `src/lib/env.ts` validating environment variables at
      startup with Zod
- [x] T008 Set up `next-intl`: `src/i18n/routing.ts` with locales `['ar','en']` defaulting to
      `ar`, and `src/middleware.ts` resolving the locale from cookie then `Accept-Language`
      (FR-001, FR-004)
- [x] T009 Create `src/app/[locale]/layout.tsx` setting `lang` and `dir` server-side so there is
      no flash of wrong direction (FR-002)
- [x] T010 [P] Create the message dictionaries `src/i18n/messages/ar.json` and `en.json` with
      the shared navigation, action and error keys
- [x] T011 [P] Build the language switcher component preserving the current pathname
      (`src/components/ui/LocaleSwitcher.tsx`, FR-003)
- [x] T012 [P] Add the GitHub Actions CI workflow running typecheck, lint and unit tests

**Checkpoint**: ✅ **Complete.** An Arabic right-to-left page renders at 360px, verified against
`wrangler dev` running the real Workers bundle. Typecheck, lint, unit tests and `npm audit` are
all clean, and 6 Playwright assertions cover direction, overflow, language switching and touch
targets.

---

## Phase 2: Foundational — Data Layer (Blocking Prerequisites)

**Purpose**: The entire correctness and security model. Nothing user-facing can be trusted
before this phase passes its tests.

**⚠️ CRITICAL**: No user story work may begin until this phase is complete and its tests pass.

### Schema

- [x] T013 Migration `0001_extensions_and_enums.sql`: enable `pgcrypto` and `pg_trgm`; create
      the `user_role`, `unit_type`, `storage_type`, `discount_type` and `order_status` enums
- [x] T014 Migration `0002_profiles_and_auth.sql`: `profiles` table with the Egyptian phone
      CHECK and unique constraint, the `handle_new_user` signup trigger, and the
      `guard_profile_privileged_columns` trigger blocking self-promotion to admin
- [x] T015 Migration `0003_governorates_and_addresses.sql`: `governorates` and `addresses`, with `landmark`
      `NOT NULL` and the partial unique index for one default address per customer
- [x] T016 Migration `0004_catalog.sql`: `categories` (self-referencing, cycle-guard trigger,
      depth cap 3), `brands`, `products` with every FR-051 attribute, and `product_photos` with
      the primary-photo and 4-photo constraints
- [x] T017 Migration `0005_product_costs.sql`: the isolated `product_costs` table — separate
      from `products` by design (research R8, FR-063)
- [x] T018 Migration `0006_promotions_and_pricing.sql`: `promotions` with the single-scope check
      constraint, plus `effective_price()` and the `product_pricing` view (FR-027–FR-029)
- [x] T019 Migration `0007_orders.sql`: `orders` with the address snapshot and the
      `grand_total = subtotal - discount_total + delivery_fee` check; `order_items` with its
      line-total check; `order_status_history`; `login_attempts`; `admin_audit_log`

### Functions

- [x] T020 Migration `0008_order_functions.sql` part 1: `normalize_phone()` and
      `search_normalize()` — Arabic diacritic stripping and orthographic folding (research R10)
- [x] T021 Migration `0008` part 2: `price_cart(p_items jsonb, p_governorate_id uuid)` returning lines,
      totals, fee and blocking issues (contract in
      [contracts/rpc-contracts.md](contracts/rpc-contracts.md))
- [x] T022 Migration `0008` part 3: `place_order(...)` — `SECURITY DEFINER`, ordered
      `FOR UPDATE` locks, full revalidation, price snapshot, stock decrement, initial history
      row, idempotency key (FR-025, FR-037, FR-038, FR-043)
- [x] T023 Migration `0008` part 4: `set_order_status(...)` with the transition table, role
      authorization, row lock, and history append (FR-045–FR-050)
- [x] T024 Migration `0008` part 5: `generate_order_reference()` producing `EG-YYMMDD-NNNN`
      (FR-039, research R14)

### Security

- [x] T025 Migration `0009_rls_policies.sql` part 1: `current_role_name()`, `is_staff()` and
      `is_admin()` — all `SECURITY DEFINER STABLE` with `SET search_path = public`
- [x] T026 Migration `0009` part 2: revoke baseline grants; enable RLS on all 15 tables; write
      every policy from [contracts/rls-policies.md](contracts/rls-policies.md). **No INSERT or
      UPDATE policy on `orders`; no write policy of any kind on `order_status_history`**
- [x] T027 Migration `0010_search.sql`: the `products.search_text` generated column and its GIN
      trigram index (FR-019)
- [x] T028 Migration `0011_storage_buckets.sql`: the `product-images` bucket with public read
      and admin-write storage policies

### Seed and types

- [x] T029 [P] `supabase/seed.sql`: **all 27 Egyptian governorates** bilingually, with Cairo and
      Giza active and carrying real fees and minimums and the other 25 inactive awaiting
      activation (FR-056a); the bilingual grocery category tree; starter Egyptian brands; and the
      bootstrap admin account
- [x] T030 [P] Generate `src/types/database.ts` from the schema and wire `npm run gen:types`
- [x] T031 [P] Supabase clients: `src/lib/supabase/server.ts`, `client.ts`, and `service.ts`
      carrying the `server-only` guard so the service key cannot enter a client bundle (FR-066)

### Tests for the data layer ⚠️

> Write these before moving on. They are the evidence that Principles I, II and VII hold.

- [x] T032 [P] `supabase/tests/pricing.test.sql` — every case in the `effective_price` contract
      table: windows, overlap resolution, percentage rounding, zero clamping, ancestor scope
- [x] T033 [P] `supabase/tests/place_order.test.sql` — happy path, crafted client prices
      ignored, stock exhaustion, minimum quantity, governorate minimum, idempotent replay, atomic
      rollback (SC-005, SC-006)
- [x] T034 [P] `supabase/tests/transitions.test.sql` — table-driven over every legal and illegal
      transition, plus the customer-cancel authorization boundary (SC-011)
- [x] T035 [P] `supabase/tests/rls.test.sql` — assertions 1–20 of the verification matrix,
      run under real customer, staff and admin JWTs (SC-007, SC-008)
- [x] T036 `tests/integration/concurrent-order.test.ts` — two simultaneous orders for the last
      unit; exactly one succeeds, stock never negative (SC-016)

**Checkpoint**: ✅ **Complete.** 103 SQL assertions pass across four suites, plus a concurrency
test proving exactly one order wins the last unit. `place_order` produces correct orders and no
client role can write a price or read a cost — verified under real `anon`, `authenticated`
customer, staff and admin roles, never as the owner. User story work may now begin.

---

## Phase 3: User Story 1 & 2 — Shop and Order (Priority: P1) 🎯 MVP

**Goal**: A customer registers, browses, adds to a cart, and places a cash-on-delivery order.

**Independent Test**: With the seeded catalog, a new customer completes registration →
browse → cart → order on a 360px viewport, and the resulting order carries server-computed
totals.

### Shared primitives

- [x] T037 [P] `src/lib/phone.ts` — Egyptian normalization mirroring the SQL `normalize_phone`,
      with unit tests over all accepted notations (FR-009)
- [x] T038 [P] `src/lib/money.ts` — piastre formatting via `Intl.NumberFormat` for `ar-EG` and
      `en-EG`. **Formatting only; no arithmetic on the client** (research R5)
- [x] T039 [P] `src/lib/validation/` — Zod schemas shared between client and server, per the
      validation contract table
- [x] T040 [P] `src/components/ui/` — Button, Input, Select, Sheet, Dialog, QtyStepper with
      44px targets and logical properties throughout

### Authentication (US2)

- [x] T041 [US2] `src/lib/actions/auth.ts` → `registerCustomer`: normalize, validate, create the
      Auth user with the synthetic identifier, insert profile and default address, compensating
      delete on partial failure (FR-007, FR-008, FR-011, research R2)
- [x] T042 [US2] `loginCustomer` in the same module: rate-limit check, sign-in, attempt
      recording, identical failure message for unknown number and wrong password (FR-012, FR-014)
- [x] T043 [US2] `logout` action and session helpers
- [x] T044 [P] [US2] `src/app/[locale]/register/page.tsx` — full name, phone, governorate, address,
      **required landmark**, password (FR-007)
- [x] T045 [P] [US2] `src/app/[locale]/login/page.tsx` — phone and password
- [ ] T046 [US2] `src/app/[locale]/account/` — profile and address management, add/edit/delete
      and set-default (FR-015)
- [x] T047 [US2] `tests/integration/auth.test.ts` — notation equivalence, duplicate refusal,
      rate limiting, blank-landmark rejection

### Catalog browsing (US1)

- [x] T048 [P] [US1] `src/components/catalog/ProductCard.tsx` — image, bilingual name, unit,
      pack size, price
- [x] T049 [P] [US1] `src/components/catalog/PriceTag.tsx` — original struck through beside the
      reduced price when discounted (FR-021, Story 1 scenario 2)
- [x] T050 [P] [US1] `src/components/catalog/CategoryNav.tsx` — nested category navigation
- [x] T051 [US1] `src/app/[locale]/page.tsx` — home: categories and promoted products
- [x] T052 [US1] `src/app/[locale]/c/[...slug]/page.tsx` — category listing joined to
      `product_pricing`, paginated (FR-017, FR-018, FR-023)
- [x] T053 [US1] `src/app/[locale]/p/[slug]/page.tsx` — product detail: photo gallery, both
      languages with cross-language fallback for optional descriptions, out-of-stock state
      (FR-021, FR-022)

### Cart and checkout (US1)

- [x] T054 [US1] `src/lib/cart-store.ts` — `localStorage` holding `{product_id, qty}` **only**,
      never prices (research R11, FR-024)
- [x] T055 [US1] `src/lib/actions/cart.ts` → `previewCart` calling `price_cart` (FR-025)
- [x] T056 [US1] `src/components/cart/CartSheet.tsx` and `CartSummary.tsx` — every displayed
      amount comes from the server
- [x] T057 [US1] `src/app/[locale]/cart/page.tsx` — quantities, removal, per-line issue
      messages, governorate selector updating the fee (Story 1 scenario 4)
- [x] T058 [US1] `src/app/[locale]/checkout/page.tsx` — address selection, final server totals,
      minimum-order shortfall message, idempotency key generated on mount (FR-030, FR-031)
- [x] T059 [US1] `src/lib/actions/orders.ts` → `placeOrder` calling `place_order`, sending only
      identifiers and quantities, mapping every typed error to a localized message
- [x] T060 [US1] Change-notice UI: surface any price, discount, fee or availability difference
      since the cart was built, before commitment (FR-035, Story 1 edge cases)
- [x] T061 [US1] Order confirmation screen — reference, lines, fee, grand total, and an explicit
      cash-on-delivery statement (FR-042, Story 1 scenario 9)
- [x] T062 [US1] `tests/e2e/order-journey.spec.ts` — Playwright, Arabic, 360px: register →
      browse → cart → order, asserting no horizontal overflow and cart survival across a
      language switch (SC-001, SC-012, SC-013)

**Checkpoint**: 🎯 **MVP surface built.** Register, browse, add to cart, check out and see the
order confirmation — every screen present, every server action calling the pricing and order
functions verified in Stage 2. Ready for a live Supabase environment to run the end-to-end journey
against. T046 (account/address management) is intentionally deferred — the placement path uses the
first address created at registration.

---

## Phase 4: User Story 3 — Admin Master Data (Priority: P1)

**Goal**: Staff run the catalog, promotions and delivery governorates without touching code.

**Independent Test**: A staff account creates a category, a brand and a product with both
languages and photos, and the product appears on the storefront.

*May proceed in parallel with Phase 3 once Phase 2 is complete — the routes are disjoint.*

- [x] T063 [US3] `src/app/[locale]/admin/layout.tsx` — staff gate plus per-request re-check.
      Convenience only; RLS remains the boundary (FR-064, FR-065)
- [x] T064 [P] [US3] `src/components/admin/DataTable.tsx` — sortable, filterable, mobile-usable
- [x] T065 [P] [US3] `src/components/admin/BilingualField.tsx` — paired Arabic/English input
      that refuses to submit with either side blank (FR-057)
- [x] T066 [US3] `src/lib/image-resize.ts` — browser canvas resize to 1200px WebP plus a 400px
      thumbnail, before upload (research R12, FR-068)
- [x] T067 [US3] `src/components/admin/ImageUploader.tsx` — multi-upload, drag-reorder, set
      primary, delete (FR-054)
- [x] T068 [US3] `src/lib/actions/admin/products.ts` — create and update covering every FR-051
      attribute, refusing a missing name in either language
- [x] T069 [US3] `src/app/[locale]/admin/products/` — list, create and edit forms
- [x] T070 [US3] Cost-price field on the product form, admin-only, writing `product_costs`
      (FR-059, FR-060)
- [x] T071 [P] [US3] `src/app/[locale]/admin/categories/` — tree management, reorder, activate
      (FR-053)
- [x] T072 [P] [US3] `src/app/[locale]/admin/brands/` — brand management (FR-053)
- [x] T073 [P] [US3] `src/app/[locale]/admin/promotions/` — discount type, value, date range,
      scope selection (FR-055)
- [x] T074 [P] [US3] `src/app/[locale]/admin/governorates/` — the full list of 27 with fee,
      minimum order value and an activate toggle; inactive ones visually distinct so staff can see
      at a glance where delivery runs (FR-056, FR-056a)
- [x] T075 [US3] `src/app/[locale]/admin/staff/` — staff accounts, role assignment, and the
      staff-mediated password reset writing `admin_audit_log` (FR-016, FR-060)
- [x] T076 [US3] Deactivate-instead-of-delete behaviour across all admin entities, with a clear
      message when a record is referenced by an order (FR-061)
- [x] T077 [US3] `tests/integration/admin-authz.test.ts` — a customer and a staff member each
      denied on admin-only routes and on `product_costs`

**Checkpoint**: Staff run the catalog end to end without a developer.

---

## Phase 5: User Stories 4 & 5 — Order Operations (Priority: P2)

**Goal**: Staff move orders through the lifecycle with a full audit trail; customers follow
their own orders and cancel before confirmation.

**Independent Test**: An order runs submitted → delivered with every transition logged; a
customer cancels while submitted but is refused once confirmed.

*Depends on Phases 3 and 4.*

### Staff (US4)

- [x] T078 [US4] `src/lib/actions/orders.ts` → `transitionOrder` calling `set_order_status`,
      mapping typed errors to localized messages
- [x] T079 [US4] `src/app/[locale]/admin/orders/page.tsx` — queue with filters by state, governorate
      and date, and search by reference or customer phone (FR-058)
- [x] T080 [US4] `src/app/[locale]/admin/orders/[id]/page.tsx` — detail with lines, the delivery
      address **including landmark**, transition controls offering only legal next states, and a
      note field (FR-049)
- [x] T081 [P] [US4] `src/components/orders/StatusTimeline.tsx` — history with actor, note and
      timestamp, rendering in both directions
- [x] T082 [US4] `src/app/[locale]/admin/page.tsx` — dashboard with order counts by state

### Customer (US5)

- [x] T083 [P] [US5] `src/app/[locale]/orders/page.tsx` — own order history, newest first
      (FR-062)
- [x] T084 [US5] `src/app/[locale]/orders/[reference]/page.tsx` — detail with the status
      timeline, and a cancel control shown only while `submitted` (FR-048)
- [x] T085 [US5] `cancelMyOrder` action, plus handling for the case where staff confirmed
      first — "this order has already moved on" (FR-050)
- [x] T086 [US5] `tests/integration/order-lifecycle.test.ts` — full lifecycle, customer cancel
      allowed then refused, cross-customer access denied (SC-010, SC-011)

**Checkpoint**: The operation runs end to end with an audit trail that no one can edit.

---

## Phase 6: User Story 7 — Reporting & Dashboard (Priority: P2)

**Goal**: The owner reads the business's numbers and downloads them as a spreadsheet; ordinary
staff see operations without ever seeing margin.

**Independent Test**: Over a seeded period of orders across several statuses, governorates and
products, every dashboard figure reconciles exactly against the underlying orders, and a
downloaded file opens in Excel with Arabic rendering correctly.

*Depends on Phase 5 — there is nothing to report until orders run their full lifecycle and
`delivered_at` is being set.*

### Data layer

- [x] T087 Migration `0012_reporting.sql` part 1: add `orders.delivered_at` and
      `orders.cancelled_at`, set inside `set_order_status` in the same transaction as the history
      row so they cannot drift from the status (FR-072)
- [x] T088 Migration `0012` part 2: the reporting indexes on `orders(delivered_at)`,
      `orders(placed_at)`, `orders(governorate_id, placed_at)` and `order_items(product_id)` (SC-019)
- [x] T089 Migration `0012` part 3: `cairo_date(ts)` — the single shared Egypt-local bucketing
      expression every report uses (FR-073, research R18)
- [x] T090 [P] Migration `0012` part 4: `report_summary`, `report_sales_by_day`,
      `report_sales_by_product`, `report_sales_by_category`, `report_sales_by_governorate` (FR-071,
      FR-074)
- [x] T091 [P] Migration `0012` part 5: `report_customers`, `report_promotions`,
      `report_low_stock` (FR-075, FR-076, FR-077)
- [x] T092 Migration `0012` part 6: the **admin-only** `report_product_margin` and
      `report_profit_by_day`, each guarding with `is_admin()` and **raising** rather than
      returning empty (FR-078, research R20)
- [x] T093 Migration `0012` part 7: the `report_exports` audit table with RLS — admin read,
      inserts from `SECURITY DEFINER` only, no updates or deletes (FR-085)

### Dashboard and reports

- [x] T094 [US7] `src/app/[locale]/admin/page.tsx` — dashboard: summary tiles, sales trend,
      top products, low stock, shared date-range control (FR-070)
- [x] T095 [P] [US7] `src/components/admin/DateRangePicker.tsx` with Cairo-local presets —
      today, this week, this month, last month, custom (FR-073)
- [x] T096 [P] [US7] `src/components/admin/StatTile.tsx` and `SalesChart.tsx` — legible in both
      directions and at 360px
- [x] T097 [US7] `src/app/[locale]/admin/reports/sales/page.tsx` — by day, product, category
      and governorate (FR-074)
- [x] T098 [P] [US7] `src/app/[locale]/admin/reports/customers/page.tsx` — new, returning, top
      customers (FR-075)
- [x] T099 [P] [US7] `src/app/[locale]/admin/reports/promotions/page.tsx` — promotion
      performance from the promotion recorded at placement (FR-076)
- [x] T100 [P] [US7] `src/app/[locale]/admin/reports/inventory/page.tsx` — low stock, with
      stock valuation admin-only (FR-077)
- [x] T101 [US7] `src/app/[locale]/admin/reports/profit/page.tsx` — **admin only**, absent from
      the staff navigation, stating on its face that margin uses current cost (FR-078)

### Export

- [x] T102 [US7] `src/lib/reports/csv.ts` — RFC 4180 writer emitting **UTF-8 with a BOM**, with
      the formula-injection guard on values starting `=`, `+`, `-`, `@`, and piastres rendered as
      decimal EGP (FR-079, FR-080, research R19)
- [x] T103 [US7] `src/app/api/reports/[key]/export/route.ts` — role check, calls the same
      function the screen calls, empty-range marker, `report_exports` audit row, streamed
      attachment (FR-081, FR-083, FR-085)
- [x] T104 [US7] `src/lib/reports/xlsx.ts` — browser-side workbook generation via dynamic import
      on the reports route only, with real number formats and RTL sheet direction; never imported
      by a storefront route (FR-079, research R19)
- [x] T105 [P] [US7] Localized report labels and bilingual export headers in `ar.json` / `en.json`

### Tests ⚠️

- [x] T106 [P] [US7] `supabase/tests/reporting.test.sql` — figures reconcile exactly against
      the underlying orders; cancelled and returned excluded from revenue; an order delivered at
      00:10 and one at 23:50 Cairo land on the correct days; a range spanning a summer-time
      transition stays correct (SC-017, FR-072, FR-073)
- [x] T107 [P] [US7] `supabase/tests/reporting-authz.test.sql` — staff calling
      `report_product_margin` raises `not_authorized`; no staff-visible function has a cost,
      margin or profit column in its return type (SC-018)
- [x] T108 [US7] `tests/integration/report-export.test.ts` — export matches the screen for the
      same range; CSV begins `EF BB BF` and Arabic survives a round trip; a product named
      `=SUM(A1:A9)` is written escaped; an empty range returns the marker; 5,000 rows complete
      (FR-081, FR-084, SC-020)

**Checkpoint**: The owner can answer "what did we sell last month, and which products led" in
under a minute, and hand the accountant a spreadsheet.

---

## Phase 7: User Story 6 & Hardening (Priority: P3)

**Goal**: Discovery, performance, and the operational jobs the free tier requires.

### Search and offers (US6)

- [x] T109 [P] [US6] `src/components/catalog/SearchBox.tsx` with debounced input
- [x] T110 [US6] `src/app/[locale]/search/page.tsx` — trigram search over the normalized column,
      with an empty-state offering a route back to category browsing (FR-019)
- [x] T111 [P] [US6] `src/app/[locale]/offers/page.tsx` — all currently discounted products
      (FR-020)
- [ ] T112 [US6] Incremental loading for listings that preserves scroll position (FR-023)
- [x] T113 [US6] `tests/integration/search.test.ts` — the same product found by its Arabic and
      English names, and found despite diacritics and alef/ta-marbuta variants (SC-004)

### Operations

- [x] T114 [P] `src/app/api/cron/keepalive/route.ts` plus the 6-hourly `wrangler.jsonc` trigger,
      preventing free-tier pausing (FR-069)
- [x] T115 [P] Daily `login_attempts` sweep, bounding the table
- [x] T116 [P] Weekly orphan-image sweep reclaiming unreferenced storage objects
- [x] T117 **Weekly data export job** — the free tier has no backups, so this is the only
      recovery point (research R13; flagged as a risk in [plan.md](plan.md#risks-and-mitigations))
- [x] T118 [P] Storage-usage monitoring with a warning at 700 MB of the 1 GB ceiling

### Performance and polish

- [ ] T119 [P] Image loading pass: explicit dimensions, `sizes` matched to the mobile grid,
      lazy loading below the fold (Principle IV)
- [ ] T120 [P] Bundle audit against the 150 KB compressed budget for storefront routes
- [ ] T121 Lighthouse mobile run throttled to 3G, verifying SC-003 on the category listing
- [ ] T122 [P] RTL and LTR visual review of every route at 360px, asserting no horizontal
      overflow (SC-012)
- [ ] T123 [P] Localized error and empty states across all flows, both languages
- [ ] T124 [P] Accessibility pass — focus order under RTL, labels, and contrast
- [x] T125 Verify `SUPABASE_SERVICE_ROLE_KEY` is absent from the built client bundle (FR-066)
- [ ] T126 Complete the post-deploy checklist in [quickstart.md](quickstart.md#post-deploy-checklist)

**Checkpoint**: Ready for production traffic.

---

## Dependencies & Execution Order

```
Phase 1 (Setup)
    ↓
Phase 2 (Data layer)  ← BLOCKS EVERYTHING; must pass T032–T036
    ↓
    ├──► Phase 3 (US1+US2 — MVP) ──┐
    │                              ├──► Phase 5 (US4+US5) ──► Phase 6 (US7 — Reporting)
    └──► Phase 4 (US3 — Admin) ────┘                                  ↓
                                                              Phase 7 (US6 + hardening)
```

Phase 6 sits after Phase 5 because reporting reports on what Phase 5 produces — `delivered_at`
is only meaningful once staff are marking orders delivered, and revenue is defined as delivered
orders. Phase 7 depends only on Phase 3 and may overtake Phase 6 if search becomes urgent.

**Parallel opportunities**

- Phase 1: T003, T004, T005, T007, T010, T011, T012 are independent.
- Phase 2: migrations T013–T019 are strictly ordered; tests T032–T035 are independent of each
  other and can be written concurrently once their targets exist.
- Phases 3 and 4 may run concurrently on separate tracks after Phase 2 — they share only the
  primitives in T037–T040, which should land first.
- Phase 6: report functions T090 and T091 are independent of each other; report pages T095–T100
  are independent once the date-range control lands.
- Phase 7: nearly every task is independent.

**Critical path to first revenue**: T001 → T002 → T006 → T008 → T009 → T013–T031 → T032–T036 →
T037–T040 → T041–T047 → T048–T062. Everything else can follow.

## Task Summary

| Phase | Tasks | Stories | Delivers |
|---|---|---|---|
| 1 — Setup | T001–T012 (12) | — | Deployable RTL shell |
| 2 — Data layer | T013–T036 (24) | — | Provably correct schema, functions, RLS |
| 3 — Storefront | T037–T062 (26) | US1, US2 | 🎯 MVP — real orders |
| 4 — Admin | T063–T077 (15) | US3 | Staff-run catalog |
| 5 — Operations | T078–T086 (9) | US4, US5 | Lifecycle + tracking |
| 6 — Reporting | T087–T108 (22) | US7 | Dashboard, reports, CSV/Excel export |
| 7 — Discovery | T109–T126 (18) | US6 | Search, jobs, hardening |
| **Total** | **126** | | |

## Independent Test Criteria

Each story is verifiable on its own, which is what makes the phases genuinely separable:

- **US1** — seeded catalog, no admin UI: browse → cart → order with correct server totals.
- **US2** — no catalog: register, sign out, sign in, see own profile and address.
- **US3** — no customers: create a category, brand and product; confirm it reaches the
  storefront.
- **US4** — one submitted order: advance through every state; confirm the history.
- **US5** — two customers with orders: each sees only their own; cancel allowed while
  submitted, refused once confirmed.
- **US6** — seeded catalog: the same product found by Arabic and English terms; offers view
  lists exactly the active discounts.
- **US7** — a seeded period of orders: every dashboard figure reconciles against the orders
  behind it; a staff export contains no margin column; an admin export does; the CSV opens in
  Excel with Arabic intact.
