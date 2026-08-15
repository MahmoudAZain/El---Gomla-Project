-- Reporting figures reconcile against the orders beneath them (T106, SC-017).
--
-- A report nobody can check is a rumour. Every assertion here recomputes the
-- figure independently from `orders` and `order_items` and demands the two
-- agree exactly — no tolerance, because these are integer piastres and a
-- tolerance would hide the very drift it is meant to catch.
--
-- Three things are being defended:
--
--   1. Revenue counts delivered orders and nothing else (FR-072).
--   2. A day is a Cairo day, at both of its edges (FR-073).
--   3. Every breakdown sums back to the same total the summary reports.

insert into auth.users (id, email) values
  ('c1000000-0000-4000-8000-00000000000a', '201000000051@phone.elgomala.local'),
  ('c1000000-0000-4000-8000-00000000000b', '201000000052@phone.elgomala.local'),
  ('c1000000-0000-4000-8000-00000000000c', '201000000053@phone.elgomala.local');

insert into public.profiles (id, full_name, phone, role) values
  ('c1000000-0000-4000-8000-00000000000a', 'عميل أ', '+201000000051', 'customer'),
  ('c1000000-0000-4000-8000-00000000000b', 'عميل ب', '+201000000052', 'customer'),
  ('c1000000-0000-4000-8000-00000000000c', 'موظف',   '+201000000053', 'staff');

insert into public.governorates (id, name_ar, name_en, delivery_fee, min_order_value, is_active) values
  ('c2000000-0000-4000-8000-00000000000a', 'محافظة أ', 'ReportTownA', 2000, 0, true),
  ('c2000000-0000-4000-8000-00000000000b', 'محافظة ب', 'ReportTownB', 3000, 0, true);

insert into public.addresses (id, profile_id, governorate_id, street_address, landmark) values
  ('c3000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-00000000000a',
   'c2000000-0000-4000-8000-00000000000a', 'شارع أ', 'جنب المخبز'),
  ('c3000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-00000000000b',
   'c2000000-0000-4000-8000-00000000000b', 'شارع ب', 'قدام المدرسة');

insert into public.categories (id, name_ar, name_en, slug) values
  ('c4000000-0000-4000-8000-00000000000a', 'قسم أ', 'ReportCatA', 'report-cat-a'),
  ('c4000000-0000-4000-8000-00000000000b', 'قسم ب', 'ReportCatB', 'report-cat-b');

insert into public.products (id, category_id, name_ar, name_en, slug, price, unit, sku, stock_qty) values
  ('c5000000-0000-4000-8000-00000000000a', 'c4000000-0000-4000-8000-00000000000a',
   'سلعة أ', 'Report Item A', 'report-item-a', 5000, 'piece', 'RPT-A', 500),
  ('c5000000-0000-4000-8000-00000000000b', 'c4000000-0000-4000-8000-00000000000b',
   'سلعة ب', 'Report Item B', 'report-item-b', 2500, 'piece', 'RPT-B', 500),
  -- Deliberately left at 3 units, to be found by the low-stock report.
  ('c5000000-0000-4000-8000-00000000000c', 'c4000000-0000-4000-8000-00000000000a',
   'سلعة ج', 'Report Item C', 'report-item-c', 1000, 'piece', 'RPT-C', 3);

insert into public.product_costs (product_id, cost_price) values
  ('c5000000-0000-4000-8000-00000000000a', 3000),
  ('c5000000-0000-4000-8000-00000000000b', 1500);

