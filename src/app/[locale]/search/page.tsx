import { getTranslations, setRequestLocale, getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { SearchBox } from '@/components/catalog/SearchBox';
import { ProductCard } from '@/components/catalog/ProductCard';
import { searchProducts, getCategoryTree, publicImageUrl, type ListedProduct } from '@/lib/queries/catalog';
import type { Locale } from '@/i18n/routing';

const PER_PAGE = 24;

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
 * Search results (T110, FR-019).
 *
 * The empty state is the part worth care. A shopper who searches for something
 * the shop does not stock has hit a dead end, and a bare "no results" leaves
 * them with nowhere to go but the back button. This offers the category tree
 * instead — the shop does sell groceries, just not that word.
 */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { locale } = await params;
  const { q, page: pageParam } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('search');
  const tCatalog = await getTranslations('catalog');
  const activeLocale = (await getLocale()) as Locale;

  const query = (q ?? '').trim();
  const page = Math.max(1, Number(pageParam) || 1);

  const { products, total } = query
    ? await searchProducts(query, { page, perPage: PER_PAGE })
    : { products: [], total: 0 };

  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE));
  const categories = products.length === 0 ? await getCategoryTree() : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-ink">{t('title')}</h1>

      <SearchBox initialQuery={query} />

      {query.length === 0 ? (
        <p className="rounded border border-rule bg-surface px-4 py-8 text-center text-ink-2">
          {t('prompt')}
        </p>
      ) : products.length === 0 ? (
        <div className="flex flex-col gap-4">
          <p className="rounded border border-rule bg-surface px-4 py-6 text-center text-ink-2">
            {t('noResults', { query })}
          </p>

          {categories.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-ink">{t('browseInstead')}</h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {categories.map((category) => (
                  <li key={category.id}>
                    <Link
                      href={`/c/${category.slug}`}
                      className="flex min-h-touch items-center justify-center rounded border border-rule bg-surface px-3 py-3 text-center text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand"
                    >
                      {activeLocale === 'ar' ? category.name_ar : category.name_en}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-3">{t('resultCount', { count: total, query })}</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product, index) => (
              <ProductCard
                key={product.id}
                product={toCardData(product)}
                priority={index < 4}
              />
            ))}
          </div>

          {lastPage > 1 && (
            <nav className="flex items-center justify-between gap-4" aria-label={tCatalog('pagination')}>
              {page > 1 ? (
                <Link
                  href={`/search?q=${encodeURIComponent(query)}&page=${page - 1}`}
                  className="flex min-h-touch items-center rounded border border-rule px-4 font-semibold text-ink"
                >
                  {tCatalog('previous')}
                </Link>
              ) : (
                <span />
              )}

              <span className="text-sm text-ink-3 tabular">
                {tCatalog('pageOf', { page, total: lastPage })}
              </span>

              {page < lastPage ? (
                <Link
                  href={`/search?q=${encodeURIComponent(query)}&page=${page + 1}`}
                  className="flex min-h-touch items-center rounded border border-rule px-4 font-semibold text-ink"
                >
                  {tCatalog('next')}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
