'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { productSchema } from '@/lib/validation/admin-schemas';
import { slugify, uniquifySlug } from '@/lib/slug';
import type { ActionResult } from '../auth';
import { adminOrRefusal, describeWriteError, recordAudit } from './guard';

/**
 * Products (FR-051, FR-054, FR-057, FR-059).
 *
 * Two things here are worth stating outright:
 *
 *   1. **The selling price is written to `products`; the cost price is not.**
 *      It goes through `set_product_cost()`, which refuses anyone who is not an
 *      admin. Ordinary staff can run the catalog all day and never touch the
 *      margin sheet (FR-063).
 *   2. **A missing name in either language is refused three times over** — by
 *      the form, by the schema, and by a NOT NULL constraint. FR-057 asks for a
 *      guarantee, and only the third of those is one.
 */

const BUCKET = 'product-images';

function readForm(formData: FormData) {
  return productSchema.safeParse({
    id: formData.get('id') || undefined,
    name_ar: formData.get('name_ar'),
    name_en: formData.get('name_en'),
    description_ar: formData.get('description_ar') ?? '',
    description_en: formData.get('description_en') ?? '',
    category_id: formData.get('category_id'),
    brand_id: formData.get('brand_id') || null,
    price: formData.get('price'),
    cost_price: formData.get('cost_price') ?? '',
    supplier_name: formData.get('supplier_name') ?? '',
    unit: formData.get('unit'),
    storage: formData.get('storage'),
    pack_size: formData.get('pack_size') ?? '',
    units_per_carton: formData.get('units_per_carton') || null,
    weight_grams: formData.get('weight_grams') || null,
    barcode: formData.get('barcode') ?? '',
    sku: formData.get('sku'),
    stock_qty: formData.get('stock_qty') ?? 0,
    min_order_qty: formData.get('min_order_qty') ?? 1,
    is_active: formData.get('is_active'),
  });
}

export async function saveProduct(formData: FormData): Promise<ActionResult<{ id: string }>> {
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
    description_ar: input.description_ar || null,
    description_en: input.description_en || null,
    category_id: input.category_id,
    brand_id: input.brand_id ?? null,
    price: input.price,
    unit: input.unit,
    storage: input.storage,
    pack_size: input.pack_size || null,
    units_per_carton: input.units_per_carton ?? null,
    weight_grams: input.weight_grams ?? null,
    barcode: input.barcode || null,
    sku: input.sku,
    stock_qty: input.stock_qty,
    min_order_qty: input.min_order_qty,
    is_active: input.is_active,
  };

  let productId: string;

  if (input.id) {
    productId = input.id;
    const { error } = await supabase.from('products').update(fields).eq('id', productId);
    if (error) return { ok: false, error: describeWriteError(error) };
  } else {
    const base = slugify(input.name_en);
    if (!base) return { ok: false, error: 'adminErrors.slugUnavailable', field: 'name_en' };

    let attempt = await supabase
      .from('products')
      .insert({ ...fields, slug: base })
      .select('id')
      .maybeSingle();

    // A duplicate slug is worth one retry. A duplicate SKU or barcode is a real
    // data-entry conflict and is reported rather than worked around.
    if (attempt.error?.code === '23505' && (attempt.error.message ?? '').includes('slug')) {
      attempt = await supabase
        .from('products')
        .insert({ ...fields, slug: uniquifySlug(base) })
        .select('id')
        .maybeSingle();
    }

    if (attempt.error || !attempt.data) return { ok: false, error: describeWriteError(attempt.error) };
    productId = attempt.data.id;
  }

  // The cost price is a second, independent write. If it fails the product is
  // still correct — a product with no cost recorded is a normal state, and the
  // alternative (rolling back a good product because the margin sheet was
  // refused) helps nobody.
  if (input.cost_price !== undefined) {
    const { error: costError } = await supabase.rpc('set_product_cost', {
      p_product_id: productId,
      p_cost_price: input.cost_price,
      p_supplier: input.supplier_name || null,
    });

    if (costError) {
      return {
        ok: false,
        error: describeWriteError(costError),
        field: 'cost_price',
      };
    }
  }

  await recordAudit(input.id ? 'product.updated' : 'product.created', {
    type: 'product',
    id: productId,
  });

  revalidatePath('/', 'layout');
  return { ok: true, data: { id: productId } };
}

export async function setProductActive(id: string, isActive: boolean): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { error } = await supabase.from('products').update({ is_active: isActive }).eq('id', id);
  if (error) return { ok: false, error: describeWriteError(error) };

  await recordAudit(isActive ? 'product.activated' : 'product.deactivated', { type: 'product', id });
  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}

