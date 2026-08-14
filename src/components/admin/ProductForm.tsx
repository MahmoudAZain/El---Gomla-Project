'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { saveProduct } from '@/lib/actions/admin/products';
import { BilingualField } from './BilingualField';
import { Button } from '@/components/ui/Button';
import { Input, Select, FormError } from '@/components/ui/Field';
import { piastresToPounds } from '@/lib/money';
import type { AdminProductDetail } from '@/lib/queries/admin';

/**
 * The product form (FR-051).
 *
 * Every attribute the business listed is here, and the ones that decide money
 * or availability — price, stock, minimum quantity — sit above the fold on a
 * phone, because those are the three that change weekly.
 */

const UNITS = ['piece', 'kilo', 'carton', 'pack', 'liter'] as const;
const STORAGE = ['ambient', 'chilled', 'frozen'] as const;

export function ProductForm({
  product,
  categories,
  brands,
  cost,
  canEditCost,
  locale,
}: {
  product?: AdminProductDetail;
  categories: { id: string; name_ar: string; name_en: string; is_active: boolean }[];
  brands: { id: string; name_ar: string; name_en: string }[];
  cost?: { cost_price: number; supplier_name: string | null } | null;
  /** Cost prices belong to admins. Ordinary staff never see the field (FR-059). */
  canEditCost: boolean;
  locale: string;
}) {
  const t = useTranslations('admin');
  const tError = useTranslations();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const label = (row: { name_ar: string; name_en: string }) =>
    locale === 'ar' ? row.name_ar : row.name_en;

  async function onSubmit(formData: FormData) {
    setSaving(true);
    setError(null);
    setField(undefined);

    const result = await saveProduct(formData);

    if (result.ok) {
      router.push('/admin/products');
      router.refresh();
      return;
    }

    setError(result.error);
    setField(result.field);
    setSaving(false);
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-6">
      {error && <FormError>{tError(error)}</FormError>}

      {product && <input type="hidden" name="id" value={product.id} />}

      <BilingualField
        name="name"
        label={t('productName')}
        defaultAr={product?.name_ar}
        defaultEn={product?.name_en}
        error={field === 'name_ar' || field === 'name_en' ? tError(error ?? '') : undefined}
      />

      <BilingualField
        name="description"
        label={t('productDescription')}
        defaultAr={product?.description_ar ?? ''}
        defaultEn={product?.description_en ?? ''}
        required={false}
        multiline
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          id="category_id"
          name="category_id"
          label={t('category')}
          required
          defaultValue={product?.category_id ?? ''}
        >
          <option value="">{t('choose')}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {label(category)}
              {category.is_active ? '' : ` — ${t('inactive')}`}
            </option>
          ))}
        </Select>

        <Select id="brand_id" name="brand_id" label={t('brand')} defaultValue={product?.brand_id ?? ''}>
          <option value="">{t('noBrand')}</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {label(brand)}
            </option>
          ))}
        </Select>

        <Input
          id="price"
          name="price"
          label={t('priceEgp')}
          hint={t('priceHint')}
          required
          inputMode="decimal"
          dir="ltr"
          defaultValue={product ? piastresToPounds(product.price) : ''}
          error={field === 'price' ? tError(error ?? '') : undefined}
        />

        <Input
          id="sku"
          name="sku"
          label={t('sku')}
          required
          dir="ltr"
          defaultValue={product?.sku ?? ''}
          error={field === 'sku' ? tError(error ?? '') : undefined}
        />

        <Input
          id="stock_qty"
          name="stock_qty"
          label={t('stockQty')}
          required
          type="number"
          min={0}
          dir="ltr"
          defaultValue={product?.stock_qty ?? 0}
        />

        <Input
          id="min_order_qty"
          name="min_order_qty"
          label={t('minOrderQty')}
          hint={t('minOrderQtyHint')}
          required
          type="number"
          min={1}
          dir="ltr"
          defaultValue={product?.min_order_qty ?? 1}
        />

        <Select id="unit" name="unit" label={t('unit')} required defaultValue={product?.unit ?? 'piece'}>
          {UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {t(`units.${unit}`)}
            </option>
          ))}
        </Select>

        <Select
          id="storage"
          name="storage"
          label={t('storage')}
          required
          defaultValue={product?.storage ?? 'ambient'}
        >
          {STORAGE.map((storage) => (
            <option key={storage} value={storage}>
              {t(`storageTypes.${storage}`)}
            </option>
          ))}
        </Select>

        <Input
          id="pack_size"
          name="pack_size"
          label={t('packSize')}
          defaultValue={product?.pack_size ?? ''}
        />

        <Input
          id="units_per_carton"
          name="units_per_carton"
          label={t('unitsPerCarton')}
          type="number"
          min={1}
          dir="ltr"
          defaultValue={product?.units_per_carton ?? ''}
        />

        <Input
          id="weight_grams"
          name="weight_grams"
          label={t('weightGrams')}
          type="number"
          min={1}
          dir="ltr"
          defaultValue={product?.weight_grams ?? ''}
        />

        <Input
          id="barcode"
          name="barcode"
          label={t('barcode')}
          hint={t('barcodeHint')}
          dir="ltr"
          defaultValue={product?.barcode ?? ''}
          error={field === 'barcode' ? tError(error ?? '') : undefined}
        />
      </div>

      {/*
        Cost prices live in a table with no grant to anyone but an admin, and
        this is the only screen that writes one. Ordinary staff run the catalog
        without ever seeing the margin (FR-059, FR-063).
      */}
      {canEditCost && (
        <fieldset className="flex flex-col gap-4 rounded border border-rule-strong bg-surface-2 p-4">
          <legend className="px-2 text-sm font-semibold text-ink">{t('costSection')}</legend>
          <p className="text-xs text-ink-3">{t('costSectionHelp')}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="cost_price"
              name="cost_price"
              label={t('costPriceEgp')}
              inputMode="decimal"
              dir="ltr"
              defaultValue={cost ? piastresToPounds(cost.cost_price) : ''}
              error={field === 'cost_price' ? tError(error ?? '') : undefined}
            />
            <Input
              id="supplier_name"
              name="supplier_name"
              label={t('supplier')}
              defaultValue={cost?.supplier_name ?? ''}
            />
          </div>
        </fieldset>
      )}

      <label className="flex min-h-touch items-center gap-2 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={product?.is_active ?? true}
          className="size-5 accent-brand"
        />
        {t('visibleInShop')}
      </label>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? t('saving') : t('save')}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={() => router.back()}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
