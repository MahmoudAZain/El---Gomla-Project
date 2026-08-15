'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  savePromotion,
  setPromotionActive,
  deletePromotion,
} from '@/lib/actions/admin/promotions';
import { BilingualField } from './BilingualField';
import { Button } from '@/components/ui/Button';
import { Input, Select, FormError } from '@/components/ui/Field';
import { piastresToPounds } from '@/lib/money';
import type { AdminPromotionRow } from '@/lib/queries/admin';

/**
 * Promotions (FR-055).
 *
 * A promotion is a rule with a window, not a price written onto a product. It
 * starts and stops by itself — there is no job to run and no "end the sale"
 * button that someone must remember to press on Friday night.
 */

type Scope = 'catalog' | 'product' | 'category' | 'brand';

function scopeOf(promotion: AdminPromotionRow): Scope {
  if (promotion.product_id) return 'product';
  if (promotion.category_id) return 'category';
  if (promotion.brand_id) return 'brand';
  return 'catalog';
}

function scopeIdOf(promotion: AdminPromotionRow): string {
  return promotion.product_id ?? promotion.category_id ?? promotion.brand_id ?? '';
}

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time, not an ISO string. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function PromotionManager({
  promotions,
  products,
  categories,
  brands,
  locale,
}: {
  promotions: AdminPromotionRow[];
  products: { id: string; name_ar: string; name_en: string }[];
  categories: { id: string; name_ar: string; name_en: string }[];
  brands: { id: string; name_ar: string; name_en: string }[];
  locale: string;
}) {
  const t = useTranslations('admin');
  const tError = useTranslations();
  const router = useRouter();

  const [editing, setEditing] = useState<AdminPromotionRow | null>(null);
  const [scope, setScope] = useState<Scope>('catalog');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const label = (row: { name_ar: string; name_en: string }) =>
    locale === 'ar' ? row.name_ar : row.name_en;

  const targets = scope === 'product' ? products : scope === 'category' ? categories : brands;

  function startEdit(promotion: AdminPromotionRow | null) {
    setEditing(promotion);
    setScope(promotion ? scopeOf(promotion) : 'catalog');
    setDiscountType(promotion?.discount_type ?? 'percent');
    setError(null);
  }

  async function onSubmit(formData: FormData) {
    setBusy(true);
    setError(null);
    const result = await savePromotion(formData);
    if (result.ok) {
      startEdit(null);
      router.refresh();
    } else {
      setError(result.error);
    }
    setBusy(false);
  }

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    if (!result.ok) setError(result.error ?? 'adminErrors.saveFailed');
    setBusy(false);
    router.refresh();
  }

  const now = Date.now();

  return (
    <div className="flex flex-col gap-6">
      {error && <FormError>{tError(error)}</FormError>}

      <form
        action={onSubmit}
        key={editing?.id ?? 'new'}
        className="flex flex-col gap-4 rounded border border-rule bg-surface p-4"
      >
        <h2 className="text-sm font-semibold text-ink">
          {editing ? t('editPromotion') : t('newPromotion')}
        </h2>

        {editing && <input type="hidden" name="id" value={editing.id} />}

        <BilingualField
          name="name"
          label={t('promotionName')}
          defaultAr={editing?.name_ar}
          defaultEn={editing?.name_en}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id="discount_type"
            name="discount_type"
            label={t('discountType')}
            required
            value={discountType}
            onChange={(event) => setDiscountType(event.target.value as 'percent' | 'fixed')}
          >
            <option value="percent">{t('discountPercent')}</option>
            <option value="fixed">{t('discountFixed')}</option>
          </Select>

          <Input
            id="discount_value"
            name="discount_value"
            label={discountType === 'percent' ? t('percentOff') : t('poundsOff')}
            required
            inputMode="decimal"
            dir="ltr"
            defaultValue={
              editing
                ? editing.discount_type === 'percent'
                  ? String(editing.discount_value)
                  : piastresToPounds(editing.discount_value)
                : ''
            }
          />

          <Input
            id="starts_at"
            name="starts_at"
            label={t('startsAt')}
            required
            type="datetime-local"
            dir="ltr"
            defaultValue={editing ? toLocalInput(editing.starts_at) : ''}
          />

          <Input
            id="ends_at"
            name="ends_at"
            label={t('endsAt')}
            required
            type="datetime-local"
            dir="ltr"
            defaultValue={editing ? toLocalInput(editing.ends_at) : ''}
          />

          <Select
            id="scope"
            name="scope"
            label={t('appliesTo')}
            required
            value={scope}
            onChange={(event) => setScope(event.target.value as Scope)}
          >
            <option value="catalog">{t('scopeCatalog')}</option>
            <option value="product">{t('scopeProduct')}</option>
            <option value="category">{t('scopeCategory')}</option>
            <option value="brand">{t('scopeBrand')}</option>
          </Select>

          {scope !== 'catalog' && (
            <Select
              id="scope_id"
              name="scope_id"
              label={t('target')}
              hint={scope === 'category' ? t('categoryScopeHint') : undefined}
              required
              defaultValue={editing ? scopeIdOf(editing) : ''}
            >
              <option value="">{t('choose')}</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {label(target)}
                </option>
              ))}
            </Select>
          )}
        </div>

        <label className="flex min-h-touch items-center gap-2 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={editing?.is_active ?? true}
            className="size-5 accent-brand"
          />
          {t('promotionActive')}
        </label>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? t('saving') : t('save')}
          </Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={() => startEdit(null)}>
              {t('cancel')}
            </Button>
          )}
        </div>
      </form>

      <ul className="flex flex-col gap-2">
        {promotions.map((promotion) => {
          const starts = new Date(promotion.starts_at).getTime();
          const ends = new Date(promotion.ends_at).getTime();
          const live = promotion.is_active && now >= starts && now <= ends;
          const finished = now > ends;

          return (
            <li
              key={promotion.id}
              className={[
                'flex flex-col gap-2 rounded border p-3 sm:flex-row sm:items-center sm:justify-between',
                live ? 'border-brand bg-surface' : 'border-rule bg-surface-2',
              ].join(' ')}
            >
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-ink">{label(promotion)}</span>
                <span className="text-xs text-ink-3">
                  {promotion.discount_type === 'percent'
                    ? t('percentBadge', { value: promotion.discount_value })
                    : t('fixedBadge', { value: piastresToPounds(promotion.discount_value) })}
                  {' · '}
                  {t(`scope${scopeOf(promotion).charAt(0).toUpperCase()}${scopeOf(promotion).slice(1)}`)}
                </span>
                <span className="text-xs text-ink-3" dir="ltr">
                  {new Date(promotion.starts_at).toLocaleString()} →{' '}
                  {new Date(promotion.ends_at).toLocaleString()}
                </span>
                <span className="w-fit rounded bg-surface px-2 py-0.5 text-xs font-semibold text-ink-2">
                  {live ? t('promoLive') : finished ? t('promoEnded') : t('promoScheduled')}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => startEdit(promotion)}>
                  {t('edit')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => run(() => setPromotionActive(promotion.id, !promotion.is_active))}
                >
                  {promotion.is_active ? t('deactivate') : t('activate')}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={busy}
                  onClick={() => run(() => deletePromotion(promotion.id))}
                >
                  {t('delete')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
