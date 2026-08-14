import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  getAdminProduct,
  getProductCost,
  getProductPhotosForAdmin,
  listAdminBrands,
  listAdminCategories,
} from '@/lib/queries/admin';
import { publicImageUrl } from '@/lib/queries/catalog';
import { requireStaff } from '@/lib/actions/admin/guard';
import { ProductForm } from '@/components/admin/ProductForm';
import { ImageUploader } from '@/components/admin/ImageUploader';

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const identity = await requireStaff();
  const product = await getAdminProduct(id);
  if (!product) notFound();

  const isAdmin = identity?.role === 'admin';

  const [categories, brands, photos, cost] = await Promise.all([
    listAdminCategories(),
    listAdminBrands(),
    getProductPhotosForAdmin(id),
    // `get_product_cost` raises for anyone who is not an admin, so it is not
    // even asked for staff — the refusal is the database's, but there is no
    // reason to provoke it (FR-063).
    isAdmin ? getProductCost(id) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-lg font-bold text-ink">{t('editProduct')}</h2>

      <ProductForm
        product={product}
        categories={categories}
        brands={brands}
        cost={cost}
        canEditCost={isAdmin}
        locale={locale}
      />

      <ImageUploader
        productId={id}
        photos={photos.map((photo) => ({
          id: photo.id,
          url: publicImageUrl(photo.thumb_path ?? photo.storage_path) ?? '',
          isPrimary: photo.is_primary,
        }))}
      />
    </div>
  );
}
