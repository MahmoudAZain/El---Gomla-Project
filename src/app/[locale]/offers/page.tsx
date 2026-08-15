import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ProductCard } from '@/components/catalog/ProductCard';
import { getDiscountedProducts, publicImageUrl, type ListedProduct } from '@/lib/queries/catalog';

function toCardData(p: ListedProduct) {
  return {
    id: p.id,
    slug: p.slug,
    name_ar: p.name_ar,
    name_en: p.name_en,
    unit: p.unit,
    pack_size: p.pack_size,
    stock_qty: p.stock_qty,
    min_order_qty: p.min_order_qty,
    base_price: p.base_price,
    effective_price: p.effective_price,
    photo_path: publicImageUrl(p.photo_path),
  };
}

/**
 * Everything currently discounted (T111, FR-020).
 *
 * "Currently" is doing real work here. The list comes from `product_listing`,
 * whose prices are resolved by `effective_price()` at query time — so a
 * promotion that ended a minute ago is already absent, with no job to run and
 * no cache to bust. A shopper cannot arrive at an offer that has expired.
 *
 * Ordered by the size of the saving rather than by name: someone opening this
 * page is asking what the best deal is, not browsing alphabetically.
 */
export default async function OffersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('catalog');
  const tOffers = await getTranslations('offers');

  const products = await getDiscountedProducts(48);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-ink">{t('offers')}</h1>
        <p className="text-sm text-ink-3">{t('productCount', { count: products.length })}</p>
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded border border-rule bg-surface px-4 py-10">
          <p className="text-center text-ink-2">{tOffers('none')}</p>
          <Link
            href="/"
            className="flex min-h-touch items-center rounded bg-brand px-4 font-semibold text-on-brand hover:bg-brand-hover"
          >
            {t('home')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product, index) => (
            <ProductCard key={product.id} product={toCardData(product)} priority={index < 4} />
          ))}
        </div>
      )}
    </div>
  );
}
