import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getPromotionReport } from '@/lib/queries/reports';
import { rangeFromParams } from '@/lib/reports/range';
import { formatMoney, formatNumber } from '@/lib/money';
import { DateRangePicker } from '@/components/admin/DateRangePicker';
import { ReportTable } from '@/components/admin/ReportTable';
import type { Locale } from '@/i18n/routing';

/**
 * Promotion performance (T099, FR-076).
 *
 * Measured from the promotion recorded on each order line at the moment of
 * placement, not by re-running today's pricing rules against old orders. What a
 * customer was actually given is a fact; what they would be given now is a
 * guess, and a promotion edited since would rewrite its own history.
 */
export default async function PromotionsReportPage({
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

  const promotions = await getPromotionReport(range);

  return (
    <div className="flex flex-col gap-8">
      <DateRangePicker range={range} />

      <ReportTable
        title={t('promotionsReport')}
        rows={promotions}
        getRowKey={(row) => row.promotion_id}
        exportKey="promotions"
        range={range}
        note={t('promotionsFromPlacement')}
        columns={[
          {
            header: t('promotion'),
            cell: (row) => (activeLocale === 'ar' ? row.name_ar : row.name_en),
          },
          { header: t('orders'), cell: (row) => formatNumber(row.orders, activeLocale), numeric: true },
          {
            header: t('units'),
            cell: (row) => formatNumber(row.units_sold, activeLocale),
            numeric: true,
            hideOnMobile: true,
          },
          {
            header: t('discountGiven'),
            cell: (row) => formatMoney(row.discount_given, activeLocale),
            numeric: true,
          },
          {
            header: t('revenue'),
            cell: (row) => formatMoney(row.revenue, activeLocale),
            numeric: true,
          },
        ]}
      />
    </div>
  );
}
