'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { promotionSchema } from '@/lib/validation/admin-schemas';
import { poundsToPiastres } from '@/lib/money';
import type { ActionResult } from '../auth';
import { adminOrRefusal, describeWriteError, recordAudit } from './guard';

/**
 * Promotions (FR-055).
 *
 * A promotion is a rule, not a price. Nothing here writes a discounted amount
 * anywhere: `effective_price()` resolves the best applicable rule at query time,
 * which is why a promotion needs no scheduled job to start or to expire — it
 * simply begins and stops matching (research R7).
 *
 * The console therefore never has to answer "why is this product still on
 * offer": if the window has passed, it is not.
 */

export async function savePromotion(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const parsed = promotionSchema.safeParse({
    id: formData.get('id') || undefined,
    name_ar: formData.get('name_ar'),
    name_en: formData.get('name_en'),
    discount_type: formData.get('discount_type'),
    discount_value: formData.get('discount_value'),
    starts_at: formData.get('starts_at'),
    ends_at: formData.get('ends_at'),
    scope: formData.get('scope'),
    scope_id: formData.get('scope_id') || null,
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

  // Percent is a whole number; fixed is pounds off, stored as piastres. The
  // schema has already established which of the two this is.
  const discountValue =
    input.discount_type === 'percent'
      ? Number(input.discount_value)
      : (poundsToPiastres(input.discount_value) as number);

  const fields = {
    name_ar: input.name_ar,
    name_en: input.name_en,
    discount_type: input.discount_type,
    discount_value: discountValue,
    starts_at: new Date(input.starts_at).toISOString(),
    ends_at: new Date(input.ends_at).toISOString(),

    // Exactly one scope column carries a value; a check constraint refuses any
    // combination (migration 0006).
    product_id: input.scope === 'product' ? input.scope_id : null,
    category_id: input.scope === 'category' ? input.scope_id : null,
    brand_id: input.scope === 'brand' ? input.scope_id : null,

    is_active: input.is_active,
  };

  const supabase = await createClient();

  if (input.id) {
    const { error } = await supabase.from('promotions').update(fields).eq('id', input.id);
    if (error) return { ok: false, error: describeWriteError(error) };

    await recordAudit('promotion.updated', { type: 'promotion', id: input.id }, fields);
    revalidatePath('/', 'layout');
    return { ok: true, data: { id: input.id } };
  }

  const { data, error } = await supabase
    .from('promotions')
    .insert(fields)
    .select('id')
    .maybeSingle();

  if (error || !data) return { ok: false, error: describeWriteError(error) };

  await recordAudit('promotion.created', { type: 'promotion', id: data.id }, fields);
  revalidatePath('/', 'layout');
  return { ok: true, data: { id: data.id } };
}

/** The fastest way to stop an offer that is pricing something wrongly. */
export async function setPromotionActive(id: string, isActive: boolean): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { error } = await supabase.from('promotions').update({ is_active: isActive }).eq('id', id);
  if (error) return { ok: false, error: describeWriteError(error) };

  await recordAudit(isActive ? 'promotion.activated' : 'promotion.deactivated', {
    type: 'promotion',
    id,
  });
  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}

/**
 * A promotion may be deleted outright, unlike catalog master data.
 *
 * Orders do not reference it: `order_items` stores the unit price and the
 * discount it was actually given, so the history stays intact after the rule
 * that produced it is gone (migration 0007).
 */
export async function deletePromotion(id: string): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { error } = await supabase.from('promotions').delete().eq('id', id);
  if (error) return { ok: false, error: describeWriteError(error) };

  await recordAudit('promotion.deleted', { type: 'promotion', id });
  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}
