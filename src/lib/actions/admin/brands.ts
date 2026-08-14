'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { brandSchema } from '@/lib/validation/admin-schemas';
import { slugify, uniquifySlug } from '@/lib/slug';
import type { ActionResult } from '../auth';
import { adminOrRefusal, describeWriteError, recordAudit } from './guard';

/** Brands (FR-053). */

export async function saveBrand(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const parsed = brandSchema.safeParse({
    id: formData.get('id') || undefined,
    name_ar: formData.get('name_ar'),
    name_en: formData.get('name_en'),
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
  const fields = { name_ar: input.name_ar, name_en: input.name_en, is_active: input.is_active };

  if (input.id) {
    const { error } = await supabase.from('brands').update(fields).eq('id', input.id);
    if (error) return { ok: false, error: describeWriteError(error) };

    await recordAudit('brand.updated', { type: 'brand', id: input.id });
    revalidatePath('/', 'layout');
    return { ok: true, data: { id: input.id } };
  }

  const base = slugify(input.name_en);
  if (!base) return { ok: false, error: 'adminErrors.slugUnavailable', field: 'name_en' };

  let attempt = await supabase
    .from('brands')
    .insert({ ...fields, slug: base })
    .select('id')
    .maybeSingle();

  if (attempt.error?.code === '23505') {
    attempt = await supabase
      .from('brands')
      .insert({ ...fields, slug: uniquifySlug(base) })
      .select('id')
      .maybeSingle();
  }

  if (attempt.error || !attempt.data) return { ok: false, error: describeWriteError(attempt.error) };

  await recordAudit('brand.created', { type: 'brand', id: attempt.data.id });
  revalidatePath('/', 'layout');
  return { ok: true, data: { id: attempt.data.id } };
}

export async function setBrandActive(id: string, isActive: boolean): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { error } = await supabase.from('brands').update({ is_active: isActive }).eq('id', id);
  if (error) return { ok: false, error: describeWriteError(error) };

  await recordAudit(isActive ? 'brand.activated' : 'brand.deactivated', { type: 'brand', id });
  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}

/** Refused while any product still carries the brand — deactivate instead (FR-061). */
export async function deleteBrand(id: string): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { error } = await supabase.from('brands').delete().eq('id', id);
  if (error) return { ok: false, error: describeWriteError(error) };

  await recordAudit('brand.deleted', { type: 'brand', id });
  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}
