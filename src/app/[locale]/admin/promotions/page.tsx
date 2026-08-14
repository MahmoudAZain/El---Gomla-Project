import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  listAdminPromotions,
  listAdminProducts,
  listAdminCategories,
  listAdminBrands,
} from '@/lib/queries/admin';
import { PromotionManager } from '@/components/admin/PromotionManager';

export default async function AdminPromotionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const [promotions, products, categories, brands] = await Promise.all([
    listAdminPromotions(),
    listAdminProducts(),
    listAdminCategories(),
    listAdminBrands(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-ink">{t('promotions')}</h2>
      <PromotionManager
        promotions={promotions}
        products={products.map(({ id, name_ar, name_en }) => ({ id, name_ar, name_en }))}
        categories={categories.map(({ id, name_ar, name_en }) => ({ id, name_ar, name_en }))}
        brands={brands.map(({ id, name_ar, name_en }) => ({ id, name_ar, name_en }))}
        locale={locale}
      />
    </div>
  );
}
