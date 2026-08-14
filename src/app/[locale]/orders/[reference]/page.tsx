import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale, getLocale, getFormatter } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getOrderByReference } from '@/lib/queries/orders';
import { getCurrentProfile } from '@/lib/actions/auth';
import { formatMoney, formatNumber } from '@/lib/money';
import { StatusTimeline, type HistoryEntry } from '@/components/orders/StatusTimeline';
import { CancelOrder } from '@/components/orders/CancelOrder';
import { customerMayCancel } from '@/lib/order-status';
import type { Locale } from '@/i18n/routing';
import type { OrderStatus } from '@/types/database';

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const { locale, reference } = await params;
  const { placed } = await searchParams;
  setRequestLocale(locale);

  const profile = await getCurrentProfile();
  if (!profile) redirect(`/${locale}/login?next=/orders/${reference}`);

  // RLS decides whether this row is visible. Another customer's reference
  // simply returns nothing — which reaches the customer as "not found" rather
  // than "forbidden", so the page cannot be used to discover that an order
  // exists (FR-062).
  const order = await getOrderByReference(reference);
  if (!order) notFound();

  const t = await getTranslations('orders');
  const tc = await getTranslations('orderConfirmation');
  const tCart = await getTranslations('cart');
  const tCommon = await getTranslations('common');
  const activeLocale = (await getLocale()) as Locale;
  const format = await getFormatter();
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

  const justPlaced = placed === '1';

  // The database decides this too, under a row lock. Hiding the control once
  // the order has moved on spares the customer a refusal they cannot act on
  // (FR-048).
  const mayCancel = customerMayCancel(order.status as OrderStatus);

  return (
    <div className="flex flex-col gap-6">
      {justPlaced && (
        <div className="flex flex-col gap-2 rounded border border-brand bg-brand-soft p-5">
          <h1 className="text-xl font-bold text-brand">{tc('title')}</h1>
          <p className="text-ink-2">{tc('willCall')}</p>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <p className="text-sm text-ink-3">{tc('reference')}</p>
        {/* The reference stays left-to-right in both languages: it is read out
            character by character over the phone, and mirroring it would have
            staff and customer reading different things (research R14). */}
        <p className="text-2xl font-bold text-ink tabular" dir="ltr">
          {order.reference}
        </p>
        {justPlaced && <p className="text-sm text-ink-3">{tc('referenceHint')}</p>}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded bg-surface-2 px-3 py-1.5 text-sm font-semibold text-ink">
          {t(`statuses.${order.status}`)}
        </span>
        <span className="text-sm text-ink-3">
          {format.dateTime(new Date(order.placed_at), 'full')}
        </span>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">{t('items')}</h2>
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

      <section className="flex flex-col gap-3 sm:flex-row sm:gap-6">
        <dl className="flex flex-1 flex-col gap-2 rounded border border-rule bg-surface p-4 text-sm">
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
          <p className="mt-2 rounded bg-surface-2 px-3 py-2 text-xs font-semibold text-ink-2">
            {tCommon('cashOnDelivery')}
          </p>
        </dl>

        <div className="flex-1 rounded border border-rule bg-surface p-4 text-sm">
          <h2 className="mb-2 font-bold text-ink">{t('deliveryTo')}</h2>
          <p className="text-ink">{order.recipient_name}</p>
          <p className="text-ink-2" dir="ltr">
            {order.recipient_phone}
          </p>
          <p className="mt-2 text-ink-2">{order.street_address}</p>
          <p className="text-ink-2">{order.landmark}</p>
          <p className="text-ink-2">
            {isArabic ? order.governorate_name_ar : order.governorate_name_en}
          </p>
        </div>
      </section>

      {/* The history is what settles a dispute, so the customer sees the same
          log staff do — nothing here is hidden from them (FR-047). */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">{t('timeline')}</h2>
        <StatusTimeline history={order.order_status_history as HistoryEntry[]} />
      </section>

      {mayCancel && <CancelOrder orderId={order.id} />}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/orders"
          className="flex min-h-touch items-center rounded border border-rule px-4 font-semibold text-ink"
        >
          {tc('viewOrders')}
        </Link>
        <Link
          href="/"
          className="flex min-h-touch items-center rounded bg-brand px-4 font-semibold text-on-brand"
        >
          {tc('keepShopping')}
        </Link>
      </div>
    </div>
  );
}
