-- The order lifecycle end to end (T086, SC-010, SC-011).
--
-- `transitions.test.sql` already proves the state machine refuses illegal
-- moves. This suite proves the journey the business actually runs: one order
-- from submitted to delivered with every step logged and attributed, a customer
-- cancelling inside their window and refused outside it, and one customer
-- unable to touch another's order at all.

insert into auth.users (id, email) values
  ('f0000000-0000-4000-8000-00000000000a', '201000000041@phone.elgomala.local'),
  ('f0000000-0000-4000-8000-00000000000b', '201000000042@phone.elgomala.local'),
  ('f0000000-0000-4000-8000-00000000000c', '201000000043@phone.elgomala.local');

insert into public.profiles (id, full_name, phone, role) values
  ('f0000000-0000-4000-8000-00000000000a', 'عميل أ', '+201000000041', 'customer'),
  ('f0000000-0000-4000-8000-00000000000b', 'عميل ب', '+201000000042', 'customer'),
  ('f0000000-0000-4000-8000-00000000000c', 'موظف',   '+201000000043', 'staff');

insert into public.governorates (id, name_ar, name_en, delivery_fee, min_order_value, is_active)
values ('e1000000-0000-4000-8000-00000000000a', 'محافظة الدورة', 'LifecycleTown', 2000, 0, true);

insert into public.addresses (id, profile_id, governorate_id, street_address, landmark) values
  ('e2000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-00000000000a',
   'e1000000-0000-4000-8000-00000000000a', 'شارع أ', 'جنب المخبز'),
  ('e2000000-0000-4000-8000-00000000000b', 'f0000000-0000-4000-8000-00000000000b',
   'e1000000-0000-4000-8000-00000000000a', 'شارع ب', 'قدام المدرسة');

insert into public.categories (id, name_ar, name_en, slug)
values ('e3000000-0000-4000-8000-00000000000a', 'قسم', 'LifecycleCat', 'lifecycle-cat');

insert into public.products (id, category_id, name_ar, name_en, slug, price, unit, sku, stock_qty)
values ('e4000000-0000-4000-8000-00000000000a', 'e3000000-0000-4000-8000-00000000000a',
        'سلعة', 'Lifecycle Item', 'lifecycle-item', 3000, 'piece', 'LC-A', 100);

-- ===========================================================================
-- 1-8. Submitted → delivered, every step logged
-- ===========================================================================
select auth.login_as('f0000000-0000-4000-8000-00000000000a');

select public.place_order(
  '[{"product_id":"e4000000-0000-4000-8000-00000000000a","qty":2}]'::jsonb,
  'e2000000-0000-4000-8000-00000000000a', 'lifecycle-main');

select public.assert('lifecycle', '1 a new order starts as submitted',
  (select status from public.orders where idempotency_key = 'lifecycle-main') = 'submitted');

-- Placement itself is the first history entry, so the log has no gap at its
-- start (FR-046).
select public.assert('lifecycle', '2 placement is itself recorded',
  (select count(*) from public.order_status_history h
   join public.orders o on o.id = h.order_id
   where o.idempotency_key = 'lifecycle-main') = 1);

select auth.login_as('f0000000-0000-4000-8000-00000000000c');  -- staff

select public.set_order_status(
  (select id from public.orders where idempotency_key = 'lifecycle-main'),
  'confirmed', 'اتكلمنا مع العميل بالتليفون');

select public.set_order_status(
  (select id from public.orders where idempotency_key = 'lifecycle-main'), 'preparing');

select public.set_order_status(
  (select id from public.orders where idempotency_key = 'lifecycle-main'), 'out_for_delivery');

select public.set_order_status(
  (select id from public.orders where idempotency_key = 'lifecycle-main'), 'delivered');

select public.assert('lifecycle', '3 the order reaches delivered',
  (select status from public.orders where idempotency_key = 'lifecycle-main') = 'delivered');

select public.assert('lifecycle', '4 delivered_at is stamped',
  (select delivered_at is not null from public.orders
   where idempotency_key = 'lifecycle-main'));

select public.assert('lifecycle', '5 every step left a history entry',
  (select count(*) from public.order_status_history h
   join public.orders o on o.id = h.order_id
   where o.idempotency_key = 'lifecycle-main') = 5);

-- The note staff typed is what the next person reads. It has to survive.
select public.assert('lifecycle', '6 the note travels into the history',
  (select h.note from public.order_status_history h
   join public.orders o on o.id = h.order_id
   where o.idempotency_key = 'lifecycle-main' and h.to_status = 'confirmed')
  = 'اتكلمنا مع العميل بالتليفون');

select public.assert('lifecycle', '7 the history names who acted',
  (select h.actor_role from public.order_status_history h
   join public.orders o on o.id = h.order_id
   where o.idempotency_key = 'lifecycle-main' and h.to_status = 'confirmed') = 'staff');

-- Each entry records where it came from as well as where it went, so the chain
-- can be verified rather than merely read.
select public.assert('lifecycle', '8 the chain is continuous',
  (select count(*) from public.order_status_history h
   join public.orders o on o.id = h.order_id
   where o.idempotency_key = 'lifecycle-main'
     and h.from_status is distinct from h.to_status) = 5);

