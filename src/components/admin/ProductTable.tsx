'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { DataTable, type Column } from './DataTable';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Field';
import { setProductActive, deleteProduct } from '@/lib/actions/admin/products';
import { formatMoney } from '@/lib/money';
import type { AdminProductRow } from '@/lib/queries/admin';
import type { Locale } from '@/i18n/routing';

/** The catalog list. Stock and visibility are the two columns staff scan for. */
export function ProductTable({
  products,
  categories,
  locale,
}: {
  products: AdminProductRow[];
  categories: { id: string; name_ar: string; name_en: string }[];
  locale: Locale;
}) {
  const t = useTranslations('admin');
  const tError = useTranslations();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const name = (row: { name_ar: string; name_en: string }) =>
    locale === 'ar' ? row.name_ar : row.name_en;

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    if (!result.ok) setError(result.error ?? 'adminErrors.saveFailed');
    setBusy(false);
    router.refresh();
  }

  const columns: Column<AdminProductRow>[] = [
    {
      key: 'name',
      header: t('productName'),
      value: (row) => name(row),
      render: (row) => (
        <Link href={`/admin/products/${row.id}`} className="font-semibold text-brand">
          {name(row)}
        </Link>
      ),
    },
    { key: 'sku', header: t('sku'), value: (row) => row.sku, hideOnMobile: true },
    {
      key: 'category',
      header: t('category'),
      value: (row) => (row.category ? name(row.category) : ''),
      hideOnMobile: true,
    },
    {
      key: 'price',
      header: t('price'),
      value: (row) => row.price,
      render: (row) => <span className="tabular">{formatMoney(row.price, locale)}</span>,
    },
    {
      key: 'stock',
      header: t('stockQty'),
      value: (row) => row.stock_qty,
      render: (row) => (
        <span className={row.stock_qty === 0 ? 'font-semibold text-danger' : 'text-ink'}>
          {row.stock_qty}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      value: (row) => (row.is_active ? 1 : 0),
      render: (row) => (
        <span
          className={[
            'rounded px-2 py-1 text-xs font-semibold',
            row.is_active ? 'bg-surface-2 text-ink-2' : 'bg-danger-soft text-danger',
          ].join(' ')}
        >
          {row.is_active ? t('visible') : t('hidden')}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {error && <FormError>{tError(error)}</FormError>}

      <DataTable
        rows={products}
        columns={columns}
        getRowKey={(row) => row.id}
        searchLabel={t('searchProducts')}
        emptyMessage={t('noProducts')}
        filters={[
          {
            key: 'category',
            label: t('category'),
            options: categories.map((category) => ({ value: category.id, label: name(category) })),
            match: () => true,
          },
          {
            key: 'status',
            label: t('status'),
            options: [
              { value: 'active', label: t('visible') },
              { value: 'inactive', label: t('hidden') },
            ],
            match: () => true,
          },
        ]}
        filterValueOf={(row, key) =>
          key === 'category' ? (row.category?.id ?? '') : row.is_active ? 'active' : 'inactive'
        }
        actions={(row) => (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/products/${row.id}`}
              className="flex min-h-touch items-center rounded border border-rule px-3 text-sm font-semibold text-ink-2 hover:border-brand hover:text-brand"
            >
              {t('edit')}
            </Link>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => run(() => setProductActive(row.id, !row.is_active))}
            >
              {row.is_active ? t('deactivate') : t('activate')}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => run(() => deleteProduct(row.id))}
            >
              {t('delete')}
            </Button>
          </div>
        )}
      />
    </div>
  );
}
