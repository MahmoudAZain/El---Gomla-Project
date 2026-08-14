import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale, getFormatter } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getOrderById } from '@/lib/queries/orders';
import { OrderTransitions } from '@/components/admin/OrderTransitions';
import { StatusTimeline, type HistoryEntry } from '@/components/orders/StatusTimeline';
import { StatusBadge } from '@/components/orders/StatusBadge';
import { formatMoney, formatNumber } from '@/lib/money';
import type { Locale } from '@/i18n/routing';
import type { OrderStatus } from '@/types/database';

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const order = await getOrderById(id);
  if (!order) notFound();

  const t = await getTranslations('admin');
  const tOrders = await getTranslations('orders');
  const tCart = await getTranslations('cart');
  const tCommon = await getTranslations('common');
  const format = await getFormatter();

  const activeLocale = locale as Locale;
  const isArabic = activeLocale === 'ar';

  const items = order.order_items as {
    id: string;
    product_name_ar: string;
    product_name_en: string;
    pack_size: string | null;
    qty: number;
    unit_price: number;
    unit_discount: number;
    line_total: number;
  }[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-2xl font-bold text-ink tabular" dir="ltr">
            {order.reference}
          </span>
          <span className="text-sm text-ink-3">
            {format.dateTime(new Date(order.placed_at), 'full')}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge
            status={order.status as OrderStatus}
            label={tOrders(`statuses.${order.status}`)}
          />
          <Link
            href="/admin/orders"
            className="flex min-h-touch items-center rounded border border-rule px-3 text-sm font-semibold text-ink-2 hover:border-brand hover:text-brand"
          >
            {t('backToQueue')}
          </Link>
        </div>
      </div>

      <OrderTransitions orderId={order.id} status={order.status as OrderStatus} />

      <section className="grid gap-4 sm:grid-cols-2">
        {/*
          The landmark is given its own line and its own emphasis rather than
          being buried in the address block. It is the field the driver actually
          navigates by — an Egyptian street address without one is frequently
          not findable at all (FR-007, FR-049).
        */}
        <div className="flex flex-col gap-1 rounded border border-rule bg-surface p-4 text-sm">
          <h2 className="mb-1 font-bold text-ink">{t('deliveryDetails')}</h2>
          <p className="text-ink">{order.recipient_name}</p>
          <p className="text-ink-2" dir="ltr">
            {order.recipient_phone}
          </p>
          <p className="mt-2 text-ink-2">{order.street_address}</p>
          {order.building && <p className="text-ink-2">{order.building}</p>}
          {order.floor_apartment && <p className="text-ink-2">{order.floor_apartment}</p>}

          <p className="mt-2 rounded bg-brand-soft px-3 py-2 font-semibold text-brand">
            {t('landmarkLabel')}: {order.landmark}
          </p>

          <p className="mt-2 text-ink-2">
            {isArabic ? order.governorate_name_ar : order.governorate_name_en}
          </p>

          {order.customer_note && (
            <p className="mt-2 rounded bg-surface-2 px-3 py-2 text-ink-2">
              {t('customerNote')}: {order.customer_note}
            </p>
          )}
        </div>

        <dl className="flex flex-col gap-2 rounded border border-rule bg-surface p-4 text-sm">
          <h2 className="mb-1 font-bold text-ink">{tCart('total')}</h2>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-2">{tCart('subtotal')}</dt>
            <dd className="tabular font-semibold text-ink">
              {formatMoney(order.subtotal, activeLocale)}
            </dd>
          </div>
          {order.discount_total > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">{tCart('discount')}</dt>
              <dd className="tabular font-semibold text-sale">
                −{formatMoney(order.discount_total, activeLocale)}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-ink-2">{tCart('deliveryFee')}</dt>
            <dd className="tabular font-semibold text-ink">
              {formatMoney(order.delivery_fee, activeLocale)}
            </dd>
          </div>
          <div className="mt-1 flex justify-between gap-4 border-t border-rule pt-2 text-base">
            <dt className="font-bold text-ink">{tCart('total')}</dt>
            <dd className="tabular font-bold text-ink">
              {formatMoney(order.grand_total, activeLocale)}
            </dd>
          </div>
          {/*
            The amount the driver collects, stated plainly. It is the order's
            own stored total, not a figure recomputed from today's prices or
            today's delivery fee — those may have changed since.
          */}
          <p className="mt-2 rounded bg-surface-2 px-3 py-2 text-xs font-semibold text-ink-2">
            {tCommon('cashOnDelivery')}
          </p>
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">{tOrders('items')}</h2>
        <ul className="divide-y divide-rule rounded border border-rule bg-surface">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4 p-3">
              <div>
                <p className="font-semibold text-ink">
                  {isArabic ? item.product_name_ar : item.product_name_en}
                </p>
                {item.pack_size && <p className="text-xs text-ink-3">{item.pack_size}</p>}
                <p className="text-sm text-ink-2 tabular">
                  {formatNumber(item.qty, activeLocale)} ×{' '}
                  {formatMoney(item.unit_price - item.unit_discount, activeLocale)}
                </p>
              </div>
              <span className="font-bold text-ink tabular">
                {formatMoney(item.line_total, activeLocale)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">{tOrders('timeline')}</h2>
        <StatusTimeline history={order.order_status_history as HistoryEntry[]} showActor />
      </section>
    </div>
  );
}
