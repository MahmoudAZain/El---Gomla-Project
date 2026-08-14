'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/orders/StatusBadge';
import { formatMoney } from '@/lib/money';
import { ORDER_STATUSES } from '@/lib/order-status';
import type { QueueOrder } from '@/lib/queries/orders';
import type { Locale } from '@/i18n/routing';
import type { OrderStatus } from '@/types/database';

/**
 * The staff order queue (FR-058).
 *
 * Filters are submitted to the server rather than applied in the browser: the
 * list is capped and the shop will eventually have more orders than a page
 * should carry, so "which orders" has to be the database's question.
 *
 * It opens on the four states that still need someone — a queue showing three
 * months of delivered orders is a queue nobody looks at.
 */
export function OrderQueue({
  orders,
  governorates,
  initial,
  locale,
}: {
  orders: QueueOrder[];
  governorates: { id: string; name_ar: string; name_en: string }[];
  initial: { status: string; governorate: string; from: string; to: string; q: string };
  locale: Locale;
}) {
  const t = useTranslations('admin');
  const tOrders = useTranslations('orders');
  const router = useRouter();

  const [filters, setFilters] = useState(initial);
  const [applying, setApplying] = useState(false);

  function apply(next: typeof filters) {
    setApplying(true);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
    }
    router.push(`/${locale}/admin/orders?${params.toString()}`);
    router.refresh();
    setApplying(false);
  }

  function update(patch: Partial<typeof filters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  const control =
    'min-h-touch rounded border border-rule bg-surface px-3 text-base text-ink focus:border-brand focus:outline-none';

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply(filters);
        }}
        className="flex flex-col gap-3 rounded border border-rule bg-surface p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="q" className="text-sm font-semibold text-ink">
              {t('searchOrders')}
            </label>
            <input
              id="q"
              type="search"
              dir="ltr"
              value={filters.q}
              onChange={(event) => update({ q: event.target.value })}
              className={control}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="status" className="text-sm font-semibold text-ink">
              {t('status')}
            </label>
            <select
              id="status"
              value={filters.status}
              onChange={(event) => update({ status: event.target.value })}
              className={control}
            >
              <option value="open">{t('statusOpen')}</option>
              <option value="all">{t('statusAll')}</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {tOrders(`statuses.${status}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="governorate" className="text-sm font-semibold text-ink">
              {t('governorate')}
            </label>
            <select
              id="governorate"
              value={filters.governorate}
              onChange={(event) => update({ governorate: event.target.value })}
              className={control}
            >
              <option value="">{t('allOption')}</option>
              {governorates.map((governorate) => (
                <option key={governorate.id} value={governorate.id}>
                  {locale === 'ar' ? governorate.name_ar : governorate.name_en}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="from" className="text-sm font-semibold text-ink">
                {t('fromDate')}
              </label>
              <input
                id="from"
                type="date"
                dir="ltr"
                value={filters.from}
                onChange={(event) => update({ from: event.target.value })}
                className={control}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="to" className="text-sm font-semibold text-ink">
                {t('toDate')}
              </label>
              <input
                id="to"
                type="date"
                dir="ltr"
                value={filters.to}
                onChange={(event) => update({ to: event.target.value })}
                className={control}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={applying}>
            {t('applyFilters')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const cleared = { status: 'open', governorate: '', from: '', to: '', q: '' };
              setFilters(cleared);
              apply(cleared);
            }}
          >
            {t('clearFilters')}
          </Button>
        </div>
      </form>

      <p className="text-sm text-ink-3">{t('rowCount', { count: orders.length })}</p>

      {orders.length === 0 ? (
        <p className="rounded border border-rule bg-surface px-4 py-8 text-center text-ink-2">
          {t('noOrders')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/admin/orders/${order.id}`}
                className="flex flex-col gap-2 rounded border border-rule bg-surface p-3 transition-colors hover:border-brand sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-0.5">
                  {/* The reference stays left-to-right in both languages: it is
                      read out character by character over the phone. */}
                  <span className="font-bold text-ink tabular" dir="ltr">
                    {order.reference}
                  </span>
                  <span className="text-sm text-ink-2">{order.recipient_name}</span>
                  <span className="text-xs text-ink-3" dir="ltr">
                    {order.recipient_phone}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 text-sm sm:text-end">
                  <span className="text-ink-2">
                    {locale === 'ar' ? order.governorate_name_ar : order.governorate_name_en}
                  </span>
                  <span className="text-xs text-ink-3">
                    {new Date(order.placed_at).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG')}
                  </span>
                  <span className="text-xs text-ink-3">
                    {t('itemCount', { count: order.item_count })}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <StatusBadge status={order.status as OrderStatus} label={tOrders(`statuses.${order.status}`)} />
                  <span className="font-bold text-ink tabular">
                    {formatMoney(order.grand_total, locale)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
