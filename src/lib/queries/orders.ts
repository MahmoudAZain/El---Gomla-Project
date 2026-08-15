import { createClient } from '@/lib/supabase/server';

/**
 * Order reads.
 *
 * No `.eq('profile_id', ...)` appears anywhere below, and that is deliberate:
 * the policy on `orders` already restricts every read to the caller's own rows.
 * Adding a filter would imply the filter is what protects the data, and invite
 * someone to remove it later "because RLS covers it" — the wrong lesson in the
 * wrong direction. Staff see every order through the same queries, because the
 * same policy grants them that (FR-062).
 */

export interface OrderSummary {
  id: string;
  reference: string;
  status: string;
  grand_total: number;
  placed_at: string;
  item_count: number;
}

export async function getMyOrders(): Promise<OrderSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('orders')
    .select('id, reference, status, grand_total, placed_at, order_items(id)')
    .order('placed_at', { ascending: false })
    .limit(50);

  return (data ?? []).map((o) => ({
    id: o.id,
    reference: o.reference,
    status: o.status,
    grand_total: o.grand_total,
    placed_at: o.placed_at,
    item_count: (o.order_items as { id: string }[]).length,
  }));
}

/**
 * The staff queue (FR-058).
 *
 * Same policy as everything else in this file: staff see every order because
 * `orders_select_own` grants them that, not because this query asks for more.
 * A customer who reached this code would get their own orders back, which is
 * the correct outcome and not a leak.
 *
 * Filtering happens in the database rather than in the browser: a shop running
 * for a year has more orders than a page should carry, and "today, Cairo,
 * submitted" is the question staff actually ask.
 */
export interface QueueOrder {
  id: string;
  reference: string;
  status: string;
  grand_total: number;
  placed_at: string;
  recipient_name: string;
  recipient_phone: string;
  governorate_id: string;
  governorate_name_ar: string;
  governorate_name_en: string;
  item_count: number;
}

export async function getOrderQueue(filters: {
  statuses?: string[];
  governorateId?: string;
  from?: string;
  to?: string;
  search?: string;
}): Promise<QueueOrder[]> {
  const supabase = await createClient();

  let query = supabase
    .from('orders')
    .select(
      `id, reference, status, grand_total, placed_at, recipient_name, recipient_phone,
       governorate_id, governorate_name_ar, governorate_name_en, order_items(id)`,
    )
    .order('placed_at', { ascending: false })
    .limit(200);

  if (filters.statuses?.length) query = query.in('status', filters.statuses);
  if (filters.governorateId) query = query.eq('governorate_id', filters.governorateId);
  if (filters.from) query = query.gte('placed_at', filters.from);
  if (filters.to) query = query.lte('placed_at', filters.to);

  if (filters.search) {
    // Reference or phone: the two things a customer can read out over the
    // telephone. Commas and parentheses would break out of the `or` filter's
    // own syntax, so they are stripped rather than escaped.
    const term = filters.search.trim().replace(/[%,()]/g, '');
    if (term) query = query.or(`reference.ilike.%${term}%,recipient_phone.ilike.%${term}%`);
  }

  const { data } = await query;

  return (data ?? []).map((o) => ({
    id: o.id,
    reference: o.reference,
    status: o.status,
    grand_total: o.grand_total,
    placed_at: o.placed_at,
    recipient_name: o.recipient_name,
    recipient_phone: o.recipient_phone,
    governorate_id: o.governorate_id,
    governorate_name_ar: o.governorate_name_ar,
    governorate_name_en: o.governorate_name_en,
    item_count: (o.order_items as { id: string }[]).length,
  }));
}

/** Order counts by state, for the console dashboard. */
export async function getOrderCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from('orders').select('status').limit(5000);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}

/** One order by id, for the staff detail screen. */
export async function getOrderById(id: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('orders')
    .select(
      `id, reference, status, subtotal, discount_total, delivery_fee, grand_total,
       recipient_name, recipient_phone, street_address, landmark, building, floor_apartment,
       governorate_name_ar, governorate_name_en, customer_note,
       placed_at, delivered_at, cancelled_at,
       order_items(id, product_name_ar, product_name_en, unit, pack_size, qty,
                   unit_price, unit_discount, line_total),
       order_status_history(id, from_status, to_status, actor_role, note, created_at)`,
    )
    .eq('id', id)
    .maybeSingle();

  return data;
}

export async function getOrderByReference(reference: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('orders')
    .select(
      `id, reference, status, subtotal, discount_total, delivery_fee, grand_total,
       recipient_name, recipient_phone, street_address, landmark, building, floor_apartment,
       governorate_name_ar, governorate_name_en, customer_note,
       placed_at, delivered_at, cancelled_at,
       order_items(id, product_name_ar, product_name_en, unit, pack_size, qty,
                   unit_price, unit_discount, line_total),
       order_status_history(id, from_status, to_status, actor_role, note, created_at)`,
    )
    .eq('reference', reference)
    .maybeSingle();

  return data;
}
