'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cancelMyOrder } from '@/lib/actions/orders';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Field';

/**
 * Customer self-cancellation (FR-048, FR-050).
 *
 * Shown only while the order is still `submitted`. The database is what
 * actually decides — `set_order_status()` re-reads the status inside a row
 * lock — so the interesting case is the one this component cannot prevent:
 * staff confirm the order in the seconds between the page rendering and the
 * customer pressing the button.
 *
 * That is not an error to hide behind a generic message. The customer is told
 * plainly that the order has moved on and to call the shop, because by then
 * someone may be picking their basket.
 */
export function CancelOrder({ orderId }: { orderId: string }) {
  const t = useTranslations('orders');
  const tError = useTranslations();
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCancel() {
    setBusy(true);
    setError(null);

    const result = await cancelMyOrder(orderId);

    if (result.ok) {
      router.refresh();
      setConfirming(false);
    } else {
      setError(result.error);
      // The order moved on beneath them: close the prompt so the page can
      // re-render with the status it actually has now.
      setConfirming(false);
      router.refresh();
    }

    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <FormError>{tError(error)}</FormError>}

      {confirming ? (
        <div className="flex flex-col gap-3 rounded border border-danger bg-surface p-4">
          <p className="text-sm text-ink">{t('cancelConfirm')}</p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="danger" disabled={busy} onClick={onCancel}>
              {busy ? t('cancelling') : t('cancelYes')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              {t('cancelNo')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
            {t('cancelOrder')}
          </Button>
          <p className="text-xs text-ink-3">{t('cancelWindowHint')}</p>
        </div>
      )}
    </div>
  );
}
