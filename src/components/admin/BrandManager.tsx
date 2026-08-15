'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { saveBrand, setBrandActive, deleteBrand } from '@/lib/actions/admin/brands';
import { BilingualField } from './BilingualField';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Field';
import type { AdminBrandRow } from '@/lib/queries/admin';

/** Brands (FR-053). Simpler than categories: a flat list with no hierarchy. */
export function BrandManager({ brands, locale }: { brands: AdminBrandRow[]; locale: string }) {
  const t = useTranslations('admin');
  const tError = useTranslations();
  const router = useRouter();

  const [editing, setEditing] = useState<AdminBrandRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const label = (row: { name_ar: string; name_en: string }) =>
    locale === 'ar' ? row.name_ar : row.name_en;

  async function onSubmit(formData: FormData) {
    setBusy(true);
    setError(null);
    const result = await saveBrand(formData);
    if (result.ok) {
      setEditing(null);
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

  return (
    <div className="flex flex-col gap-6">
      {error && <FormError>{tError(error)}</FormError>}

      <form
        action={onSubmit}
        key={editing?.id ?? 'new'}
        className="flex flex-col gap-4 rounded border border-rule bg-surface p-4"
      >
        <h2 className="text-sm font-semibold text-ink">{editing ? t('editBrand') : t('newBrand')}</h2>

        {editing && <input type="hidden" name="id" value={editing.id} />}

        <BilingualField
          name="name"
          label={t('brandName')}
          defaultAr={editing?.name_ar}
          defaultEn={editing?.name_en}
        />

        <label className="flex min-h-touch items-center gap-2 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={editing?.is_active ?? true}
            className="size-5 accent-brand"
          />
          {t('visibleInShop')}
        </label>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? t('saving') : t('save')}
          </Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              {t('cancel')}
            </Button>
          )}
        </div>
      </form>

      <ul className="flex flex-col gap-2">
        {brands.map((brand) => (
          <li
            key={brand.id}
            className={[
              'flex flex-col gap-2 rounded border p-3 sm:flex-row sm:items-center sm:justify-between',
              brand.is_active ? 'border-rule bg-surface' : 'border-dashed border-rule-strong bg-surface-2',
            ].join(' ')}
          >
            <div className="flex flex-col">
              <span className={brand.is_active ? 'font-semibold text-ink' : 'font-semibold text-ink-3'}>
                {label(brand)}
              </span>
              {!brand.is_active && <span className="text-xs text-ink-3">{t('hidden')}</span>}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(brand)}>
                {t('edit')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => run(() => setBrandActive(brand.id, !brand.is_active))}
              >
                {brand.is_active ? t('deactivate') : t('activate')}
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={() => run(() => deleteBrand(brand.id))}
              >
                {t('delete')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
