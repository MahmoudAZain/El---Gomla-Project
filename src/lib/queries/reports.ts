import { createClient } from '@/lib/supabase/server';
import type { DateRange } from '@/lib/reports/range';

/**
 * Report reads.
 *
 * Each of these is one RPC call. The functions behind them check the caller
 * themselves and raise for anyone who should not be there, so a refusal arrives
 * here as an error rather than as an empty array — which is the distinction
 * that makes "no sales" and "not allowed" tellable apart (FR-078, SC-018).
 *
 * The admin-only reads return `null` on refusal so a page can render without
 * them; the screens that use them are already behind an admin check, so a null
 * there means something has gone wrong rather than that permission is missing.
 */

export interface ReportSummary {
  orders_placed: number;
  orders_delivered: number;
  orders_cancelled: number;
  orders_returned: number;
  revenue: number;
  goods_revenue: number;
  delivery_fees: number;
  discounts_given: number;
  units_sold: number;
  avg_order_value: number;
  customers_served: number;
}

export interface SalesByDay {
  day: string;
  orders: number;
  revenue: number;
  goods_revenue: number;
  delivery_fees: number;
  discounts: number;
}

export interface SalesByProduct {
  product_id: string;
  name_ar: string;
  name_en: string;
  units_sold: number;
  revenue: number;
  order_count: number;
}

export interface SalesByCategory {
  category_id: string;
  name_ar: string;
  name_en: string;
  units_sold: number;
  revenue: number;
}

export interface SalesByGovernorate {
  governorate_id: string;
  name_ar: string;
  name_en: string;
  orders: number;
  revenue: number;
  delivery_fees: number;
}

export interface CustomerRow {
  profile_id: string;
  full_name: string;
  phone: string;
  orders: number;
  revenue: number;
  first_order_at: string;
  last_order_at: string;
  is_new: boolean;
}

export interface PromotionRow {
  promotion_id: string;
  name_ar: string;
  name_en: string;
  orders: number;
  units_sold: number;
  discount_given: number;
  revenue: number;
}

export interface LowStockRow {
  product_id: string;
  name_ar: string;
  name_en: string;
  sku: string;
  stock_qty: number;
  min_order_qty: number;
  price: number;
  is_active: boolean;
}

export interface MarginRow {
  product_id: string;
  name_ar: string;
  name_en: string;
  units_sold: number;
  revenue: number;
  cost_total: number;
  margin: number;
  margin_pct: number;
}

export interface ProfitByDay {
  day: string;
  revenue: number;
  cost_total: number;
  gross_profit: number;
}

export interface StockValuation {
  products_counted: number;
  units_in_stock: number;
  cost_value: number;
  retail_value: number;
}

async function callRange<T>(fn: string, range: DateRange): Promise<T[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { p_from: range.from, p_to: range.to });
  if (error) return [];
  return (data ?? []) as T[];
}

/** The summary is a single row; an empty range still returns zeroes, not null. */
export async function getSummary(range: DateRange): Promise<ReportSummary | null> {
  const rows = await callRange<ReportSummary>('report_summary', range);
  return rows[0] ?? null;
}

export const getSalesByDay = (range: DateRange) =>
  callRange<SalesByDay>('report_sales_by_day', range);

export const getSalesByProduct = (range: DateRange) =>
  callRange<SalesByProduct>('report_sales_by_product', range);

export const getSalesByCategory = (range: DateRange) =>
  callRange<SalesByCategory>('report_sales_by_category', range);

export const getSalesByGovernorate = (range: DateRange) =>
  callRange<SalesByGovernorate>('report_sales_by_governorate', range);

export const getCustomerReport = (range: DateRange) =>
  callRange<CustomerRow>('report_customers', range);

export const getPromotionReport = (range: DateRange) =>
  callRange<PromotionRow>('report_promotions', range);

export async function getLowStock(threshold = 10): Promise<LowStockRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('report_low_stock', { p_threshold: threshold });
  if (error) return [];
  return (data ?? []) as LowStockRow[];
}

/**
 * Admin-only reads.
 *
 * The RPC raises for a staff member rather than returning nothing, and that
 * error surfaces here as `null`. The screens behind these are already gated, so
 * a null is a fault to notice rather than a permission to work around.
 */
export const getProductMargin = (range: DateRange) =>
  callRange<MarginRow>('report_product_margin', range);

export const getProfitByDay = (range: DateRange) =>
  callRange<ProfitByDay>('report_profit_by_day', range);

export async function getStockValuation(): Promise<StockValuation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('report_stock_valuation');
  if (error || !data) return null;
  return (data as StockValuation[])[0] ?? null;
}
