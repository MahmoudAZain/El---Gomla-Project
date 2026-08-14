import type { OrderStatus } from '@/types/database';

/**
 * The transition table, mirrored from `set_order_status()` (migration 0008).
 *
 * **This is a copy for rendering, not the rule.** The database holds the
 * authoritative table and re-checks it under a row lock, so a button this file
 * gets wrong is refused rather than obeyed (Constitution Principle VII,
 * FR-045). What it buys is a detail screen that offers only the buttons that
 * will work — staff never press "delivered" on a cancelled order and get an
 * error they could have been spared.
 *
 * The duplication is deliberate and small. If the two ever diverge, the
 * database wins and the screen merely offers a button that fails; the reverse
 * — a screen that permits something the database does not — cannot happen.
 */
export const STAFF_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  submitted: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

/** Every state an order can be in, in the order it passes through them. */
export const ORDER_STATUSES: OrderStatus[] = [
  'submitted',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned',
];

/** States that still need someone to act. The queue defaults to these. */
export const OPEN_STATUSES: OrderStatus[] = [
  'submitted',
  'confirmed',
  'preparing',
  'out_for_delivery',
];

export function isTerminal(status: OrderStatus): boolean {
  return STAFF_TRANSITIONS[status].length === 0;
}

/**
 * A customer may cancel only while the order is still `submitted`. After staff
 * confirm, the basket may already be picked (FR-048).
 */
export function customerMayCancel(status: OrderStatus): boolean {
  return status === 'submitted';
}

/**
 * Tone for a status badge. `cancelled` and `returned` are the two that should
 * catch the eye in a list of forty.
 */
export function statusTone(status: OrderStatus): 'neutral' | 'active' | 'done' | 'stopped' {
  switch (status) {
    case 'submitted':
      return 'neutral';
    case 'confirmed':
    case 'preparing':
    case 'out_for_delivery':
      return 'active';
    case 'delivered':
      return 'done';
    default:
      return 'stopped';
  }
}
