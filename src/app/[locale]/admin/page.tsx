import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getOrderCounts } from '@/lib/queries/orders';
import {
  getSummary,
  getSalesByDay,
  getSalesByProduct,
  getLowStock,
} from '@/lib/queries/reports';
import { rangeFromParams } from '@/lib/reports/range';
import { ORDER_STATUSES, OPEN_STATUSES } from '@/lib/order-status';
import { formatMoney, formatNumber } from '@/lib/money';
import { DateRangePicker } from '@/components/admin/DateRangePicker';
import { StatTile, HeroFigure } from '@/components/admin/StatTile';
import { SalesChart } from '@/components/admin/SalesChart';
import type { Locale } from '@/i18n/routing';

/**
 * The console dashboard (T094, FR-070).
 *
 * One question, answered above the fold: what did we take, and what still needs
 * doing. Everything else on the page is a way into a report that explains one
 * of those two numbers.
 *
 * Revenue leads because it is the number the owner opens the page for, and it
 * is the one figure allowed to be a hero. The order counts beneath it are
 * operational rather than financial, and are sized accordingly.
 */
const SECTIONS = [
  { href: '/admin/reports/sales', key: 'salesReport' },
  { href: '/admin/reports/customers', key: 'customersReport' },
  { href: '/admin/reports/promotions', key: 'promotionsReport' },
  { href: '/admin/reports/inventory', key: 'inventoryReport' },
] as const;

export default async function AdminHome({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const tr = await getTranslations('reports');
  const tOrders = await getTranslations('orders');

  const activeLocale = locale as Locale;
  const one = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : undefined);
  const range = rangeFromParams({ from: one('from'), to: one('to') });

  const [counts, summary, byDay, byProduct, lowStock] = await Promise.all([
    getOrderCounts(),
    getSummary(range),
    getSalesByDay(range),
    getSalesByProduct(range),
    getLowStock(10),
  ]);

  const openTotal = OPEN_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
  const topProducts = byProduct.slice(0, 5);

  const productName = (row: { name_ar: string; name_en: string }) =>
    activeLocale === 'ar' ? row.name_ar : row.name_en;

  return (
    <div className="flex flex-col gap-8">
      <DateRangePicker range={range} />

      <section className="flex flex-col gap-3">
        <HeroFigure
          label={tr('revenueInRange')}
          value={formatMoney(summary?.revenue ?? 0, activeLocale)}
          hint={tr('revenueIsDelivered')}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label={tr('ordersDelivered')}
            value={formatNumber(summary?.orders_delivered ?? 0, activeLocale)}
          />
          <StatTile
            label={tr('averageOrder')}
            value={formatMoney(summary?.avg_order_value ?? 0, activeLocale)}
          />
          <StatTile
            label={tr('customersServed')}
            value={formatNumber(summary?.customers_served ?? 0, activeLocale)}
          />
          <StatTile
            label={tr('unitsSold')}
            value={formatNumber(summary?.units_sold ?? 0, activeLocale)}
          />
          <StatTile
            label={tr('deliveryFees')}
            value={formatMoney(summary?.delivery_fees ?? 0, activeLocale)}
            tone="quiet"
          />
          <StatTile
            label={tr('discountsGiven')}
            value={formatMoney(summary?.discounts_given ?? 0, activeLocale)}
            tone="quiet"
          />
          <StatTile
            label={tr('ordersPlaced')}
            value={formatNumber(summary?.orders_placed ?? 0, activeLocale)}
            tone="quiet"
            hint={tr('placedNotDelivered')}
          />
          <StatTile
            label={tr('ordersCancelled')}
            value={formatNumber(summary?.orders_cancelled ?? 0, activeLocale)}
            tone="quiet"
          />
        </div>
      </section>

      <SalesChart
        points={byDay.map((row) => ({ day: row.day, revenue: row.revenue }))}
        locale={activeLocale}
        title={tr('revenueByDay')}
      />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">{tr('topProducts')}</h2>
            <Link href="/admin/reports/sales" className="text-sm font-semibold text-brand">
              {tr('seeAll')}
            </Link>
          </div>

          {topProducts.length === 0 ? (
            <p className="rounded border border-rule bg-surface px-4 py-6 text-center text-sm text-ink-2">
              {tr('noSalesInRange')}
            </p>
          ) : (
            <ul className="divide-y divide-rule rounded border border-rule bg-surface">
              {topProducts.map((row) => (
                <li key={row.product_id} className="flex items-center justify-between gap-3 p-3">
                  <span className="text-sm text-ink">{productName(row)}</span>
                  <span className="flex flex-col items-end">
                    <span className="text-sm font-semibold text-ink tabular">
                      {formatMoney(row.revenue, activeLocale)}
                    </span>
                    <span className="text-xs text-ink-3 tabular">
                      {tr('unitsCount', { count: row.units_sold })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">{tr('lowStock')}</h2>
            <Link href="/admin/reports/inventory" className="text-sm font-semibold text-brand">
              {tr('seeAll')}
            </Link>
          </div>

          {lowStock.length === 0 ? (
            <p className="rounded border border-rule bg-surface px-4 py-6 text-center text-sm text-ink-2">
              {tr('nothingLow')}
            </p>
          ) : (
            <ul className="divide-y divide-rule rounded border border-rule bg-surface">
              {lowStock.slice(0, 5).map((row) => (
                <li key={row.product_id} className="flex items-center justify-between gap-3 p-3">
                  <span className="flex flex-col">
                    <span className="text-sm text-ink">{productName(row)}</span>
                    <span className="text-xs text-ink-3" dir="ltr">
                      {row.sku}
                    </span>
                  </span>
                  <span
                    className={[
                      'text-sm font-semibold tabular',
                      row.stock_qty === 0 ? 'text-danger' : 'text-ink',
                    ].join(' ')}
                  >
                    {formatNumber(row.stock_qty, activeLocale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">{t('ordersToday')}</h2>
          <Link href="/admin/orders" className="text-sm font-semibold text-brand">
            {t('openQueue')}
          </Link>
        </div>

        <Link
          href="/admin/orders?status=open"
          className="flex items-center justify-between gap-4 rounded border border-rule bg-surface p-4 transition-colors hover:border-brand"
        >
          <span className="font-semibold text-ink">{t('needsAttention')}</span>
          <span className="text-xl font-bold text-ink">
            {formatNumber(openTotal, activeLocale)}
          </span>
        </Link>

        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ORDER_STATUSES.map((status) => (
            <li key={status}>
              <Link
                href={`/admin/orders?status=${status}`}
                className="flex items-center justify-between gap-3 rounded border border-rule bg-surface p-3 transition-colors hover:border-brand"
              >
                <span className="text-sm text-ink-2">{tOrders(`statuses.${status}`)}</span>
                <span className="font-bold text-ink tabular">
                  {formatNumber(counts[status] ?? 0, activeLocale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ink">{tr('reports')}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <Link
                href={`${section.href}?from=${range.from}&to=${range.to}`}
                className="flex flex-col gap-1 rounded border border-rule bg-surface p-4 transition-colors hover:border-brand"
              >
                <span className="font-semibold text-ink">{tr(section.key)}</span>
                <span className="text-sm text-ink-3">{tr(`${section.key}Blurb`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
