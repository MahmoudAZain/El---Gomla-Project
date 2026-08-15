-- The staff console's guarantees.
--
-- Stage 4 adds screens, and a screen is not a boundary. Everything asserted
-- here is what remains true when the screens are bypassed entirely — a customer
-- posting to a Server Action, a curl against PostgREST, a stolen session.
--
-- Four groups:
--   1-8    only an admin writes master data
--   9-11   cost prices are unreachable, not merely hidden
--   12-15  the audit log records who acted, not who claimed to
--   16-23  delivery fees are editable at any time, safely and attributably
--   24-27  master data is deactivated, not deleted, once anything points at it

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', '201000000031@phone.elgomala.local'),
  ('a0000000-0000-4000-8000-00000000000b', '201000000032@phone.elgomala.local'),
  ('a0000000-0000-4000-8000-00000000000c', '201000000033@phone.elgomala.local');

insert into public.profiles (id, full_name, phone, role) values
  ('a0000000-0000-4000-8000-00000000000a', 'عميل',  '+201000000031', 'customer'),
  ('a0000000-0000-4000-8000-00000000000b', 'موظف',  '+201000000032', 'staff'),
  ('a0000000-0000-4000-8000-00000000000c', 'مدير',  '+201000000033', 'admin');

insert into public.governorates (id, name_ar, name_en, delivery_fee, min_order_value, is_active)
values ('b0000000-0000-4000-8000-00000000000a', 'محافظة الإدارة', 'AdminTown', 2500, 0, true);

insert into public.addresses (id, profile_id, governorate_id, street_address, landmark)
values ('c0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a',
        'b0000000-0000-4000-8000-00000000000a', 'شارع الإدارة', 'جنب الصيدلية');

insert into public.categories (id, name_ar, name_en, slug)
values ('d0000000-0000-4000-8000-00000000000a', 'قسم الإدارة', 'AdminCat', 'admin-cat');

insert into public.products (id, category_id, name_ar, name_en, slug, price, unit, sku, stock_qty)
values ('e0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000a',
        'سلعة الإدارة', 'Admin Item', 'admin-item', 4000, 'piece', 'ADM-A', 100);

insert into public.product_costs (product_id, cost_price, supplier_name)
values ('e0000000-0000-4000-8000-00000000000a', 2200, 'مورد');

-- ===========================================================================
-- 1-8. Master data is admin-only. Staff run orders; admins run the catalog.
-- ===========================================================================
select auth.login_as('a0000000-0000-4000-8000-00000000000a');  -- customer

select public.assert_raises('admin', '1 a customer cannot create a product',
  $$insert into public.products (category_id, name_ar, name_en, slug, price, unit, sku)
    values ('d0000000-0000-4000-8000-00000000000a', 'تسلل', 'Sneak', 'sneak', 1, 'piece', 'SNK')$$,
  'row-level security');

-- An UPDATE a policy rejects matches no rows rather than raising: the USING
-- clause filters the row out before the write is considered. The guarantee is
-- therefore stated as "the price did not move", which is the thing that
-- actually matters — and which an attacker cannot distinguish from success
-- without reading the row back.
update public.products set price = 1
where id = 'e0000000-0000-4000-8000-00000000000a';

select public.assert('admin', '2 a customer''s price change does not land',
  (select price from public.products where id = 'e0000000-0000-4000-8000-00000000000a') = 4000);

select public.assert_raises('admin', '3 a customer cannot create a category',
  $$insert into public.categories (name_ar, name_en, slug)
    values ('تسلل', 'SneakCat', 'sneak-cat')$$,
  'row-level security');

select public.assert_raises('admin', '4 a customer cannot create a promotion',
  $$insert into public.promotions (name_ar, name_en, discount_type, discount_value, starts_at, ends_at)
    values ('تسلل', 'SneakPromo', 'percent', 90, now(), now() + interval '1 day')$$,
  'row-level security');

select auth.login_as('a0000000-0000-4000-8000-00000000000b');  -- staff

-- Staff seeing the console is a convenience; staff *writing* master data is not
-- permitted. `is_admin()`, not `is_staff()`, guards every catalog policy.
update public.products set price = 1
where id = 'e0000000-0000-4000-8000-00000000000a';

