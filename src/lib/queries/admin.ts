import { createClient } from '@/lib/supabase/server';
import type {
  DiscountType,
  Governorate,
  StorageType,
  UnitType,
  UserRole,
} from '@/types/database';

/**
 * Reads for the staff console.
 *
 * Every one of these uses the caller's own session, so a customer who reaches
 * an admin URL gets empty results from the database itself rather than from a
 * check in this file. Cost prices are the sole exception and are never selected
 * here — they come from `get_product_cost()`, which refuses a non-admin outright
 * instead of returning nothing (FR-063).
 */

export interface AdminProductRow {
  id: string;
  name_ar: string;
  name_en: string;
  slug: string;
  sku: string;
  price: number;
  stock_qty: number;
  is_active: boolean;
  unit: UnitType;
  category: { id: string; name_ar: string; name_en: string } | null;
  brand: { id: string; name_ar: string; name_en: string } | null;
}

export interface AdminCategoryRow {
  id: string;
  parent_id: string | null;
  name_ar: string;
  name_en: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  product_count: number;
}

export interface AdminBrandRow {
  id: string;
  name_ar: string;
  name_en: string;
  slug: string;
  is_active: boolean;
}

export interface AdminPromotionRow {
  id: string;
  name_ar: string;
  name_en: string;
  discount_type: DiscountType;
  discount_value: number;
  starts_at: string;
  ends_at: string;
  product_id: string | null;
  category_id: string | null;
  brand_id: string | null;
  is_active: boolean;
}

export interface AdminStaffRow {
  id: string;
  full_name: string;
  phone: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface AdminProductDetail {
  id: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  slug: string;
  sku: string;
  barcode: string | null;
  price: number;
  unit: UnitType;
  storage: StorageType;
  pack_size: string | null;
  units_per_carton: number | null;
  weight_grams: number | null;
  stock_qty: number;
  min_order_qty: number;
  category_id: string;
  brand_id: string | null;
  is_active: boolean;
}

export async function listAdminProducts(): Promise<AdminProductRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('products')
    .select(
      `id, name_ar, name_en, slug, sku, price, stock_qty, is_active, unit,
       category:categories!products_category_id_fkey (id, name_ar, name_en),
       brand:brands!products_brand_id_fkey (id, name_ar, name_en)`,
    )
    .order('updated_at', { ascending: false })
    .limit(500);

  return (data ?? []) as unknown as AdminProductRow[];
}

export async function getAdminProduct(id: string): Promise<AdminProductDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('products')
    .select(
      `id, name_ar, name_en, description_ar, description_en, slug, sku, barcode, price,
       unit, storage, pack_size, units_per_carton, weight_grams, stock_qty, min_order_qty,
       category_id, brand_id, is_active`,
    )
    .eq('id', id)
    .maybeSingle();

  return (data as AdminProductDetail) ?? null;
}

/**
 * The cost price for one product, for the admin form.
 *
 * Returns `null` for "no cost recorded" *and* for "you may not see this" —
 * the distinction is the RPC's to make, and it makes it by raising. Any staff
 * member who is not an admin gets an exception, which surfaces here as `null`
 * and as an absent field on the form (FR-059).
 */
export async function getProductCost(
  productId: string,
): Promise<{ cost_price: number; supplier_name: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_product_cost', { p_product_id: productId });

  if (error || !data || data.length === 0) return null;
  return { cost_price: data[0].cost_price, supplier_name: data[0].supplier_name };
}

export async function listAdminCategories(): Promise<AdminCategoryRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('categories')
    .select('id, parent_id, name_ar, name_en, slug, sort_order, is_active, products(count)')
    .order('sort_order');

  return (data ?? []).map((row) => {
    const { products, ...rest } = row as typeof row & { products: { count: number }[] };
    return { ...rest, product_count: products?.[0]?.count ?? 0 } as AdminCategoryRow;
  });
}

export async function listAdminBrands(): Promise<AdminBrandRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('brands')
    .select('id, name_ar, name_en, slug, is_active')
    .order('name_en');

  return (data ?? []) as AdminBrandRow[];
}

export async function listAdminPromotions(): Promise<AdminPromotionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('promotions')
    .select(
      'id, name_ar, name_en, discount_type, discount_value, starts_at, ends_at, product_id, category_id, brand_id, is_active',
    )
    .order('starts_at', { ascending: false });

  return (data ?? []) as AdminPromotionRow[];
}

/**
 * All 27 governorates, served and unserved alike.
 *
 * The storefront asks for active ones only; this console must show every one,
 * because the point of the screen is to decide which become active and what
 * they cost (FR-056, FR-056a).
 */
export async function listAllGovernorates(): Promise<Governorate[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('governorates')
    .select('*')
    .order('is_active', { ascending: false })
    .order('sort_order');

  return (data ?? []) as Governorate[];
}

export async function listStaffAccounts(): Promise<AdminStaffRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role, is_active, created_at')
    .neq('role', 'customer')
    .order('created_at', { ascending: false });

  return (data ?? []) as AdminStaffRow[];
}

/** Recent privileged actions, newest first — admin-only by policy. */
export async function listRecentAudit(limit = 50) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('admin_audit_log')
    .select('id, action, target_type, target_id, detail, created_at, actor:profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  return data ?? [];
}

export async function getProductPhotosForAdmin(productId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('product_photos')
    .select('id, storage_path, thumb_path, alt_ar, alt_en, is_primary, sort_order')
    .eq('product_id', productId)
    .order('is_primary', { ascending: false })
    .order('sort_order');

  return data ?? [];
}
