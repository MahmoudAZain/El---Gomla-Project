import { getTranslations, setRequestLocale } from 'next-intl/server';
import { listAdminBrands } from '@/lib/queries/admin';
import { BrandManager } from '@/components/admin/BrandManager';

export default async function AdminBrandsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const brands = await listAdminBrands();

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-ink">{t('brands')}</h2>
      <BrandManager brands={brands} locale={locale} />
    </div>
  );
}
