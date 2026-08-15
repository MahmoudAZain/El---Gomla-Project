import { createClient } from '@/lib/supabase/server';
import { clientEnv } from '@/lib/env';

/**
 * Storefront reads.
 *
 * Every one of these uses the anon key with RLS in force. Inactive products,
 * future promotions and other customers' data are invisible at the database
 * level — not because these queries filter them out, but because the policies
 * do (Principle II). The `is_active` filters below are for index selectivity,
 * not for security.
 */

export interface ListedProduct {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  unit: string;
  pack_size: string | null;
  units_per_carton: number | null;
  weight_grams: number | null;
  storage: string;
  stock_qty: number;
  min_order_qty: number;
  category_id: string;
  brand_id: string | null;
  base_price: number;
  effective_price: number;
  discount_amount: number;
  promotion_id: string | null;
  photo_path: string | null;
  category_slug: string;
  category_name_ar: string;
  category_name_en: string;
  brand_slug: string | null;
  brand_name_ar: string | null;
  brand_name_en: string | null;
}

export interface CategoryNode {
  id: string;
  parent_id: string | null;
  name_ar: string;
  name_en: string;
  slug: string;
  sort_order: number;
  children: CategoryNode[];
}

/** Product photos are public objects, so this is a plain URL — no signing, and
 *  Cloudflare caches it rather than Supabase serving it repeatedly. */
export function publicImageUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  if (storagePath.startsWith('http')) return storagePath;
  const { NEXT_PUBLIC_SUPABASE_URL } = clientEnv();
  return `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${storagePath}`;
}

export async function getCategoryTree(): Promise<CategoryNode[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('categories')
    .select('id, parent_id, name_ar, name_en, slug, sort_order')
    .order('sort_order');

  const rows = data ?? [];
  const byId = new Map<string, CategoryNode>(
    rows.map((r) => [r.id, { ...r, children: [] as CategoryNode[] }]),
  );

  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function getCategoryBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('categories')
    .select('id, parent_id, name_ar, name_en, slug')
    .eq('slug', slug)
    .maybeSingle();
  return data;
}

/**
 * Products in a category *and everything beneath it* — opening "Dairy" shows
 * the yoghurt, not an empty shelf (FR-018).
 */
export async function getProductsInCategory(
  categoryId: string,
  { page = 1, perPage = 24 }: { page?: number; perPage?: number } = {},
): Promise<{ products: ListedProduct[]; total: number }> {
  const supabase = await createClient();

  const { data: descendants } = await supabase.rpc('descendant_categories', {
    p_category_id: categoryId,
  });

  const ids = (descendants ?? []).map((d: { category_id: string }) => d.category_id);
  if (ids.length === 0) return { products: [], total: 0 };

  const from = (page - 1) * perPage;
  const { data, count } = await supabase
    .from('product_listing')
    .select('*', { count: 'exact' })
    .in('category_id', ids)
    .eq('is_active', true)
    .order('name_ar')
    .range(from, from + perPage - 1);

  return { products: (data ?? []) as ListedProduct[], total: count ?? 0 };
}

/**
 * Bilingual search (FR-019).
 *
 * One round trip: `search_product_listing` returns the same shape a category
 * grid renders, so a result carries its price, discount and photo without a
 * follow-up query per product (migration 0016).
 *
 * Matching is trigram over a normalized column rather than full-text, because
 * Postgres ships no Arabic dictionary and `simple` matches whole tokens only —
 * which fails on the partial words shoppers actually type. Normalization folds
 * alef and ta-marbuta variants and strips diacritics on both sides of the
 * comparison, so مياه and مياة find each other (research R10).
 */
export async function searchProducts(
  query: string,
  { page = 1, perPage = 24 }: { page?: number; perPage?: number } = {},
): Promise<{ products: ListedProduct[]; total: number }> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { products: [], total: 0 };

  const supabase = await createClient();

  const [results, count] = await Promise.all([
    supabase.rpc('search_product_listing', {
      p_query: trimmed,
      p_limit: perPage,
      p_offset: (page - 1) * perPage,
    }),
    supabase.rpc('count_search_results', { p_query: trimmed }),
  ]);

  return {
    products: (results.data ?? []) as ListedProduct[],
    total: Number(count.data ?? 0),
  };
}

export async function getProductBySlug(slug: string): Promise<ListedProduct | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('product_listing')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  return (data as ListedProduct) ?? null;
}

export async function getProductPhotos(productId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('product_photos')
    .select('id, storage_path, alt_ar, alt_en, is_primary, sort_order')
    .eq('product_id', productId)
    .order('is_primary', { ascending: false })
    .order('sort_order');
  return data ?? [];
}

/** Currently discounted products, for the home page and the offers page. */
export async function getDiscountedProducts(limit = 12): Promise<ListedProduct[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('product_listing')
    .select('*')
    .eq('is_active', true)
    .gt('discount_amount', 0)
    .order('discount_amount', { ascending: false })
    .limit(limit);
  return (data ?? []) as ListedProduct[];
}

export async function getNewestProducts(limit = 12): Promise<ListedProduct[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('product_listing')
    .select('*')
    .eq('is_active', true)
    .limit(limit);
  return (data ?? []) as ListedProduct[];
}

/**
 * Only the governorates currently served. The other 22 are seeded and waiting
 * for a fee and a minimum, and must not be offered until then (FR-056b).
 */
export async function getActiveGovernorates() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('governorates')
    .select('id, name_ar, name_en, delivery_fee, min_order_value')
    .eq('is_active', true)
    .order('sort_order');
  return data ?? [];
}

export async function getMyAddresses() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('addresses')
    .select(
      'id, street_address, landmark, building, floor_apartment, is_default, governorate_id, governorates(id, name_ar, name_en, delivery_fee, min_order_value, is_active)',
    )
    .order('is_default', { ascending: false });
  return data ?? [];
}
