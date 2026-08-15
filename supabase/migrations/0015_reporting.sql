-- 0015 — Reporting
--
-- Every figure in this file is derived at query time from `orders` and
-- `order_items`. Nothing is precomputed into a summary table, for the same
-- reason prices are not: a stored total has a window in which it is wrong, and
-- the owner reconciling against the bank has no way to tell which window they
-- are in (Constitution Principle I).
--
-- Three decisions run through all of it:
--
--   1. **Revenue is recognized at delivery, not at placement.** Payment is cash
--      handed to a driver. An order submitted on Monday and delivered on
--      Thursday is Thursday's money, and one that is cancelled is never money
--      at all (FR-072).
--   2. **Days are Cairo days.** `cairo_date()` is the single expression every
--      report buckets by, so no two reports can disagree about which day an
--      order fell on (FR-073).
--   3. **Cost, margin and profit are admin-only and refuse rather than return
--      nothing.** An empty result is indistinguishable from "no sales"; a
--      refusal is not (FR-078, SC-018).

-- ---------------------------------------------------------------------------
-- Indexes for the ranges reports actually scan (SC-019)
-- ---------------------------------------------------------------------------

-- Partial: only delivered orders carry a delivered_at, and they are the only
-- rows revenue reporting touches.
create index orders_delivered_at_idx on public.orders (delivered_at)
  where delivered_at is not null;

create index orders_placed_at_idx on public.orders (placed_at desc);

-- ---------------------------------------------------------------------------
-- cairo_date — the one place a timestamp becomes a day (FR-073, research R18)
--
-- STABLE rather than IMMUTABLE, and deliberately so: the conversion depends on
-- the time-zone database, which can change. Declaring it IMMUTABLE to make it
-- indexable would be a lie the planner acts on, and Egypt has both adopted and
-- abandoned summer time within the lifetime of this business.
-- ---------------------------------------------------------------------------
create or replace function public.cairo_date(p_at timestamptz)
returns date
language sql
stable
set search_path = public
as $$
  select (p_at at time zone 'Africa/Cairo')::date
$$;

comment on function public.cairo_date is
  'Egypt-local calendar day. Every report buckets by this so none can disagree about which day an order fell on.';

-- ---------------------------------------------------------------------------
-- Range helpers
--
-- A report range is given as two Cairo dates, inclusive at both ends. These
-- turn them into the half-open timestamp interval the indexes can use, so
-- "1 March to 31 March" includes an order delivered at 23:50 on the 31st.
-- ---------------------------------------------------------------------------
create or replace function public.cairo_range_start(p_from date)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (p_from::timestamp at time zone 'Africa/Cairo')
$$;

create or replace function public.cairo_range_end(p_to date)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select ((p_to + 1)::timestamp at time zone 'Africa/Cairo')
$$;

-- ---------------------------------------------------------------------------
-- Access
--
-- Every report below is SECURITY DEFINER and checks its own caller. Without
-- the check a customer calling a report would get a report of their own orders
-- — not a leak, but a nonsense, and one that would quietly become a leak the
-- day a policy is loosened. Refusing outright keeps the boundary legible.
-- ---------------------------------------------------------------------------
create or replace function public.require_staff_for_reports()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'not_authorized'
      using detail = 'reports are for staff', errcode = '42501';
  end if;
end $$;

create or replace function public.require_admin_for_reports()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized'
      using detail = 'cost, margin and profit are visible to administrators only',
            errcode = '42501';
  end if;
end $$;