select public.assert('admin', '5 a staff price change does not land either',
  (select price from public.products where id = 'e0000000-0000-4000-8000-00000000000a') = 4000);

select public.assert('admin', '6 staff can still read the catalog they work with',
  (select count(*) from public.products
   where id = 'e0000000-0000-4000-8000-00000000000a') = 1);

select public.assert_raises('admin', '7 staff cannot create a brand',
  $$insert into public.brands (name_ar, name_en, slug)
    values ('ماركة', 'StaffBrand', 'staff-brand')$$,
  'row-level security');

select auth.login_as('a0000000-0000-4000-8000-00000000000c');  -- admin

update public.products set price = 4500
where id = 'e0000000-0000-4000-8000-00000000000a';

select public.assert('admin', '8 an admin can change a price',
  (select price from public.products where id = 'e0000000-0000-4000-8000-00000000000a') = 4500);

-- ===========================================================================
-- 9-11. Cost prices are unreachable, not filtered
--
-- The distinction matters: an empty result is indistinguishable from "no cost
-- recorded". A refusal is not (FR-063, SC-008).
-- ===========================================================================
select auth.login_as('a0000000-0000-4000-8000-00000000000a');  -- customer

select public.assert_raises('admin', '9 a customer is refused product_costs outright',
  $$select cost_price from public.product_costs$$, 'permission denied');

select auth.login_as('a0000000-0000-4000-8000-00000000000b');  -- staff

select public.assert_raises('admin', '10 staff are refused the cost RPC, not given an empty row',
  $$select * from public.get_product_cost('e0000000-0000-4000-8000-00000000000a')$$,
  'not_authorized');

select auth.login_as('a0000000-0000-4000-8000-00000000000c');  -- admin

select public.assert('admin', '11 an admin reads the cost through the RPC',
  (select cost_price from public.get_product_cost('e0000000-0000-4000-8000-00000000000a')) = 2200);

-- ===========================================================================
-- 12-15. The audit log records who acted
-- ===========================================================================
select auth.login_as('a0000000-0000-4000-8000-00000000000a');  -- customer

select public.assert_raises('admin', '12 a customer cannot write the audit log',
  $$select public.log_admin_action('forged.action', 'profile', null, null)$$,
  'not_authorized');

select public.assert_raises('admin', '13 a customer cannot insert into the audit log directly',
  $$insert into public.admin_audit_log (actor_id, action)
    values ('a0000000-0000-4000-8000-00000000000c', 'forged')$$);

select auth.login_as('a0000000-0000-4000-8000-00000000000c');  -- admin

select public.log_admin_action('password.reset', 'profile',
  'a0000000-0000-4000-8000-00000000000a', null);

-- The function takes the actor from auth.uid() and accepts no opinion about it,
-- so the log names the person rather than whoever the caller nominated.
select public.assert('admin', '14 the audit entry names the acting admin',
  (select actor_id from public.admin_audit_log
   where action = 'password.reset'
   order by created_at desc limit 1) = 'a0000000-0000-4000-8000-00000000000c');

select auth.login_as('a0000000-0000-4000-8000-00000000000b');  -- staff

select public.assert('admin', '15 staff cannot read the audit log',
  (select count(*) from public.admin_audit_log) = 0);

-- ===========================================================================
-- 16-23. Delivery fees change at any time — safely, and never silently
--
-- This is the business requirement stated plainly: fee, minimum and coverage
-- are editable whenever the shop decides. What follows proves that doing so is
-- safe on a live system.
-- ===========================================================================
select auth.login_as('a0000000-0000-4000-8000-00000000000a');  -- customer

update public.governorates set delivery_fee = 0
where id = 'b0000000-0000-4000-8000-00000000000a';

select public.assert('admin', '16 a customer''s fee change does not land',
  (select delivery_fee from public.governorates
   where id = 'b0000000-0000-4000-8000-00000000000a') = 2500);

select public.assert('admin', '17 the fee is unchanged after a refused update',
  (select delivery_fee from public.governorates
   where id = 'b0000000-0000-4000-8000-00000000000a') = 2500);

-- An order placed at the old fee, before the change.
select public.place_order(
  '[{"product_id":"e0000000-0000-4000-8000-00000000000a","qty":1}]'::jsonb,
  'c0000000-0000-4000-8000-00000000000a', 'admin-fee-before');

