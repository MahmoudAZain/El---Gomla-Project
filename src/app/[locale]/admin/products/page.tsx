import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { listAdminProducts, listAdminCategories } from '@/lib/queries/admin';
import { ProductTable } from '@/components/admin/ProductTable';
import type { Locale } from '@/i18n/routing';

export default async function AdminProductsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const [products, categories] = await Promise.all([listAdminProducts(), listAdminCategories()]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">{t('products')}</h2>
        <Link
          href="/admin/products/new"
          className="flex min-h-touch items-center rounded bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover"
        >
          {t('newProduct')}
        </Link>
      </div>

      <ProductTable
        products={products}
        categories={categories}
        locale={locale as Locale}
      />
    </div>
  );
}
