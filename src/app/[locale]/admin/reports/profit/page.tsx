import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getProductMargin, getProfitByDay } from '@/lib/queries/reports';
import { rangeFromParams } from '@/lib/reports/range';
import { requireAdmin } from '@/lib/actions/admin/guard';
import { formatMoney, formatNumber } from '@/lib/money';
import { DateRangePicker } from '@/components/admin/DateRangePicker';
import { ReportTable } from '@/components/admin/ReportTable';
import { StatTile } from '@/components/admin/StatTile';
import type { Locale } from '@/i18n/routing';

/**
 * Margin and profit — administrators only (T101, FR-078).
 *
 * Three independent things keep this from an ordinary staff member: the tab is
 * not rendered for them, this page redirects them, and
 * `report_product_margin()` raises if they call it anyway. Only the third is a
 * guarantee; the first two exist so the refusal is never the thing that teaches
 * them the screen exists.
 *
 * The page says on its face that margin uses the product's **current** cost.
 * That is the only cost the system stores, and a cost that moved after a sale
 * makes these figures approximate — an approximate number presented as exact is
 * how a business misprices a line.
 */
export default async function ProfitReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);

  const identity = await requireAdmin();
  if (!identity) redirect(`/${locale}/admin/reports/sales`);

  const t = await getTranslations('reports');
  const activeLocale = locale as Locale;

  const one = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : undefined);
  const range = rangeFromParams({ from: one('from'), to: one('to') });

  const [byProduct, byDay] = await Promise.all([getProductMargin(range), getProfitByDay(range)]);

  const totals = byDay.reduce(
    (sum, row) => ({
      revenue: sum.revenue + row.revenue,
      cost: sum.cost + row.cost_total,
      profit: sum.profit + row.gross_profit,
    }),
    { revenue: 0, cost: 0, profit: 0 },
  );

  const marginPct =
    totals.revenue > 0 ? Math.round((totals.profit / totals.revenue) * 1000) / 10 : 0;

  return (
    <div className="flex flex-col gap-8">
      <DateRangePicker range={range} />

      <p className="rounded border border-rule bg-surface-2 px-4 py-3 text-sm text-ink-2">
        {t('marginUsesCurrentCost')}
      </p>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label={t('goods')} value={formatMoney(totals.revenue, activeLocale)} />
        <StatTile label={t('costOfGoods')} value={formatMoney(totals.cost, activeLocale)} tone="quiet" />
        <StatTile label={t('grossProfit')} value={formatMoney(totals.profit, activeLocale)} />
        <StatTile
          label={t('marginPct')}
          value={`${formatNumber(marginPct, activeLocale)}%`}
          tone="quiet"
        />
      </div>

      <ReportTable
        title={t('profitByDay')}
        rows={byDay}
        getRowKey={(row) => row.day}
        exportKey="profit"
        range={range}
        columns={[
          { header: t('day'), cell: (row) => <span dir="ltr">{row.day}</span> },
          { header: t('goods'), cell: (row) => formatMoney(row.revenue, activeLocale), numeric: true },
          {
            header: t('costOfGoods'),
            cell: (row) => formatMoney(row.cost_total, activeLocale),
            numeric: true,
            hideOnMobile: true,
          },
          {
            header: t('grossProfit'),
            cell: (row) => formatMoney(row.gross_profit, activeLocale),
            numeric: true,
          },
        ]}
      />

      <ReportTable
        title={t('marginByProduct')}
        rows={byProduct}
        getRowKey={(row) => row.product_id}
        exportKey="margin"
        range={range}
        note={t('missingCostCountsAsZero')}
        columns={[
          { header: t('product'), cell: (row) => (activeLocale === 'ar' ? row.name_ar : row.name_en) },
          {
            header: t('units'),
            cell: (row) => formatNumber(row.units_sold, activeLocale),
            numeric: true,
            hideOnMobile: true,
          },
          { header: t('revenue'), cell: (row) => formatMoney(row.revenue, activeLocale), numeric: true },
          {
            header: t('costOfGoods'),
            cell: (row) => formatMoney(row.cost_total, activeLocale),
            numeric: true,
            hideOnMobile: true,
          },
          { header: t('margin'), cell: (row) => formatMoney(row.margin, activeLocale), numeric: true },
          {
            header: t('marginPct'),
            cell: (row) => `${formatNumber(row.margin_pct, activeLocale)}%`,
            numeric: true,
          },
        ]}
      />
    </div>
  );
}
