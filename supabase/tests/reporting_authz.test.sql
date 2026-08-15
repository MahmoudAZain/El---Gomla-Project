-- Who may read which numbers (T107, SC-018, FR-078).
--
-- The business's rule is short: ordinary staff run operations and never see
-- margin. Enforcing that with a screen that omits a column would last exactly
-- until someone calls the function directly, so it is enforced where the
-- numbers are computed.
--
-- The strongest assertion in this file is the last group. It reads the
-- catalog's own function signatures and demands that no staff-callable report
-- so much as *has* a cost, margin or profit column. A refusal can be forgotten
-- on a new function; a return type cannot be, because there is nowhere for the
-- number to go.

insert into auth.users (id, email) values
  ('d1000000-0000-4000-8000-00000000000a', '201000000061@phone.elgomala.local'),
  ('d1000000-0000-4000-8000-00000000000b', '201000000062@phone.elgomala.local'),
  ('d1000000-0000-4000-8000-00000000000c', '201000000063@phone.elgomala.local');

insert into public.profiles (id, full_name, phone, role) values
  ('d1000000-0000-4000-8000-00000000000a', 'عميل', '+201000000061', 'customer'),
  ('d1000000-0000-4000-8000-00000000000b', 'موظف', '+201000000062', 'staff'),
  ('d1000000-0000-4000-8000-00000000000c', 'مدير', '+201000000063', 'admin');

insert into public.categories (id, name_ar, name_en, slug)
values ('d2000000-0000-4000-8000-00000000000a', 'قسم', 'AuthzCat', 'authz-cat');

insert into public.products (id, category_id, name_ar, name_en, slug, price, unit, sku, stock_qty)
values ('d3000000-0000-4000-8000-00000000000a', 'd2000000-0000-4000-8000-00000000000a',
        'سلعة', 'Authz Item', 'authz-item', 5000, 'piece', 'AUTHZ-A', 50);

insert into public.product_costs (product_id, cost_price) values
  ('d3000000-0000-4000-8000-00000000000a', 3000);

-- ===========================================================================
-- 1-4. A customer gets no reports at all
--
-- Not "an empty report". Without the guard, a customer calling a report would
-- receive a report of their own orders — harmless today, and a leak the day a
-- policy is loosened. Refusing keeps the boundary legible.
-- ===========================================================================
select auth.login_as('d1000000-0000-4000-8000-00000000000a');  -- customer

select public.assert_raises('reporting_authz', '1 a customer cannot read the summary',
  $$select * from public.report_summary('2025-01-01', '2025-01-31')$$, 'not_authorized');

select public.assert_raises('reporting_authz', '2 a customer cannot read sales by day',
  $$select * from public.report_sales_by_day('2025-01-01', '2025-01-31')$$, 'not_authorized');

select public.assert_raises('reporting_authz', '3 a customer cannot read the customer report',
  $$select * from public.report_customers('2025-01-01', '2025-01-31')$$, 'not_authorized');

select public.assert_raises('reporting_authz', '4 a customer cannot read low stock',
  $$select * from public.report_low_stock(10)$$, 'not_authorized');

-- ===========================================================================
-- 5-9. Staff run operations
-- ===========================================================================
select auth.login_as('d1000000-0000-4000-8000-00000000000b');  -- staff

select public.assert('reporting_authz', '5 staff can read the summary',
  (select orders_delivered from public.report_summary('2025-01-01', '2025-01-31')) = 0);

select public.assert('reporting_authz', '6 staff can read sales by product',
  (select count(*) from public.report_sales_by_product('2025-01-01', '2025-01-31')) = 0);

select public.assert('reporting_authz', '7 staff can read low stock',
  (select count(*) from public.report_low_stock(100)) >= 1);

-- And are refused the moment the question turns to money the business paid.
select public.assert_raises('reporting_authz', '8 staff are refused product margin',
  $$select * from public.report_product_margin('2025-01-01', '2025-01-31')$$, 'not_authorized');

select public.assert_raises('reporting_authz', '9 staff are refused profit by day',
  $$select * from public.report_profit_by_day('2025-01-01', '2025-01-31')$$, 'not_authorized');

