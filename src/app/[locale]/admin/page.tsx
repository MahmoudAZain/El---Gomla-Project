import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getOrderCounts } from '@/lib/queries/orders';
import { ORDER_STATUSES, OPEN_STATUSES } from '@/lib/order-status';
import { formatNumber } from '@/lib/money';
import type { Locale } from '@/i18n/routing';

/**
 * The console dashboard (T082).
 *
 * Order counts by state, and nothing else. Revenue and margin belong to Stage 6
 * with the reports that explain them; a number on a dashboard with no way to
 * ask "which ones?" is a number staff learn to ignore.
 *
 * Every count is a link into the queue already filtered to that state, because
 * seeing "7 submitted" and then having to go and filter for them is the worst
 * of both.
 */
const SECTIONS = [
  { href: '/admin/products', key: 'products' },
  { href: '/admin/categories', key: 'categories' },
  { href: '/admin/brands', key: 'brands' },
  { href: '/admin/promotions', key: 'promotions' },
  { href: '/admin/governorates', key: 'delivery' },
  { href: '/admin/staff', key: 'staff' },
] as const;

export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const tOrders = await getTranslations('orders');
  const counts = await getOrderCounts();

  const openTotal = OPEN_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-ink">{t('ordersToday')}</h2>
          <Link href="/admin/orders" className="text-sm font-semibold text-brand">
            {t('openQueue')}
          </Link>
        </div>

        <Link
          href="/admin/orders?status=open"
          className="flex items-center justify-between gap-4 rounded border border-brand bg-brand-soft p-4 transition-colors hover:border-brand-hover"
        >
          <span className="font-semibold text-brand">{t('needsAttention')}</span>
          <span className="text-2xl font-bold text-brand tabular">
            {formatNumber(openTotal, locale as Locale)}
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
                  {formatNumber(counts[status] ?? 0, locale as Locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">{t('masterData')}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="flex flex-col gap-1 rounded border border-rule bg-surface p-4 transition-colors hover:border-brand"
              >
                <span className="font-semibold text-ink">{t(section.key)}</span>
                <span className="text-sm text-ink-3">{t(`${section.key}Blurb`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
