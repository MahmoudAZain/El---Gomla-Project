import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getOrderQueue } from '@/lib/queries/orders';
import { listAllGovernorates } from '@/lib/queries/admin';
import { OrderQueue } from '@/components/admin/OrderQueue';
import { OPEN_STATUSES, ORDER_STATUSES } from '@/lib/order-status';
import type { Locale } from '@/i18n/routing';

/**
 * The staff queue (FR-058).
 *
 * Filters live in the URL rather than in component state, so a shift handover
 * is a pasted link — "the Giza ones still waiting" is a thing one person can
 * send another.
 */
export default async function AdminOrdersPage({
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

  const one = (key: string) => {
    const value = query[key];
    return typeof value === 'string' ? value : '';
  };

  const status = one('status') || 'open';
  const governorate = one('governorate');
  const from = one('from');
  const to = one('to');
  const q = one('q');

  const statuses =
    status === 'open'
      ? OPEN_STATUSES
      : status === 'all'
        ? undefined
        : ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])
          ? [status]
          : OPEN_STATUSES;

  const [orders, governorates] = await Promise.all([
    getOrderQueue({
      statuses,
      governorateId: governorate || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      // A date filter means the whole of that day, not midnight at its start.
      to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
      search: q || undefined,
    }),
    listAllGovernorates(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-ink">{t('orders')}</h2>

      <OrderQueue
        orders={orders}
        governorates={governorates.map(({ id, name_ar, name_en }) => ({ id, name_ar, name_en }))}
        initial={{ status, governorate, from, to, q }}
        locale={locale as Locale}
      />
    </div>
  );
}
