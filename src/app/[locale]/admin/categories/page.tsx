import { getTranslations, setRequestLocale } from 'next-intl/server';
import { listAdminCategories } from '@/lib/queries/admin';
import { CategoryManager } from '@/components/admin/CategoryManager';

export default async function AdminCategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const categories = await listAdminCategories();

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-ink">{t('categories')}</h2>
      <CategoryManager categories={categories} locale={locale} />
    </div>
  );
}
