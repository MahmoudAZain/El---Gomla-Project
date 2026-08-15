'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { transitionOrder } from '@/lib/actions/orders';
import { STAFF_TRANSITIONS } from '@/lib/order-status';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Field';
import type { OrderStatus } from '@/types/database';

/**
 * Moving an order along (FR-045, FR-049).
 *
 * Only the legal next states are offered. That list is a copy of the table in
 * `set_order_status()`, which re-checks it under a row lock — so a button this
 * component gets wrong is refused, never obeyed. The copy exists to spare staff
 * an error they could not have avoided, not to decide anything.
 *
 * The note is optional and travels into the history entry. In practice it is
 * where "customer asked to deliver after 6pm" and "no answer, third attempt"
 * end up, which is exactly what the next person to touch the order needs.
 */
export function OrderTransitions({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const t = useTranslations('admin');
  const tOrders = useTranslations('orders');
  const tError = useTranslations();
  const router = useRouter();

  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<OrderStatus | null>(null);

  const next = STAFF_TRANSITIONS[status];

  if (next.length === 0) {
    return (
      <p className="rounded border border-rule bg-surface-2 px-4 py-3 text-sm text-ink-2">
        {t('orderTerminal', { status: tOrders(`statuses.${status}`) })}
      </p>
    );
  }

  async function run(target: OrderStatus) {
    setBusy(true);
    setError(null);

    const result = await transitionOrder(orderId, target, note);

    if (result.ok) {
      setNote('');
      setConfirming(null);
      router.refresh();
    } else {
      setError(result.error);
    }

    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-rule bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">{t('moveOrder')}</h2>

      {error && <FormError>{tError(error)}</FormError>}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="transition-note" className="text-sm font-semibold text-ink">
          {t('transitionNote')}
        </label>
        <textarea
          id="transition-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('transitionNotePlaceholder')}
          className="w-full rounded border border-rule bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {next.map((target) => {
          // Cancelling is the one transition that cannot be undone by another
          // transition, so it asks twice. The rest are reversible by moving on.
          const destructive = target === 'cancelled' || target === 'returned';

          if (confirming === target) {
            return (
              <span key={target} className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-ink-2">
                  {t('confirmTransition', { status: tOrders(`statuses.${target}`) })}
                </span>
                <Button type="button" variant="danger" disabled={busy} onClick={() => run(target)}>
                  {t('yesDoIt')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirming(null)}>
                  {t('cancel')}
                </Button>
              </span>
            );
          }

          return (
            <Button
              key={target}
              type="button"
              variant={destructive ? 'danger' : 'primary'}
              disabled={busy}
              onClick={() => (destructive ? setConfirming(target) : run(target))}
            >
              {tOrders(`statuses.${target}`)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
