'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { categorySchema } from '@/lib/validation/admin-schemas';
import { slugify, uniquifySlug } from '@/lib/slug';
import type { ActionResult } from '../auth';
import { adminOrRefusal, describeWriteError, recordAudit } from './guard';

/**
 * Categories (FR-053).
 *
 * The tree is at most three levels deep and may not contain a cycle. Both are
 * enforced by a trigger in migration 0004, so this file does not re-check them
 * — it only turns the resulting exception into a sentence.
 */

/**
 * Master data changes what every visitor sees, so the whole tree is
 * revalidated rather than the handful of paths a change is believed to touch.
 * A stale category in the storefront navigation costs more than a rebuild.
 */
function revalidateCatalog() {
  revalidatePath('/', 'layout');
}

function readForm(formData: FormData) {
  return categorySchema.safeParse({
    id: formData.get('id') || undefined,
    name_ar: formData.get('name_ar'),
    name_en: formData.get('name_en'),
    parent_id: formData.get('parent_id') || null,
    sort_order: formData.get('sort_order') ?? 0,
    is_active: formData.get('is_active'),
  });
}

export async function saveCategory(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const parsed = readForm(formData);
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

  const fields = {
    name_ar: input.name_ar,
    name_en: input.name_en,
    parent_id: input.parent_id ?? null,
    sort_order: input.sort_order,
    is_active: input.is_active,
  };

  if (input.id) {
    // The slug is not updated with the name. It is in customers' links and in
    // WhatsApp messages already sent; renaming a category should not break them.
    const { error } = await supabase.from('categories').update(fields).eq('id', input.id);
    if (error) return { ok: false, error: describeWriteError(error) };

    await recordAudit('category.updated', { type: 'category', id: input.id });
    revalidateCatalog();
    return { ok: true, data: { id: input.id } };
  }

  const base = slugify(input.name_en);
  if (!base) return { ok: false, error: 'adminErrors.slugUnavailable', field: 'name_en' };

  const { data, error } = await supabase
    .from('categories')
    .insert({ ...fields, slug: base })
    .select('id')
    .maybeSingle();

  if (error?.code === '23505') {
    const retry = await supabase
      .from('categories')
      .insert({ ...fields, slug: uniquifySlug(base) })
      .select('id')
      .maybeSingle();

    if (retry.error || !retry.data) return { ok: false, error: describeWriteError(retry.error) };

    await recordAudit('category.created', { type: 'category', id: retry.data.id });
    revalidateCatalog();
    return { ok: true, data: { id: retry.data.id } };
  }

  if (error || !data) return { ok: false, error: describeWriteError(error) };

  await recordAudit('category.created', { type: 'category', id: data.id });
  revalidateCatalog();
  return { ok: true, data: { id: data.id } };
}

export async function setCategoryActive(id: string, isActive: boolean): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { error } = await supabase.from('categories').update({ is_active: isActive }).eq('id', id);
  if (error) return { ok: false, error: describeWriteError(error) };

  await recordAudit(isActive ? 'category.activated' : 'category.deactivated', {
    type: 'category',
    id,
  });
  revalidateCatalog();
  return { ok: true, data: undefined };
}

/**
 * Reordering.
 *
 * Sent as the whole ordered list rather than a pair of swapped rows: two staff
 * dragging at once then produce one winner instead of an interleaved order
 * nobody chose.
 */
export async function reorderCategories(ids: string[]): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const supabase = await createClient();

  for (const [index, id] of ids.entries()) {
    const { error } = await supabase.from('categories').update({ sort_order: index }).eq('id', id);
    if (error) return { ok: false, error: describeWriteError(error) };
  }

  revalidateCatalog();
  return { ok: true, data: undefined };
}

/**
 * Deletion, which usually will not happen — and should not (FR-061).
 *
 * `ON DELETE RESTRICT` on products and on child categories refuses to remove a
 * category anything still points at. That refusal is the point: an order's
 * history is evidence of what a customer bought, and it must not lose the
 * category it was filed under. The caller is told to deactivate instead.
 */
export async function deleteCategory(id: string): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) return { ok: false, error: describeWriteError(error) };

  await recordAudit('category.deleted', { type: 'category', id });
  revalidateCatalog();
  return { ok: true, data: undefined };
}