-- ---------------------------------------------------------------------------
-- Fixture: place orders through the real functions, then move their clocks.
--
-- `place_order` stamps placed_at as now() and `set_order_status` stamps
-- delivered_at the same way, neither of which is any use for testing a date
-- range. Both are therefore driven for real — so the transition rules, the
-- history and the stock decrements are all genuine — and the timestamps are
-- rewritten afterwards.
--
-- Afterwards is the operative word. The order reference is generated from a
-- counter over orders placed *today*, so moving placed_at backwards between
-- two placements would reset that counter and collide on the next reference.
-- Every order is placed first; the clocks move once, at the end.
-- ---------------------------------------------------------------------------
create or replace function public.seed_report_order(
  p_user uuid, p_address uuid, p_key text, p_items jsonb,
  p_final public.order_status
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user)::text, false);
  select (public.place_order(p_items, p_address, p_key) ->> 'order_id')::uuid into v_id;

  if p_final <> 'submitted' then
    perform set_config('request.jwt.claims',
      json_build_object('sub', 'c1000000-0000-4000-8000-00000000000c')::text, false);

    if p_final = 'cancelled' then
      perform public.set_order_status(v_id, 'cancelled');
    else
      perform public.set_order_status(v_id, 'confirmed');
      perform public.set_order_status(v_id, 'preparing');
      perform public.set_order_status(v_id, 'out_for_delivery');
      perform public.set_order_status(v_id, 'delivered');
      if p_final = 'returned' then
        perform public.set_order_status(v_id, 'returned');
      end if;
    end if;
  end if;

  return v_id;
end $$;

/**
 * Moves one seeded order's clocks.
 *
 * Both timestamps move, not just the delivery one. Order *counts* bucket by
 * placed_at while revenue buckets by delivered_at, and a fixture that set only
 * the latter would leave the two halves of the summary describing different
 * months — exactly the bug these assertions exist to catch.
 */
create or replace function public.set_report_clock(
  p_key text, p_placed timestamptz, p_delivered timestamptz default null
)
returns void
language sql security definer set search_path = public
as $$
  update public.orders
  set placed_at    = p_placed,
      delivered_at = case when p_delivered is null then delivered_at else p_delivered end
  where idempotency_key = p_key
$$;

-- Two delivered orders inside the range, on two different Cairo days.
select public.seed_report_order(
  'c1000000-0000-4000-8000-00000000000a', 'c3000000-0000-4000-8000-00000000000a', 'rpt-1',
  '[{"product_id":"c5000000-0000-4000-8000-00000000000a","qty":2},
    {"product_id":"c5000000-0000-4000-8000-00000000000b","qty":4}]'::jsonb,
  'delivered');

select public.seed_report_order(
  'c1000000-0000-4000-8000-00000000000b', 'c3000000-0000-4000-8000-00000000000b', 'rpt-2',
  '[{"product_id":"c5000000-0000-4000-8000-00000000000a","qty":1}]'::jsonb,
  'delivered');

-- One cancelled and one returned, both inside the range. Neither is revenue.
select public.seed_report_order(
  'c1000000-0000-4000-8000-00000000000a', 'c3000000-0000-4000-8000-00000000000a', 'rpt-cancelled',
  '[{"product_id":"c5000000-0000-4000-8000-00000000000a","qty":10}]'::jsonb,
  'cancelled');

select public.seed_report_order(
  'c1000000-0000-4000-8000-00000000000a', 'c3000000-0000-4000-8000-00000000000a', 'rpt-returned',
  '[{"product_id":"c5000000-0000-4000-8000-00000000000a","qty":20}]'::jsonb,
  'returned');

-- One delivered well outside the range.
select public.seed_report_order(
  'c1000000-0000-4000-8000-00000000000b', 'c3000000-0000-4000-8000-00000000000b', 'rpt-outside',
  '[{"product_id":"c5000000-0000-4000-8000-00000000000a","qty":7}]'::jsonb,
  'delivered');

select auth.reset_role();

-- Now the clocks, once every reference has been generated.
select public.set_report_clock('rpt-1',         '2025-01-08T12:00:00Z', '2025-01-10T12:00:00Z');
select public.set_report_clock('rpt-2',         '2025-01-09T12:00:00Z', '2025-01-11T12:00:00Z');
select public.set_report_clock('rpt-cancelled', '2025-01-12T09:00:00Z');
select public.set_report_clock('rpt-returned',  '2025-01-08T12:00:00Z', '2025-01-10T12:00:00Z');
select public.set_report_clock('rpt-outside',   '2024-11-03T12:00:00Z', '2024-11-05T12:00:00Z');