-- ===========================================================================
-- Summary (FR-070, FR-071)
-- ===========================================================================
create or replace function public.report_summary(p_from date, p_to date)
returns table (
  orders_placed     bigint,
  orders_delivered  bigint,
  orders_cancelled  bigint,
  orders_returned   bigint,
  revenue           bigint,
  goods_revenue     bigint,
  delivery_fees     bigint,
  discounts_given   bigint,
  units_sold        bigint,
  avg_order_value   bigint,
  customers_served  bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_staff_for_reports();

  return query
  with placed as (
    select * from public.orders
    where placed_at >= public.cairo_range_start(p_from)
      and placed_at <  public.cairo_range_end(p_to)
  ),
  -- Delivered orders are bucketed by when they were *delivered*, which is when
  -- the cash was collected. The two sets overlap but are not the same, and
  -- conflating them is how a month's revenue ends up in the wrong month.
  delivered as (
    select * from public.orders
    where status = 'delivered'
      and delivered_at >= public.cairo_range_start(p_from)
      and delivered_at <  public.cairo_range_end(p_to)
  )
  select
    (select count(*) from placed),
    (select count(*) from delivered),
    (select count(*) from placed where status = 'cancelled'),
    (select count(*) from placed where status = 'returned'),
    coalesce((select sum(grand_total) from delivered), 0),
    coalesce((select sum(subtotal - discount_total) from delivered), 0),
    coalesce((select sum(delivery_fee) from delivered), 0),
    coalesce((select sum(discount_total) from delivered), 0),
    coalesce((select sum(oi.qty) from public.order_items oi
              join delivered d on d.id = oi.order_id), 0),
    -- Integer division, in piastres. An average that is a fraction of a
    -- piastre is not an amount anybody can collect.
    case when (select count(*) from delivered) = 0 then 0
         else coalesce((select sum(grand_total) from delivered), 0)
              / (select count(*) from delivered)
    end,
    (select count(distinct profile_id) from delivered);
end $$;

-- ===========================================================================
-- Sales (FR-074)
-- ===========================================================================
create or replace function public.report_sales_by_day(p_from date, p_to date)
returns table (
  day            date,
  orders         bigint,
  revenue        bigint,
  goods_revenue  bigint,
  delivery_fees  bigint,
  discounts      bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_staff_for_reports();

  return query
  select
    public.cairo_date(o.delivered_at) as day,
    count(*),
    sum(o.grand_total),
    sum(o.subtotal - o.discount_total),
    sum(o.delivery_fee),
    sum(o.discount_total)
  from public.orders o
  where o.status = 'delivered'
    and o.delivered_at >= public.cairo_range_start(p_from)
    and o.delivered_at <  public.cairo_range_end(p_to)
  group by 1
  order by 1;
end $$;

create or replace function public.report_sales_by_product(p_from date, p_to date)
returns table (
  product_id   uuid,
  name_ar      text,
  name_en      text,
  units_sold   bigint,
  revenue      bigint,
  order_count  bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_staff_for_reports();

  return query
  -- Grouped by the *snapshot* names on the order line, not the product's
  -- current name. A report of last March should read as March did.
  select
    oi.product_id,
    oi.product_name_ar,
    oi.product_name_en,
    sum(oi.qty)::bigint,
    sum(oi.line_total)::bigint,
    count(distinct oi.order_id)
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.status = 'delivered'
    and o.delivered_at >= public.cairo_range_start(p_from)
    and o.delivered_at <  public.cairo_range_end(p_to)
  group by oi.product_id, oi.product_name_ar, oi.product_name_en
  order by 5 desc;
end $$;

create or replace function public.report_sales_by_category(p_from date, p_to date)
returns table (
  category_id  uuid,
  name_ar      text,
  name_en      text,
  units_sold   bigint,
  revenue      bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_staff_for_reports();

  return query
  -- Categories are not snapshotted onto the order line, so this necessarily
  -- reads the product's current category. A product moved between categories
  -- moves its history with it, which is the behaviour the business wants when
  -- it asks "how is Dairy doing".
  select
    c.id,
    c.name_ar,
    c.name_en,
    sum(oi.qty)::bigint,
    sum(oi.line_total)::bigint
  from public.order_items oi
  join public.orders o   on o.id = oi.order_id
  join public.products p on p.id = oi.product_id
  join public.categories c on c.id = p.category_id
  where o.status = 'delivered'
    and o.delivered_at >= public.cairo_range_start(p_from)
    and o.delivered_at <  public.cairo_range_end(p_to)
  group by c.id, c.name_ar, c.name_en
  order by 5 desc;
end $$;

create or replace function public.report_sales_by_governorate(p_from date, p_to date)
returns table (
  governorate_id  uuid,
  name_ar         text,
  name_en         text,
  orders          bigint,
  revenue         bigint,
  delivery_fees   bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_staff_for_reports();

  return query
  -- The governorate name comes from the order's own snapshot, so a renamed or
  -- deactivated governorate still reads correctly in an old report.
  select
    o.governorate_id,
    o.governorate_name_ar,
    o.governorate_name_en,
    count(*),
    sum(o.grand_total),
    sum(o.delivery_fee)
  from public.orders o
  where o.status = 'delivered'
    and o.delivered_at >= public.cairo_range_start(p_from)
    and o.delivered_at <  public.cairo_range_end(p_to)
  group by o.governorate_id, o.governorate_name_ar, o.governorate_name_en
  order by 5 desc;
end $$;

-- ===========================================================================
-- Customers (FR-075)
-- ===========================================================================
create or replace function public.report_customers(p_from date, p_to date)
returns table (
  profile_id     uuid,
  full_name      text,
  phone          text,
  orders         bigint,
  revenue        bigint,
  first_order_at timestamptz,
  last_order_at  timestamptz,
  is_new         boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_staff_for_reports();

  return query
  with in_range as (
    select o.* from public.orders o
    where o.status = 'delivered'
      and o.delivered_at >= public.cairo_range_start(p_from)
      and o.delivered_at <  public.cairo_range_end(p_to)
  ),
  -- "New" means their first order ever falls inside the range — not their
  -- first order inside it. Someone who ordered last year and again this month
  -- is a returning customer, and counting them as new would flatter the number
  -- every month.
  first_ever as (
    select o.profile_id, min(o.placed_at) as first_at
    from public.orders o
    group by o.profile_id
  )
  select
    r.profile_id,
    p.full_name,
    p.phone,
    count(*),
    sum(r.grand_total),
    f.first_at,
    max(r.placed_at),
    f.first_at >= public.cairo_range_start(p_from)
      and f.first_at < public.cairo_range_end(p_to)
  from in_range r
  join public.profiles p on p.id = r.profile_id
  join first_ever f on f.profile_id = r.profile_id
  group by r.profile_id, p.full_name, p.phone, f.first_at
  order by 5 desc;
end $$;

-- ===========================================================================
-- Promotions (FR-076)
-- ===========================================================================
create or replace function public.report_promotions(p_from date, p_to date)
returns table (
  promotion_id     uuid,
  name_ar          text,
  name_en          text,
  orders           bigint,
  units_sold       bigint,
  discount_given   bigint,
  revenue          bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_staff_for_reports();

  return query
  -- Measured from the promotion recorded on the order line at placement, not
  -- from re-running today's pricing rules against old orders. What a customer
  -- was actually given is a fact; what they would be given now is a guess.
  select
    oi.promotion_id,
    pr.name_ar,
    pr.name_en,
    count(distinct oi.order_id),
    sum(oi.qty)::bigint,
    sum(oi.unit_discount * oi.qty)::bigint,
    sum(oi.line_total)::bigint
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join public.promotions pr on pr.id = oi.promotion_id
  where oi.promotion_id is not null
    and o.status = 'delivered'
    and o.delivered_at >= public.cairo_range_start(p_from)
    and o.delivered_at <  public.cairo_range_end(p_to)
  group by oi.promotion_id, pr.name_ar, pr.name_en
  order by 6 desc;
end $$;

-- ===========================================================================
-- Inventory (FR-077)
--
-- Note what is absent from the return type: no cost, and therefore no stock
-- valuation. Valuation is an admin question and lives with the margin
-- functions below, where the refusal is enforced (SC-018).
-- ===========================================================================
create or replace function public.report_low_stock(p_threshold integer default 10)
returns table (
  product_id   uuid,
  name_ar      text,
  name_en      text,
  sku          text,
  stock_qty    integer,
  min_order_qty integer,
  price        integer,
  is_active    boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_staff_for_reports();

  return query
  select p.id, p.name_ar, p.name_en, p.sku, p.stock_qty, p.min_order_qty, p.price, p.is_active
  from public.products p
  where p.stock_qty <= p_threshold
  order by p.stock_qty, p.name_ar;
end $$;

-- ===========================================================================
-- Margin and profit — administrators only (FR-078, research R20)
--
-- These raise for a staff member rather than returning an empty set. The
-- distinction is the whole guarantee: "no rows" reads as "we sold nothing",
-- and a report that lies quietly is worse than one that refuses loudly.
--
-- Both use the product's **current** cost, because that is the only cost the
-- system stores. The screens say so on their face — a cost that moved after a
-- sale makes the margin approximate, and an approximate number presented as
-- exact is how a business misprices a line.
-- ===========================================================================
create or replace function public.report_product_margin(p_from date, p_to date)
returns table (
  product_id    uuid,
  name_ar       text,
  name_en       text,
  units_sold    bigint,
  revenue       bigint,
  cost_total    bigint,
  margin        bigint,
  margin_pct    numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin_for_reports();

  return query
  select
    oi.product_id,
    oi.product_name_ar,
    oi.product_name_en,
    sum(oi.qty)::bigint,
    sum(oi.line_total)::bigint,
    coalesce(sum(pc.cost_price * oi.qty), 0)::bigint,
    (sum(oi.line_total) - coalesce(sum(pc.cost_price * oi.qty), 0))::bigint,
    case when sum(oi.line_total) = 0 then 0
         else round(
           (sum(oi.line_total) - coalesce(sum(pc.cost_price * oi.qty), 0))
           * 100.0 / sum(oi.line_total), 1)
    end
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  -- LEFT: a product with no cost recorded still appears, with its cost
  -- counted as zero and its margin therefore overstated. Dropping it would
  -- hide the sale entirely, which is worse — and the missing cost is itself
  -- something the owner should see.
  left join public.product_costs pc on pc.product_id = oi.product_id
  where o.status = 'delivered'
    and o.delivered_at >= public.cairo_range_start(p_from)
    and o.delivered_at <  public.cairo_range_end(p_to)
  group by oi.product_id, oi.product_name_ar, oi.product_name_en
  order by 7 desc;
end $$;

create or replace function public.report_profit_by_day(p_from date, p_to date)
returns table (
  day         date,
  revenue     bigint,
  cost_total  bigint,
  gross_profit bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin_for_reports();

  return query
  select
    public.cairo_date(o.delivered_at),
    sum(oi.line_total)::bigint,
    coalesce(sum(pc.cost_price * oi.qty), 0)::bigint,
    (sum(oi.line_total) - coalesce(sum(pc.cost_price * oi.qty), 0))::bigint
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.product_costs pc on pc.product_id = oi.product_id
  where o.status = 'delivered'
    and o.delivered_at >= public.cairo_range_start(p_from)
    and o.delivered_at <  public.cairo_range_end(p_to)
  group by 1
  order by 1;
end $$;

create or replace function public.report_stock_valuation()
returns table (
  products_counted bigint,
  units_in_stock   bigint,
  cost_value       bigint,
  retail_value     bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin_for_reports();

  return query
  select
    count(*)::bigint,
    coalesce(sum(p.stock_qty), 0)::bigint,
    coalesce(sum(pc.cost_price * p.stock_qty), 0)::bigint,
    coalesce(sum(p.price * p.stock_qty), 0)::bigint
  from public.products p
  left join public.product_costs pc on pc.product_id = p.id
  where p.is_active;
end $$;

-- ===========================================================================
-- Export audit (FR-085)
--
-- A downloaded spreadsheet leaves the system entirely. Once it is in an inbox
-- there is no recalling it, so the least the system can do is record that it
-- happened and who asked. Admin-readable; written only by the SECURITY DEFINER
-- function below; no update or delete policy for anyone.
-- ===========================================================================
create table public.report_exports (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid        not null references public.profiles (id),
  report_key   text        not null,
  format       text        not null,
  range_from   date,
  range_to     date,
  row_count    integer     not null default 0,
  created_at   timestamptz not null default now(),

  constraint report_exports_format check (format in ('csv', 'xlsx'))
);

create index report_exports_time_idx on public.report_exports (created_at desc);

alter table public.report_exports enable row level security;

grant select on public.report_exports to authenticated;

create policy report_exports_admin_read on public.report_exports
  for select to authenticated using (public.is_admin());

create or replace function public.log_report_export(
  p_report_key text,
  p_format     text,
  p_from       date,
  p_to         date,
  p_row_count  integer
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'not_authorized'
      using detail = 'only staff may export reports', errcode = '42501';
  end if;

  insert into public.report_exports
    (actor_id, report_key, format, range_from, range_to, row_count)
  values (auth.uid(), p_report_key, p_format, p_from, p_to, p_row_count);
end $$;

-- ---------------------------------------------------------------------------
-- Execute grants
--
-- Granted to `authenticated` because that is the only role a signed-in user
-- has; the functions themselves decide whether the caller is staff or an
-- admin. `anon` gets nothing at all.
-- ---------------------------------------------------------------------------
grant execute on function public.cairo_date(timestamptz)                to authenticated;
grant execute on function public.report_summary(date, date)             to authenticated;
grant execute on function public.report_sales_by_day(date, date)        to authenticated;
grant execute on function public.report_sales_by_product(date, date)    to authenticated;
grant execute on function public.report_sales_by_category(date, date)   to authenticated;
grant execute on function public.report_sales_by_governorate(date, date) to authenticated;
grant execute on function public.report_customers(date, date)           to authenticated;
grant execute on function public.report_promotions(date, date)          to authenticated;
grant execute on function public.report_low_stock(integer)              to authenticated;
grant execute on function public.report_product_margin(date, date)      to authenticated;
grant execute on function public.report_profit_by_day(date, date)       to authenticated;
grant execute on function public.report_stock_valuation()               to authenticated;
grant execute on function public.log_report_export(text, text, date, date, integer) to authenticated;
