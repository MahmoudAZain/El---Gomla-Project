'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { saveGovernorateBatch } from '@/lib/actions/admin/governorates';
import { piastresToPounds } from '@/lib/money';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Field';
import type { Governorate } from '@/types/database';

/**
 * Delivery pricing for all 27 governorates (FR-056, FR-056a).
 *
 * **Every number on this screen is editable, at any time, with no deployment.**
 * The fee, the minimum order value and whether the governorate is served at all
 * are data, not constants — the application contains no hard-coded delivery
 * price and no hard-coded list of served districts. "Cairo and Giza at launch"
 * is two `is_active` flags, and expanding to a third district is a fee, a
 * minimum and a toggle typed here.
 *
 * A change takes effect on the next cart priced. Orders already placed keep the
 * fee they were quoted, because `orders` snapshots it at placement — so a fee
 * raised at noon never changes what a driver collects for a morning order.
 *
 * The whole grid saves at once. A fuel increase moves every fee on the same
 * day, and pressing Save 27 times is how half a price list ends up applied.
 */

interface Row {
  id: string;
  name_ar: string;
  name_en: string;
  delivery_fee: string;
  min_order_value: string;
  is_active: boolean;
}

function toRow(governorate: Governorate): Row {
  return {
    id: governorate.id,
    name_ar: governorate.name_ar,
    name_en: governorate.name_en,
    // Staff read and type pounds; storage stays integer piastres.
    delivery_fee: piastresToPounds(governorate.delivery_fee),
    min_order_value: piastresToPounds(governorate.min_order_value),
    is_active: governorate.is_active,
  };
}

export function GovernoratePricing({ governorates }: { governorates: Governorate[] }) {
  const t = useTranslations('admin');
  const tError = useTranslations();
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>(governorates.map(toRow));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const original = new Map(governorates.map((g) => [g.id, toRow(g)]));

  const changed = rows.filter((row) => {
    const before = original.get(row.id);
    return (
      before &&
      (before.delivery_fee !== row.delivery_fee ||
        before.min_order_value !== row.min_order_value ||
        before.is_active !== row.is_active)
    );
  });

  function update(id: string, patch: Partial<Row>) {
    setSavedCount(null);
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function onSave() {
    if (changed.length === 0) return;

    setSaving(true);
    setError(null);

    const result = await saveGovernorateBatch(
      changed.map((row) => ({
        id: row.id,
        delivery_fee: row.delivery_fee,
        min_order_value: row.min_order_value,
        is_active: row.is_active,
      })),
    );

    if (result.ok) {
      setSavedCount(result.data.updated);
      router.refresh();
    } else {
      setError(result.error);
    }

    setSaving(false);
  }

  const cell =
    'w-28 min-h-touch rounded border border-rule bg-surface px-2 text-base text-ink tabular focus:border-brand focus:outline-none';

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded border border-rule bg-surface-2 px-4 py-3 text-sm text-ink-2">
        {t('governorateHelp')}
      </p>

      {error && <FormError>{tError(error)}</FormError>}

      {savedCount !== null && (
        <p role="status" className="rounded border border-brand bg-surface px-4 py-3 text-sm text-brand">
          {t('governoratesSaved', { count: savedCount })}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className={[
              'flex flex-col gap-3 rounded border p-3 sm:flex-row sm:items-end sm:justify-between',
              // An inactive governorate is dimmed and outlined differently, so
              // staff can see at a glance where delivery actually runs without
              // reading 27 checkboxes (FR-056a).
              row.is_active ? 'border-rule bg-surface' : 'border-dashed border-rule-strong bg-surface-2',
            ].join(' ')}
          >
            <div className="flex min-w-40 flex-col">
              <span className={row.is_active ? 'font-semibold text-ink' : 'font-semibold text-ink-3'}>
                {row.name_ar}
              </span>
              <span className="text-xs text-ink-3" dir="ltr">
                {row.name_en}
              </span>
              {!row.is_active && (
                <span className="mt-1 w-fit rounded bg-surface px-2 py-0.5 text-xs text-ink-3">
                  {t('notDelivering')}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor={`fee-${row.id}`} className="text-xs font-semibold text-ink-3">
                  {t('deliveryFeeEgp')}
                </label>
                <input
                  id={`fee-${row.id}`}
                  inputMode="decimal"
                  dir="ltr"
                  value={row.delivery_fee}
                  onChange={(event) => update(row.id, { delivery_fee: event.target.value })}
                  className={cell}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={`min-${row.id}`} className="text-xs font-semibold text-ink-3">
                  {t('minOrderEgp')}
                </label>
                <input
                  id={`min-${row.id}`}
                  inputMode="decimal"
                  dir="ltr"
                  value={row.min_order_value}
                  onChange={(event) => update(row.id, { min_order_value: event.target.value })}
                  className={cell}
                />
              </div>

              <label className="flex min-h-touch items-center gap-2 text-sm font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={row.is_active}
                  onChange={(event) => update(row.id, { is_active: event.target.checked })}
                  className="size-5 accent-brand"
                />
                {t('delivering')}
              </label>
            </div>
          </li>
        ))}
      </ul>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-rule bg-paper py-3">
        <Button type="button" size="lg" onClick={onSave} disabled={saving || changed.length === 0}>
          {saving ? t('saving') : t('saveChangedRows', { count: changed.length })}
        </Button>
        {changed.length > 0 && <span className="text-sm text-ink-3">{t('unsavedChanges')}</span>}
      </div>
    </div>
  );
}