-- ===========================================================================
-- 1-6. The summary reconciles against the orders (SC-017)
-- ===========================================================================
select auth.login_as('c1000000-0000-4000-8000-00000000000c');  -- staff

select public.assert('reporting', '1 revenue equals the sum of delivered totals in range',
  (select revenue from public.report_summary('2025-01-01', '2025-01-31'))
  = (select coalesce(sum(grand_total), 0) from public.orders
     where status = 'delivered'
       and delivered_at >= public.cairo_range_start('2025-01-01')
       and delivered_at <  public.cairo_range_end('2025-01-31')));

select public.assert('reporting', '2 two orders were delivered in range',
  (select orders_delivered from public.report_summary('2025-01-01', '2025-01-31')) = 2);

-- A cancelled order is not revenue, and neither is a returned one. Both were
-- seeded inside the range precisely so their exclusion is proved, not assumed.
select public.assert('reporting', '3 a cancelled order contributes nothing to revenue',
  (select revenue from public.report_summary('2025-01-01', '2025-01-31'))
  = (select coalesce(sum(grand_total), 0) from public.orders
     where idempotency_key in ('rpt-1', 'rpt-2')));

select public.assert('reporting', '4 the cancelled order is counted as cancelled',
  (select orders_cancelled from public.report_summary('2025-01-01', '2025-01-31')) = 1);

select public.assert('reporting', '5 an order delivered outside the range is excluded',
  (select revenue from public.report_summary('2024-11-01', '2024-11-30'))
  = (select grand_total from public.orders where idempotency_key = 'rpt-outside'));

-- Revenue is goods plus delivery, less discount. If the three parts do not add
-- up to the whole, one of them is being counted twice or not at all.
select public.assert('reporting', '6 goods plus delivery reconciles to revenue',
  (select goods_revenue + delivery_fees from public.report_summary('2025-01-01', '2025-01-31'))
  = (select revenue from public.report_summary('2025-01-01', '2025-01-31')));

-- ===========================================================================
-- 7-11. Cairo days, at both edges (FR-073)
--
-- The offset is not hard-coded anywhere below. Each case is expressed relative
-- to the range helpers themselves, so the assertions stay true whether Egypt is
-- observing summer time or not — which it has both adopted and abandoned.
-- ===========================================================================
select auth.reset_role();

update public.orders set delivered_at = public.cairo_range_start('2025-01-10')
where idempotency_key = 'rpt-1';

-- The last instant that still belongs to the 11th.
update public.orders set delivered_at = public.cairo_range_end('2025-01-11') - interval '1 second'
where idempotency_key = 'rpt-2';

select auth.login_as('c1000000-0000-4000-8000-00000000000c');

select public.assert('reporting', '7 midnight Cairo belongs to the day it opens',
  (select public.cairo_date(delivered_at) from public.orders where idempotency_key = 'rpt-1')
  = '2025-01-10');

select public.assert('reporting', '8 one second before midnight belongs to the day it closes',
  (select public.cairo_date(delivered_at) from public.orders where idempotency_key = 'rpt-2')
  = '2025-01-11');

select public.assert('reporting', '9 both edge orders fall inside a range covering both days',
  (select orders_delivered from public.report_summary('2025-01-10', '2025-01-11')) = 2);

-- The tighter range is the real test: a half-open interval computed wrongly
-- would drag the 11th's order into the 10th, or drop it entirely.
select public.assert('reporting', '10 a single-day range catches only that day',
  (select orders_delivered from public.report_summary('2025-01-10', '2025-01-10')) = 1);