select public.assert_raises('reporting_authz', '9b staff are refused stock valuation',
  $$select * from public.report_stock_valuation()$$, 'not_authorized');

-- The refusal is not merely an empty set dressed up. Ordinary staff cannot
-- reach the cost table by any route, including the one the console uses.
select public.assert_raises('reporting_authz', '9c staff are refused the cost RPC',
  $$select * from public.get_product_cost('d3000000-0000-4000-8000-00000000000a')$$,
  'not_authorized');

-- ===========================================================================
-- 10-13. An admin sees everything
-- ===========================================================================
select auth.login_as('d1000000-0000-4000-8000-00000000000c');  -- admin

select public.assert('reporting_authz', '10 an admin can read product margin',
  (select count(*) from public.report_product_margin('2025-01-01', '2025-01-31')) = 0);

select public.assert('reporting_authz', '11 an admin can read profit by day',
  (select count(*) from public.report_profit_by_day('2025-01-01', '2025-01-31')) = 0);

select public.assert('reporting_authz', '12 an admin can value the stock at cost',
  (select cost_value from public.report_stock_valuation()) >= 150000);

select public.assert('reporting_authz', '13 stock valuation reports retail above cost',
  (select retail_value > cost_value from public.report_stock_valuation()));

-- ===========================================================================
-- 14-16. No staff-visible report can leak a cost, by construction
--
-- These read `pg_proc` rather than calling anything. A future report that
-- accidentally selects a cost column would fail here even if its author
-- remembered every guard, because the column would be visible in its signature.
-- ===========================================================================
select auth.reset_role();

select public.assert('reporting_authz', '14 no staff report exposes a cost or margin column',
  (select count(*)
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'report\_%'
     -- The three admin-only reports are allowed to name these things.
     and p.proname not in ('report_product_margin', 'report_profit_by_day',
                           'report_stock_valuation')
     and (
       array_to_string(p.proargnames, ',') ilike '%cost%'
       or array_to_string(p.proargnames, ',') ilike '%margin%'
       or array_to_string(p.proargnames, ',') ilike '%profit%'
     )) = 0);

-- Every report function must actually be SECURITY DEFINER — a report left as
-- invoker would silently return whatever RLS allowed the caller, which for a
-- customer is their own orders.
select public.assert('reporting_authz', '15 every report runs as its definer',
  (select count(*)
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'report\_%'
     and not p.prosecdef) = 0);

-- ...and must pin its search_path. A definer-rights function without one can be
-- pointed at a different set of tables by its caller.
select public.assert('reporting_authz', '16 every report pins its search_path',
  (select count(*)
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'report\_%'
     and (p.proconfig is null
          or not exists (select 1 from unnest(p.proconfig) c
                         where c like 'search\_path=%'))) = 0);

-- ===========================================================================
-- 17-20. The export audit trail (FR-085)
-- ===========================================================================
select auth.login_as('d1000000-0000-4000-8000-00000000000a');  -- customer

select public.assert_raises('reporting_authz', '17 a customer cannot log an export',
  $$select public.log_report_export('sales', 'csv', '2025-01-01', '2025-01-31', 5)$$,
  'not_authorized');

select public.assert('reporting_authz', '18 a customer cannot read the export log',
  (select count(*) from public.report_exports) = 0);

select auth.login_as('d1000000-0000-4000-8000-00000000000b');  -- staff

select public.log_report_export('sales', 'csv', '2025-01-01', '2025-01-31', 42);

-- The actor comes from auth.uid() inside the function, so the row names who
-- downloaded the file rather than whoever the caller nominated.
select auth.login_as('d1000000-0000-4000-8000-00000000000c');  -- admin

select public.assert('reporting_authz', '19 the export is recorded against the staff member',
  (select actor_id from public.report_exports order by created_at desc limit 1)
  = 'd1000000-0000-4000-8000-00000000000b');

-- No update or delete policy exists for anyone, admin included. A download that
-- happened cannot be made not to have happened.
select public.assert_raises('reporting_authz', '20 nobody can delete an export record',
  $$delete from public.report_exports$$);

select auth.reset_role();
