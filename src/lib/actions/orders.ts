'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { previewCartSchema, placeOrderSchema } from '@/lib/validation/schemas';
import type { CartPreview, PlacedOrder } from '@/types/database';
import type { ActionResult } from './auth';

/**
 * Cart pricing and order placement.
 *
 * Both send **only product identifiers and quantities**. Not because the
 * payload is stripped before sending, but because the schemas have no field for
 * anything else and the database functions read nothing else (FR-025, FR-026).
 */

/**
 * Every amount shown in the cart and at checkout comes from here.
 *
 * `price_cart()` is STABLE and reserves nothing — it is a preview. The
 * authoritative pass happens inside `place_order()`, which revalidates
 * independently under row locks. That is why a price can move between the two,
 * and why the checkout screen surfaces the difference before committing
 * (FR-035).
 */
export async function previewCart(
  items: { product_id: string; qty: number }[],
  governorateId: string,
): Promise<ActionResult<CartPreview>> {
  const parsed = previewCartSchema.safeParse({ items, governorate_id: governorateId });
  if (!parsed.success) return { ok: false, error: 'errors.invalidCart' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('price_cart', {
    p_items: parsed.data.items,
    p_governorate_id: parsed.data.governorate_id,
  });

  if (error) return { ok: false, error: 'errors.pricingFailed' };

  return { ok: true, data: data as CartPreview };
}

/**
 * The only path by which an order comes into existence.
 *
 * Database errors are surfaced by their machine-readable name so the UI can say
 * something specific and true — "only 2 left" rather than a generic failure.
 * Anything unrecognised falls back to the generic message rather than leaking a
 * Postgres string to a customer.
 */
const ORDER_ERRORS = new Set([
  'not_authenticated',
  'empty_cart',
  'address_not_found',
  'governorate_inactive',
  'product_unavailable',
  'insufficient_stock',
  'below_min_qty',
  'below_min_order_value',
]);

export async function placeOrder(input: {
  items: { product_id: string; qty: number }[];
  address_id: string;
  idempotency_key: string;
  note?: string;
}): Promise<ActionResult<PlacedOrder>> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'errors.invalidCart' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('place_order', {
    p_items: parsed.data.items,
    p_address_id: parsed.data.address_id,
    p_idempotency_key: parsed.data.idempotency_key,
    p_note: parsed.data.note || null,
  });

  if (error) {
    const code = (error.message ?? '').trim();
    const known = [...ORDER_ERRORS].find((e) => code.includes(e));
    return {
      ok: false,
      error: known ? `orderErrors.${known}` : 'errors.orderFailed',
      // `details` carries the specific number — how many are left, how much
      // more is needed — so the message can be useful rather than merely
      // accurate.
      field: error.details ?? undefined,
    };
  }

  return { ok: true, data: data as PlacedOrder };
}

/**
 * A staff transition (FR-045, FR-046, FR-049).
 *
 * The screen offers only the transitions the state machine permits, but this
 * function does not re-check them and must not: `set_order_status()` holds the
 * table, re-reads the status inside a row lock, and writes the history entry in
 * the same transaction. A check here would be a second opinion that can drift
 * from the first.
 *
 * The lock is what makes the awkward case correct. A customer cancelling at the
 * same moment staff confirm serializes at the database; the loser finds a status
 * their transition is not legal from, and is told so (FR-050).
 */
const TRANSITION_ERRORS = new Set([
  'not_authenticated',
  'order_not_found',
  'not_authorized',
  'invalid_transition',
  'order_already_moved',
]);

export async function transitionOrder(
  orderId: string,
  newStatus: string,
  note?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_order_status', {
    p_order_id: orderId,
    p_new_status: newStatus,
    p_note: note?.trim() || null,
  });

  if (error) {
    const message = error.message ?? '';
    const known = [...TRANSITION_ERRORS].find((e) => message.includes(e));
    return { ok: false, error: known ? `orderErrors.${known}` : 'errors.transitionFailed' };
  }

  // The queue and the detail screen both show a status that has just changed.
  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}

/**
 * Customer self-cancellation.
 *
 * Permitted only while the order is still `submitted`. The database decides
 * that, not this function — after staff confirm, the basket may already be
 * picked (FR-048).
 */
export async function cancelMyOrder(orderId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_order_status', {
    p_order_id: orderId,
    p_new_status: 'cancelled',
    p_note: null,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('order_already_moved')) {
      return { ok: false, error: 'orderErrors.order_already_moved' };
    }
    if (message.includes('not_authorized')) {
      return { ok: false, error: 'orderErrors.not_authorized' };
    }
    return { ok: false, error: 'errors.cancelFailed' };
  }

  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}
