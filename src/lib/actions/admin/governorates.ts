'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { governorateSchema } from '@/lib/validation/admin-schemas';
import type { ActionResult } from '../auth';
import { adminOrRefusal, describeWriteError } from './guard';

/**
 * Delivery pricing and coverage (FR-056, FR-056a, FR-056b).
 *
 * **Nothing about delivery is fixed in code.** The fee, the minimum order value
 * and whether a governorate is served at all are three editable numbers per
 * row, changeable at any moment from this console. There is no constant to
 * redeploy, no seed to re-run, and no hard-coded "Cairo and Giza" anywhere in
 * the application — launch coverage is a pair of `is_active` flags in data.
 *
 * Three properties make that safe to do on a live shop:
 *
 *   1. **A change takes effect on the next cart priced.** `price_cart()` and
 *      `place_order()` both read the row at call time, so a fee raised at noon
 *      applies from noon.
 *   2. **Orders already placed do not move.** `orders` keeps its own copy of the
 *      fee and the governorate name from the moment of placement (migration
 *      0007). A driver collects what the customer was quoted, whatever the fee
 *      became since.
 *   3. **Every change is attributable.** A trigger writes the before and after
 *      of all three fields to `admin_audit_log` (migration 0014), so a dispute
 *      about what the fee was on Tuesday has an answer.
 *
 * Deactivating a governorate is the one change with an immediate customer-facing
 * edge: `place_order()` raises `governorate_inactive` for a cart already at
 * checkout there. That is the correct outcome — the alternative is accepting an
 * order into a district with nobody to deliver it.
 */

export async function saveGovernorate(formData: FormData): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const parsed = governorateSchema.safeParse({
    id: formData.get('id'),
    delivery_fee: formData.get('delivery_fee'),
    min_order_value: formData.get('min_order_value'),
    is_active: formData.get('is_active'),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? 'adminErrors.invalidInput',
      field: String(issue?.path[0] ?? ''),
    };
  }

  const input = parsed.data;
  const supabase = await createClient();

  // The 27 rows are seeded and permanent: a governorate is neither created nor
  // deleted here, only priced and switched on. Addresses reference them with
  // ON DELETE RESTRICT, so a removed row would strand a customer's address.
  const { error } = await supabase
    .from('governorates')
    .update({
      delivery_fee: input.delivery_fee,
      min_order_value: input.min_order_value,
      is_active: input.is_active,
    })
    .eq('id', input.id);

  if (error) return { ok: false, error: describeWriteError(error) };

  // The audit entry is written by the trigger, not from here — that way a
  // change made through any other path is recorded too.
  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}

/**
 * Applies several rows at once.
 *
 * A fuel increase moves every fee on the same day, and doing that one row at a
 * time invites a half-applied price list. Each row is still validated
 * individually, and the first refusal stops the run rather than leaving an
 * unknown number of rows changed silently.
 */
export async function saveGovernorateBatch(
  rows: { id: string; delivery_fee: string; min_order_value: string; is_active: boolean }[],
): Promise<ActionResult<{ updated: number }>> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  let updated = 0;

  for (const row of rows) {
    const parsed = governorateSchema.safeParse({
      id: row.id,
      delivery_fee: row.delivery_fee,
      min_order_value: row.min_order_value,
      is_active: row.is_active ? 'on' : '',
    });

    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'adminErrors.invalidInput',
        field: row.id,
      };
    }

    const { error } = await supabase
      .from('governorates')
      .update({
        delivery_fee: parsed.data.delivery_fee,
        min_order_value: parsed.data.min_order_value,
        is_active: parsed.data.is_active,
      })
      .eq('id', parsed.data.id);

    if (error) return { ok: false, error: describeWriteError(error), field: row.id };
    updated += 1;
  }

  revalidatePath('/', 'layout');
  return { ok: true, data: { updated } };
}

export async function setGovernorateActive(id: string, isActive: boolean): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { error } = await supabase.from('governorates').update({ is_active: isActive }).eq('id', id);
  if (error) return { ok: false, error: describeWriteError(error) };

  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}