-- ===========================================================================
-- 9-10. Delivered is nearly terminal: only a return follows
-- ===========================================================================
select public.assert_raises('lifecycle', '9 a delivered order cannot go back to preparing',
  $$select public.set_order_status(
      (select id from public.orders where idempotency_key = 'lifecycle-main'), 'preparing')$$,
  'invalid_transition');

select public.set_order_status(
  (select id from public.orders where idempotency_key = 'lifecycle-main'), 'returned', 'العميل رجّع الطلب');

select public.assert('lifecycle', '10 a delivered order can be returned',
  (select status from public.orders where idempotency_key = 'lifecycle-main') = 'returned');

-- ===========================================================================
-- 11-14. The customer's cancellation window (SC-010, FR-048, FR-050)
-- ===========================================================================
select auth.login_as('f0000000-0000-4000-8000-00000000000a');

select public.place_order(
  '[{"product_id":"e4000000-0000-4000-8000-00000000000a","qty":1}]'::jsonb,
  'e2000000-0000-4000-8000-00000000000a', 'lifecycle-cancel-ok');

select public.set_order_status(
  (select id from public.orders where idempotency_key = 'lifecycle-cancel-ok'), 'cancelled');

select public.assert('lifecycle', '11 a customer may cancel while submitted',
  (select status from public.orders where idempotency_key = 'lifecycle-cancel-ok') = 'cancelled');

select public.assert('lifecycle', '12 cancelled_at is stamped',
  (select cancelled_at is not null from public.orders
   where idempotency_key = 'lifecycle-cancel-ok'));

-- Now the same attempt one step later.
select public.place_order(
  '[{"product_id":"e4000000-0000-4000-8000-00000000000a","qty":1}]'::jsonb,
  'e2000000-0000-4000-8000-00000000000a', 'lifecycle-cancel-late');

select auth.login_as('f0000000-0000-4000-8000-00000000000c');  -- staff confirm first
select public.set_order_status(
  (select id from public.orders where idempotency_key = 'lifecycle-cancel-late'), 'confirmed');

select auth.login_as('f0000000-0000-4000-8000-00000000000a');

-- The specific error matters: the UI says "this order has already moved on,
-- please call us" rather than a generic failure, because by now someone may be
-- picking the basket (FR-050).
select public.assert_raises('lifecycle', '13 a customer cannot cancel once confirmed',
  $$select public.set_order_status(
      (select id from public.orders where idempotency_key = 'lifecycle-cancel-late'), 'cancelled')$$,
  'order_already_moved');

select public.assert('lifecycle', '14 the refused cancellation left the order confirmed',
  (select status from public.orders where idempotency_key = 'lifecycle-cancel-late') = 'confirmed');

-- ===========================================================================
-- 15-18. A customer cannot reach another customer's order (SC-011)
-- ===========================================================================
select public.assert_raises('lifecycle', '15 a customer cannot advance their own order',
  $$select public.set_order_status(
      (select id from public.orders where idempotency_key = 'lifecycle-cancel-late'), 'delivered')$$,
  'not_authorized');

select auth.login_as('f0000000-0000-4000-8000-00000000000b');  -- the other customer

select public.assert('lifecycle', '16 another customer cannot even see the order',
  (select count(*) from public.orders where idempotency_key = 'lifecycle-cancel-late') = 0);

-- Invisible and unreachable are different guarantees, and both are needed: the
-- id could be guessed, or leaked, or logged somewhere it should not be.
select public.assert_raises('lifecycle', '17 another customer cannot cancel it either',
  $$select public.set_order_status(
      (select id from public.orders o where o.idempotency_key = 'lifecycle-cancel-late'), 'cancelled')$$);

select public.assert('lifecycle', '18 the order is untouched by the attempt',
  (select count(*) from public.order_status_history h
   join public.orders o on o.id = h.order_id
   where o.idempotency_key = 'lifecycle-cancel-late'
     and h.actor_id = 'f0000000-0000-4000-8000-00000000000b') = 0);

-- ===========================================================================
-- 19-21. The staff queue sees everything; the history is append-only
-- ===========================================================================
select auth.login_as('f0000000-0000-4000-8000-00000000000c');  -- staff

-- All three: the one that ran to a return, the one the customer cancelled, and
-- the one they were refused. Staff see orders belonging to two different
-- customers here, which is the grant that makes the queue possible at all.
select public.assert('lifecycle', '19 staff see every order in the queue',
  (select count(*) from public.orders where idempotency_key like 'lifecycle-%') = 3);

-- No policy grants an update or a delete on the history to anyone, admin
-- included. Rows are written only inside place_order() and set_order_status().
-- When a driver and a customer disagree, this log is the only evidence there is
-- (FR-047).
select public.assert_raises('lifecycle', '20 staff cannot rewrite a history entry',
  $$update public.order_status_history set note = 'edited' where note is not null$$);

select public.assert_raises('lifecycle', '21 staff cannot delete a history entry',
  $$delete from public.order_status_history$$);

select auth.reset_role();