select public.assert('admin', '18 the order was quoted the fee in force at the time',
  (select delivery_fee from public.orders where idempotency_key = 'admin-fee-before') = 2500);

select auth.login_as('a0000000-0000-4000-8000-00000000000b');  -- staff

update public.governorates set delivery_fee = 100
where id = 'b0000000-0000-4000-8000-00000000000a';

select public.assert('admin', '19 a staff fee change does not land',
  (select delivery_fee from public.governorates
   where id = 'b0000000-0000-4000-8000-00000000000a') = 2500);

select auth.login_as('a0000000-0000-4000-8000-00000000000c');  -- admin

-- The whole point of the screen: three numbers, changed at will.
update public.governorates
set delivery_fee = 4000, min_order_value = 10000
where id = 'b0000000-0000-4000-8000-00000000000a';

select public.assert('admin', '20 an admin changes the fee and the minimum at any time',
  (select delivery_fee = 4000 and min_order_value = 10000
   from public.governorates where id = 'b0000000-0000-4000-8000-00000000000a'));

-- The guarantee that makes editing a live fee safe: the order keeps what the
-- customer was quoted, so the driver collects the agreed amount.
select public.assert('admin', '21 an order placed earlier keeps its original fee',
  (select delivery_fee from public.orders where idempotency_key = 'admin-fee-before') = 2500);

-- And the guarantee that makes it accountable.
select public.assert('admin', '22 the change is recorded with its before and after',
  (select detail ->> 'delivery_fee_before' = '2500'
      and detail ->> 'delivery_fee_after'  = '4000'
      and detail ->> 'min_order_after'     = '10000'
   from public.admin_audit_log
   where action = 'governorate.pricing_changed'
   order by created_at desc limit 1));

select public.assert('admin', '23 the pricing change names the admin who made it',
  (select actor_id from public.admin_audit_log
   where action = 'governorate.pricing_changed'
   order by created_at desc limit 1) = 'a0000000-0000-4000-8000-00000000000c');

-- Coverage is data too. Switching a governorate off stops new orders into it
-- immediately, which is the correct outcome — the alternative is accepting an
-- order nobody can deliver.
update public.governorates set is_active = false
where id = 'b0000000-0000-4000-8000-00000000000a';

select auth.login_as('a0000000-0000-4000-8000-00000000000a');  -- customer

select public.assert_raises('admin', '23b an order into a switched-off governorate is refused',
  $$select public.place_order(
      '[{"product_id":"e0000000-0000-4000-8000-00000000000a","qty":1}]'::jsonb,
      'c0000000-0000-4000-8000-00000000000a', 'admin-fee-after')$$,
  'governorate_inactive');

select auth.login_as('a0000000-0000-4000-8000-00000000000c');  -- admin
update public.governorates set is_active = true
where id = 'b0000000-0000-4000-8000-00000000000a';

-- ===========================================================================
-- 24-27. Deactivate, do not delete (FR-061)
--
-- An order is evidence of what a customer bought. Deleting the product or the
-- category it was filed under tears a hole in that evidence, so the database
-- refuses and the console tells staff to deactivate instead.
-- ===========================================================================
select public.assert_raises('admin', '24 a product on an order cannot be deleted',
  $$delete from public.products where id = 'e0000000-0000-4000-8000-00000000000a'$$,
  'violates foreign key constraint');

select public.assert_raises('admin', '25 a category with products cannot be deleted',
  $$delete from public.categories where id = 'd0000000-0000-4000-8000-00000000000a'$$,
  'violates foreign key constraint');

update public.products set is_active = false
where id = 'e0000000-0000-4000-8000-00000000000a';

select auth.browse_anonymously();

select public.assert('admin', '26 a deactivated product disappears from the shop',
  (select count(*) from public.products
   where id = 'e0000000-0000-4000-8000-00000000000a') = 0);

select auth.login_as('a0000000-0000-4000-8000-00000000000c');  -- admin

select public.assert('admin', '27 the order line survives the deactivation',
  (select count(*) from public.order_items oi
   join public.orders o on o.id = oi.order_id
   where o.idempotency_key = 'admin-fee-before') = 1);

select auth.reset_role();
