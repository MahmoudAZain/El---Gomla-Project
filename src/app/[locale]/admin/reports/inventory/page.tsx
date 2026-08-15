import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getLowStock, getStockValuation } from '@/lib/queries/reports';
import { rangeFromParams } from '@/lib/reports/range';
import { requireAdmin } from '@/lib/actions/admin/guard';
import { formatMoney, formatNumber } from '@/lib/money';
import { ReportTable } from '@/components/admin/ReportTable';
import { StatTile } from '@/components/admin/StatTile';
import type { Locale } from '@/i18n/routing';

/**
 * Inventory (T100, FR-077).
 *
 * Low stock is a staff report — it is a reordering list, and the people who
 * reorder are the people who pick. **Stock valuation is not**: it is the cost
 * table in aggregate, and it appears only for an admin. `report_stock_valuation`
 * raises for anyone else regardless of what this page renders.
 *
 * The range picker is absent by design. Stock is a fact about right now, not
 * about a period, and offering a date range here would imply the system can
 * answer "what was stock in March" — which it cannot, because stock levels are
 * not historised.
 */
export default async function InventoryReportPage({
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
  // Only used to keep the export link's shape consistent with the other reports.
  const range = rangeFromParams({ from: one('from'), to: one('to') });

  const isAdmin = (await requireAdmin()) !== null;
  const [lowStock, valuation] = await Promise.all([
    getLowStock(50),
    isAdmin ? getStockValuation() : Promise.resolve(null),
  ]);

  const outOfStock = lowStock.filter((row) => row.stock_qty === 0).length;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label={t('outOfStock')}
          value={formatNumber(outOfStock, activeLocale)}
          tone={outOfStock > 0 ? 'warning' : 'default'}
        />
        <StatTile label={t('lowStockCount')} value={formatNumber(lowStock.length, activeLocale)} />

        {valuation && (
          <StatTile
            label={t('stockAtCost')}
            value={formatMoney(valuation.cost_value, activeLocale)}
            hint={t('adminOnlyFigure')}
            tone="quiet"
          />
        )}
      </div>

      {valuation && (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile
            label={t('stockAtRetail')}
            value={formatMoney(valuation.retail_value, activeLocale)}
            tone="quiet"
          />
          <StatTile
            label={t('unitsInStock')}
            value={formatNumber(valuation.units_in_stock, activeLocale)}
            tone="quiet"
          />
        </div>
      )}

      <ReportTable
        title={t('lowStock')}
        rows={lowStock}
        getRowKey={(row) => row.product_id}
        exportKey="inventory"
        range={range}
        note={t('lowStockThreshold')}
        columns={[
          { header: t('product'), cell: (row) => (activeLocale === 'ar' ? row.name_ar : row.name_en) },
          {
            header: t('sku'),
            cell: (row) => <span dir="ltr">{row.sku}</span>,
            hideOnMobile: true,
          },
          {
            header: t('stock'),
            cell: (row) => (
              <span className={row.stock_qty === 0 ? 'font-semibold text-danger' : undefined}>
                {formatNumber(row.stock_qty, activeLocale)}
              </span>
            ),
            numeric: true,
          },
          {
            header: t('price'),
            cell: (row) => formatMoney(row.price, activeLocale),
            numeric: true,
            hideOnMobile: true,
          },
          {
            header: t('visible'),
            cell: (row) => (row.is_active ? t('yes') : t('no')),
            hideOnMobile: true,
          },
        ]}
      />
    </div>
  );
}
