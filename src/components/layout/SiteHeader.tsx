import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher';
import { CartBadge } from '@/components/cart/CartBadge';
import { getCurrentProfile } from '@/lib/actions/auth';

export async function SiteHeader() {
  const t = await getTranslations('nav');
  const tBrand = await getTranslations('brand');
  const profile = await getCurrentProfile();

  return (
    <header className="border-b border-rule bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-brand">
          {tBrand('name')}
        </Link>

        <nav className="flex items-center gap-1" aria-label={t('home')}>
          <Link
            href="/offers"
            className="hidden min-h-touch items-center rounded px-3 text-sm font-semibold text-ink-2 hover:text-brand sm:flex"
          >
            {t('offers')}
          </Link>

          <Link
            href="/search"
            className="flex min-h-touch items-center gap-1.5 rounded px-3 text-sm font-semibold text-ink-2 hover:text-brand"
          >
            <span aria-hidden="true">🔍</span>
            <span className="hidden sm:inline">{t('search')}</span>
          </Link>

          <Link
            href="/cart"
            className="flex min-h-touch items-center gap-1.5 rounded px-3 text-sm font-semibold text-ink-2 hover:text-brand"
          >
            <span aria-hidden="true">🛒</span>
            <span className="hidden sm:inline">{t('cart')}</span>
            <CartBadge />
          </Link>

          {profile ? (
            <Link
              href="/orders"
              className="flex min-h-touch items-center rounded px-3 text-sm font-semibold text-ink-2 hover:text-brand"
            >
              {t('orders')}
            </Link>
          ) : (
            <Link
              href="/login"
              className="flex min-h-touch items-center rounded px-3 text-sm font-semibold text-ink-2 hover:text-brand"
            >
              {t('login')}
            </Link>
          )}

          {/* Staff and admins reach the console from the same header rather than
              a separate URL they have to remember. Non-staff never see it, and
              RLS refuses the data regardless (FR-064). */}
          {profile && profile.role !== 'customer' && (
            <Link
              href="/admin"
              className="flex min-h-touch items-center rounded px-3 text-sm font-semibold text-brand"
            >
              {t('admin')}
            </Link>
          )}

          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