/**
 * Deletion is refused once the product appears on any order (FR-061).
 *
 * `order_items` references it with `ON DELETE RESTRICT`, so the database says
 * no and staff are told to deactivate. A deleted product would tear a line out
 * of an order a customer has already received.
 */
export async function deleteProduct(id: string): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) return { ok: false, error: describeWriteError(error) };

  await recordAudit('product.deleted', { type: 'product', id });
  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}

/**
 * Stores one photo.
 *
 * The blobs arrive already resized to WebP by the browser (`lib/image-resize`),
 * because a Worker has roughly 10 ms of CPU and cannot re-encode a phone photo
 * in it (research R12). This action only files what it is given.
 */
export async function uploadProductPhoto(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const productId = String(formData.get('product_id') ?? '');
  const full = formData.get('full');
  const thumb = formData.get('thumb');

  if (!productId || !(full instanceof File) || !(thumb instanceof File)) {
    return { ok: false, error: 'adminErrors.invalidInput' };
  }

  const supabase = await createClient();
  const key = crypto.randomUUID();
  const fullPath = `${productId}/${key}.webp`;
  const thumbPath = `${productId}/${key}-thumb.webp`;

  const uploadFull = await supabase.storage
    .from(BUCKET)
    .upload(fullPath, full, { contentType: 'image/webp', upsert: false });
  if (uploadFull.error) return { ok: false, error: 'adminErrors.uploadFailed' };

  const uploadThumb = await supabase.storage
    .from(BUCKET)
    .upload(thumbPath, thumb, { contentType: 'image/webp', upsert: false });
  if (uploadThumb.error) {
    await supabase.storage.from(BUCKET).remove([fullPath]);
    return { ok: false, error: 'adminErrors.uploadFailed' };
  }

  const { count } = await supabase
    .from('product_photos')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId);

  const { data, error } = await supabase
    .from('product_photos')
    .insert({
      product_id: productId,
      storage_path: fullPath,
      thumb_path: thumbPath,
      sort_order: count ?? 0,
      // The first photo of a product is its primary one without anybody having
      // to choose. A product whose grid tile is blank looks discontinued.
      is_primary: (count ?? 0) === 0,
    })
    .select('id')
    .maybeSingle();

  if (error || !data) {
    // Storage and Postgres are not one transaction. Removing the objects keeps
    // the free-tier gigabyte from filling with files no row points at.
    await supabase.storage.from(BUCKET).remove([fullPath, thumbPath]);
    return { ok: false, error: describeWriteError(error) };
  }

  revalidatePath('/', 'layout');
  return { ok: true, data: { id: data.id } };
}

export async function deleteProductPhoto(photoId: string): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { data: photo } = await supabase
    .from('product_photos')
    .select('id, product_id, storage_path, thumb_path, is_primary')
    .eq('id', photoId)
    .maybeSingle();

  if (!photo) return { ok: false, error: 'adminErrors.notFound' };

  const { error } = await supabase.from('product_photos').delete().eq('id', photoId);
  if (error) return { ok: false, error: describeWriteError(error) };

  await supabase.storage
    .from(BUCKET)
    .remove([photo.storage_path, photo.thumb_path].filter((p): p is string => Boolean(p)));

  // Removing the primary photo must not leave the product without one.
  if (photo.is_primary) {
    const { data: next } = await supabase
      .from('product_photos')
      .select('id')
      .eq('product_id', photo.product_id)
      .order('sort_order')
      .limit(1)
      .maybeSingle();

    if (next) {
      await supabase.from('product_photos').update({ is_primary: true }).eq('id', next.id);
    }
  }

  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}

/**
 * A unique partial index allows one primary photo per product, so the old one
 * is cleared before the new one is set — the reverse order collides.
 */
export async function setPrimaryPhoto(productId: string, photoId: string): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const supabase = await createClient();

  const cleared = await supabase
    .from('product_photos')
    .update({ is_primary: false })
    .eq('product_id', productId)
    .eq('is_primary', true);
  if (cleared.error) return { ok: false, error: describeWriteError(cleared.error) };

  const { error } = await supabase
    .from('product_photos')
    .update({ is_primary: true })
    .eq('id', photoId);
  if (error) return { ok: false, error: describeWriteError(error) };

  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}

export async function reorderProductPhotos(photoIds: string[]): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  for (const [index, id] of photoIds.entries()) {
    const { error } = await supabase
      .from('product_photos')
      .update({ sort_order: index })
      .eq('id', id);
    if (error) return { ok: false, error: describeWriteError(error) };
  }

  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}
