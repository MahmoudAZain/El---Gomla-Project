import 'server-only';

import type { DateRange } from './range';
import { piastresToDecimal, type CsvColumn } from './csv';
import {
  getSalesByDay,
  getSalesByProduct,
  getSalesByCategory,
  getSalesByGovernorate,
  getCustomerReport,
  getPromotionReport,
  getLowStock,
  getProductMargin,
  getProfitByDay,
} from '@/lib/queries/reports';

/**
 * One definition per exportable report.
 *
 * **The export and the screen read the same function.** That is the entire
 * point of this file: a report whose download is assembled by different code
 * from its display will eventually disagree with it, and the owner will find
 * out while reconciling with an accountant (FR-081).
 *
 * Headers are bilingual — Arabic and English in one cell — because the file
 * lands on a desk where either might be read, and a second export in another
 * language is a second thing to keep in step.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- a registry of heterogeneous
   row shapes cannot be one generic type without erasing what each column knows;
   each entry below is internally consistent and checked at its own call site. */

export interface ReportDefinition {
  key: string;
  /** Admin-only reports are refused for staff by the database as well. */
  adminOnly: boolean;
  fetch: (range: DateRange) => Promise<any[]>;
  columns: CsvColumn<any>[];
}

const money = <T>(header: string, pick: (row: T) => number): CsvColumn<T> => ({
  header,
  // Decimal pounds, never piastres. A spreadsheet is read by a person.
  value: (row) => piastresToDecimal(pick(row)),
});

export const REPORTS: Record<string, ReportDefinition> = {
  sales: {
    key: 'sales',
    adminOnly: false,
    fetch: getSalesByDay,
    columns: [
      { header: 'اليوم / Day', value: (r) => r.day },
      { header: 'الطلبات / Orders', value: (r) => r.orders },
      money('الإيراد / Revenue', (r: any) => r.revenue),
      money('قيمة البضاعة / Goods', (r: any) => r.goods_revenue),
      money('رسوم التوصيل / Delivery', (r: any) => r.delivery_fees),
      money('الخصومات / Discounts', (r: any) => r.discounts),
    ],
  },

  products: {
    key: 'products',
    adminOnly: false,
    fetch: getSalesByProduct,
    columns: [
      { header: 'المنتج / Product (AR)', value: (r) => r.name_ar },
      { header: 'المنتج / Product (EN)', value: (r) => r.name_en },
      { header: 'الكمية / Units', value: (r) => r.units_sold },
      { header: 'عدد الطلبات / Orders', value: (r) => r.order_count },
      money('الإيراد / Revenue', (r: any) => r.revenue),
    ],
  },

  categories: {
    key: 'categories',
    adminOnly: false,
    fetch: getSalesByCategory,
    columns: [
      { header: 'القسم / Category (AR)', value: (r) => r.name_ar },
      { header: 'القسم / Category (EN)', value: (r) => r.name_en },
      { header: 'الكمية / Units', value: (r) => r.units_sold },
      money('الإيراد / Revenue', (r: any) => r.revenue),
    ],
  },

  governorates: {
    key: 'governorates',
    adminOnly: false,
    fetch: getSalesByGovernorate,
    columns: [
      { header: 'المحافظة / Governorate (AR)', value: (r) => r.name_ar },
      { header: 'المحافظة / Governorate (EN)', value: (r) => r.name_en },
      { header: 'الطلبات / Orders', value: (r) => r.orders },
      money('الإيراد / Revenue', (r: any) => r.revenue),
      money('رسوم التوصيل / Delivery', (r: any) => r.delivery_fees),
    ],
  },

  customers: {
    key: 'customers',
    adminOnly: false,
    fetch: getCustomerReport,
    columns: [
      { header: 'العميل / Customer', value: (r) => r.full_name },
      { header: 'الموبايل / Mobile', value: (r) => r.phone },
      { header: 'الطلبات / Orders', value: (r) => r.orders },
      money('الإجمالي / Total', (r: any) => r.revenue),
      { header: 'عميل جديد / New', value: (r) => r.is_new },
      { header: 'أول طلب / First order', value: (r) => r.first_order_at },
    ],
  },

  promotions: {
    key: 'promotions',
    adminOnly: false,
    fetch: getPromotionReport,
    columns: [
      { header: 'العرض / Promotion (AR)', value: (r) => r.name_ar },
      { header: 'العرض / Promotion (EN)', value: (r) => r.name_en },
      { header: 'الطلبات / Orders', value: (r) => r.orders },
      { header: 'الكمية / Units', value: (r) => r.units_sold },
      money('الخصم الممنوح / Discount given', (r: any) => r.discount_given),
      money('الإيراد / Revenue', (r: any) => r.revenue),
    ],
  },

  inventory: {
    key: 'inventory',
    adminOnly: false,
    // The threshold is generous for an export: the point of a stock file is to
    // reorder from it, and a hard cut at ten hides the item sitting at eleven.
    fetch: () => getLowStock(50),
    columns: [
      { header: 'المنتج / Product (AR)', value: (r) => r.name_ar },
      { header: 'المنتج / Product (EN)', value: (r) => r.name_en },
      { header: 'الكود / SKU', value: (r) => r.sku },
      { header: 'المخزون / Stock', value: (r) => r.stock_qty },
      { header: 'أقل كمية / Min order', value: (r) => r.min_order_qty },
      money('السعر / Price', (r: any) => r.price),
      { header: 'ظاهر / Active', value: (r) => r.is_active },
    ],
  },

  /**
   * Admin-only. The route checks the role, and `report_product_margin` raises
   * for anyone who is not an admin regardless — so a staff member who guesses
   * the URL is refused twice, by two independent mechanisms (FR-078).
   */
  margin: {
    key: 'margin',
    adminOnly: true,
    fetch: getProductMargin,
    columns: [
      { header: 'المنتج / Product (AR)', value: (r) => r.name_ar },
      { header: 'المنتج / Product (EN)', value: (r) => r.name_en },
      { header: 'الكمية / Units', value: (r) => r.units_sold },
      money('الإيراد / Revenue', (r: any) => r.revenue),
      money('التكلفة / Cost', (r: any) => r.cost_total),
      money('الربح / Margin', (r: any) => r.margin),
      { header: 'نسبة الربح / Margin %', value: (r) => r.margin_pct },
    ],
  },

  profit: {
    key: 'profit',
    adminOnly: true,
    fetch: getProfitByDay,
    columns: [
      { header: 'اليوم / Day', value: (r) => r.day },
      money('الإيراد / Revenue', (r: any) => r.revenue),
      money('التكلفة / Cost', (r: any) => r.cost_total),
      money('الربح الإجمالي / Gross profit', (r: any) => r.gross_profit),
    ],
  },
};

export function reportKeys(): string[] {
  return Object.keys(REPORTS);
}