select public.assert('reporting', '11 the day before the range is excluded',
  (select orders_delivered from public.report_summary('2025-01-09', '2025-01-09')) = 0);

-- ===========================================================================
-- 12-17. Every breakdown sums back to the summary
--
-- This is the property that makes the dashboard trustworthy: whichever way the
-- owner slices the same range, they get the same total.
-- ===========================================================================
select public.assert('reporting', '12 sales by day sums to the summary revenue',
  (select coalesce(sum(revenue), 0) from public.report_sales_by_day('2025-01-01', '2025-01-31'))
  = (select revenue from public.report_summary('2025-01-01', '2025-01-31')));

select public.assert('reporting', '13 sales by governorate sums to the summary revenue',
  (select coalesce(sum(revenue), 0) from public.report_sales_by_governorate('2025-01-01', '2025-01-31'))
  = (select revenue from public.report_summary('2025-01-01', '2025-01-31')));

-- Product and category revenue exclude the delivery fee, so they sum to goods
-- rather than to the grand total. Conflating the two is the classic reporting
-- error — it inflates product performance by whatever delivery costs.
select public.assert('reporting', '14 sales by product sums to goods revenue',
  (select coalesce(sum(revenue), 0) from public.report_sales_by_product('2025-01-01', '2025-01-31'))
  = (select goods_revenue from public.report_summary('2025-01-01', '2025-01-31')));

select public.assert('reporting', '15 sales by category sums to the same goods revenue',
  (select coalesce(sum(revenue), 0) from public.report_sales_by_category('2025-01-01', '2025-01-31'))
  = (select coalesce(sum(revenue), 0) from public.report_sales_by_product('2025-01-01', '2025-01-31')));

select public.assert('reporting', '16 units sold agrees between summary and product breakdown',
  (select units_sold from public.report_summary('2025-01-01', '2025-01-31'))
  = (select coalesce(sum(units_sold), 0) from public.report_sales_by_product('2025-01-01', '2025-01-31')));

select public.assert('reporting', '17 two governorates are represented',
  (select count(*) from public.report_sales_by_governorate('2025-01-01', '2025-01-31')) = 2);

-- ===========================================================================
-- 18-21. Customers and inventory
-- ===========================================================================
select public.assert('reporting', '18 both customers appear',
  (select count(*) from public.report_customers('2025-01-01', '2025-01-31')) = 2);

select public.assert('reporting', '19 customer revenue sums to the summary revenue',
  (select coalesce(sum(revenue), 0) from public.report_customers('2025-01-01', '2025-01-31'))
  = (select revenue from public.report_summary('2025-01-01', '2025-01-31')));

select public.assert('reporting', '20 the summary counts distinct customers served',
  (select customers_served from public.report_summary('2025-01-01', '2025-01-31')) = 2);

select public.assert('reporting', '21 low stock finds the product with three left',
  (select count(*) from public.report_low_stock(5)
   where product_id = 'c5000000-0000-4000-8000-00000000000c') = 1);

-- ===========================================================================
-- 22-25. An empty range is zero, not null
--
-- A null propagating into the dashboard renders as a blank tile, which reads as
-- "broken" rather than "no sales". Every aggregate is coalesced for that reason.
-- ===========================================================================
select public.assert('reporting', '22 an empty range reports zero revenue, not null',
  (select revenue from public.report_summary('2020-01-01', '2020-01-31')) = 0);

select public.assert('reporting', '23 an empty range reports zero orders',
  (select orders_delivered from public.report_summary('2020-01-01', '2020-01-31')) = 0);

select public.assert('reporting', '24 an empty range averages zero rather than dividing by zero',
  (select avg_order_value from public.report_summary('2020-01-01', '2020-01-31')) = 0);

select public.assert('reporting', '25 an empty range returns no breakdown rows',
  (select count(*) from public.report_sales_by_day('2020-01-01', '2020-01-31')) = 0);

select auth.reset_role();
