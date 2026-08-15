import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  getSalesByDay,
  getSalesByProduct,
  getSalesByCategory,
  getSalesByGovernorate,
} from '@/lib/queries/reports';
import { rangeFromParams } from '@/lib/reports/range';
import { formatMoney, formatNumber } from '@/lib/money';
import { DateRangePicker } from '@/components/admin/DateRangePicker';
import { SalesChart } from '@/components/admin/SalesChart';
import { ReportTable } from '@/components/admin/ReportTable';
import type { Locale } from '@/i18n/routing';

/**
 * Sales, four ways (T097, FR-074).
 *
 * The same range sliced by day, product, category and governorate. Every one of
 * the four sums back to the same total — asserted in
 * `supabase/tests/reporting.test.sql` — which is what makes it safe to show
 * them on one page.
 */
export default async function SalesReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('reports');
  const activeLocale = locale as Locale;

  const one = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : undefined);
  const range = rangeFromParams({ from: one('from'), to: one('to') });

  const [byDay, byProduct, byCategory, byGovernorate] = await Promise.all([
    getSalesByDay(range),
    getSalesByProduct(range),
    getSalesByCategory(range),
    getSalesByGovernorate(range),
  ]);

  const name = (row: { name_ar: string; name_en: string }) =>
    activeLocale === 'ar' ? row.name_ar : row.name_en;

  const money = (value: number) => formatMoney(value, activeLocale);
  const count = (value: number) => formatNumber(value, activeLocale);

  return (
    <div className="flex flex-col gap-8">
      <DateRangePicker range={range} />

      <SalesChart
        points={byDay.map((row) => ({ day: row.day, revenue: row.revenue }))}
        locale={activeLocale}
        title={t('revenueByDay')}
      />

      <ReportTable
        title={t('byDay')}
        rows={byDay}
        getRowKey={(row) => row.day}
        exportKey="sales"
        range={range}
        excelColumns={[
          { header: t('day'), key: 'day' },
          { header: t('orders'), key: 'orders' },
          { header: t('revenue'), key: 'revenue', money: true },
          { header: t('goods'), key: 'goods_revenue', money: true },
          { header: t('deliveryFees'), key: 'delivery_fees', money: true },
        ]}
        columns={[
          { header: t('day'), cell: (row) => <span dir="ltr">{row.day}</span> },
          { header: t('orders'), cell: (row) => count(row.orders), numeric: true },
          { header: t('revenue'), cell: (row) => money(row.revenue), numeric: true },
          {
            header: t('goods'),
            cell: (row) => money(row.goods_revenue),
            numeric: true,
            hideOnMobile: true,
          },
          {
            header: t('deliveryFees'),
            cell: (row) => money(row.delivery_fees),
            numeric: true,
            hideOnMobile: true,
          },
        ]}
      />

      <ReportTable
        title={t('byProduct')}
        rows={byProduct}
        getRowKey={(row) => row.product_id}
        exportKey="products"
        range={range}
        note={t('productRevenueExcludesDelivery')}
        excelColumns={[
          { header: `${t('product')} (AR)`, key: 'name_ar' },
          { header: `${t('product')} (EN)`, key: 'name_en' },
          { header: t('units'), key: 'units_sold' },
          { header: t('orders'), key: 'order_count' },
          { header: t('revenue'), key: 'revenue', money: true },
        ]}
        columns={[
          { header: t('product'), cell: (row) => name(row) },
          { header: t('units'), cell: (row) => count(row.units_sold), numeric: true },
          {
            header: t('orders'),
            cell: (row) => count(row.order_count),
            numeric: true,
            hideOnMobile: true,
          },
          { header: t('revenue'), cell: (row) => money(row.revenue), numeric: true },
        ]}
      />

      <ReportTable
        title={t('byCategory')}
        rows={byCategory}
        getRowKey={(row) => row.category_id}
        exportKey="categories"
        range={range}
        note={t('categoryUsesCurrentCategory')}
        columns={[
          { header: t('category'), cell: (row) => name(row) },
          { header: t('units'), cell: (row) => count(row.units_sold), numeric: true },
          { header: t('revenue'), cell: (row) => money(row.revenue), numeric: true },
        ]}
      />

      <ReportTable
        title={t('byGovernorate')}
        rows={byGovernorate}
        getRowKey={(row) => row.governorate_id}
        exportKey="governorates"
        range={range}
        columns={[
          { header: t('governorate'), cell: (row) => name(row) },
          { header: t('orders'), cell: (row) => count(row.orders), numeric: true },
          { header: t('revenue'), cell: (row) => money(row.revenue), numeric: true },
          {
            header: t('deliveryFees'),
            cell: (row) => money(row.delivery_fees),
            numeric: true,
            hideOnMobile: true,
          },
        ]}
      />
    </div>
  );
}
