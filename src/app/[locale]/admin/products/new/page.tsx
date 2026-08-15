import { getTranslations, setRequestLocale } from 'next-intl/server';
import { listAdminCategories, listAdminBrands } from '@/lib/queries/admin';
import { requireStaff } from '@/lib/actions/admin/guard';
import { ProductForm } from '@/components/admin/ProductForm';

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const [identity, categories, brands] = await Promise.all([
    requireStaff(),
    listAdminCategories(),
    listAdminBrands(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-ink">{t('newProduct')}</h2>

      {/*
        Photos need a product to belong to, so the uploader appears only after
        the first save. Creating an empty product row to hang them on would
        leave a half-made product in the catalog whenever someone changed their
        mind.
      */}
      <p className="text-sm text-ink-3">{t('photosAfterSave')}</p>

      <ProductForm
        categories={categories}
        brands={brands}
        canEditCost={identity?.role === 'admin'}
        locale={locale}
      />
    </div>
  );
}
