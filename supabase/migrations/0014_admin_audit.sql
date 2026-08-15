-- 0014 — Writing to the administrative audit log
--
-- 0002 created `admin_audit_log` and 0009 granted admins the right to *read*
-- it. Nothing could write one, because nothing yet did. Stage 4 does.
--
-- There is deliberately no INSERT policy even now. A policy would let the
-- client choose `actor_id`, which makes the log a record of who *claimed* to
-- act rather than who acted. The function below takes the actor from
-- `auth.uid()` and ignores any opinion the caller has about it.

create or replace function public.log_admin_action(
  p_action      text,
  p_target_type text default null,
  p_target_id   uuid default null,
  p_detail      jsonb default null
)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'not_authorized'
      using detail = 'only staff may write the audit log', errcode = '42501';
  end if;

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_detail);
end $$;

grant execute on function public.log_admin_action(text, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Delivery pricing is editable at any moment — and never silently
--
-- Fee, minimum order value and coverage are business levers, not constants:
-- fuel rises, a district opens, a campaign drops the minimum for a fortnight.
-- The admin console changes them whenever the business decides, and the next
-- cart priced uses the new numbers.
--
-- Orders already placed are untouched. `orders` stores its own copy of the fee
-- and the governorate name at placement (0007), so raising a fee cannot rewrite
-- what a customer was quoted or what the driver is owed at the door.
--
-- What must not happen is a fee moving with nobody knowing who moved it. When
-- a driver collects 5 EGP more than the customer expected, the question is
-- always "when did this change, and who changed it". A trigger answers it for
-- every path — the console, a SQL console, a future script — rather than
-- trusting each of them to remember.
-- ---------------------------------------------------------------------------
create or replace function public.audit_governorate_pricing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.delivery_fee is distinct from old.delivery_fee
     or new.min_order_value is distinct from old.min_order_value
     or new.is_active is distinct from old.is_active then

    insert into public.admin_audit_log (actor_id, action, target_type, target_id, detail)
    select
      auth.uid(),
      'governorate.pricing_changed',
      'governorate',
      new.id,
      jsonb_build_object(
        'name_en',             new.name_en,
        'delivery_fee_before', old.delivery_fee,
        'delivery_fee_after',  new.delivery_fee,
        'min_order_before',    old.min_order_value,
        'min_order_after',     new.min_order_value,
        'active_before',       old.is_active,
        'active_after',        new.is_active
      )
    -- Seeds and migrations run without a session user. Skipping those keeps the
    -- log a record of human decisions rather than of deployments.
    where auth.uid() is not null;
  end if;

  return new;
end $$;

create trigger governorates_audit_pricing
  after update on public.governorates
  for each row execute function public.audit_governorate_pricing();

comment on function public.audit_governorate_pricing is
  'Delivery fees change whenever the business needs them to — this makes every such change attributable.';
