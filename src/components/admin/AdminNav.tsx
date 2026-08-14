'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/**
 * Console navigation.
 *
 * A horizontal scroller rather than a sidebar: the ops team works from a phone
 * as often as a desk, and a sidebar on a 360px screen is either a hamburger
 * nobody opens or half the width.
 */

const SECTIONS = [
  { href: '/admin/orders', key: 'orders' },
  { href: '/admin/products', key: 'products' },
  { href: '/admin/categories', key: 'categories' },
  { href: '/admin/brands', key: 'brands' },
  { href: '/admin/promotions', key: 'promotions' },
  { href: '/admin/governorates', key: 'delivery' },
  { href: '/admin/staff', key: 'staff' },
] as const;

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('admin');
  const pathname = usePathname();

  return (
    <nav aria-label={t('consoleNav')} className="overflow-x-auto border-b border-rule">
      <ul className="flex min-w-max gap-1 pb-2">
        {SECTIONS.map((section) => {
          // Staff accounts are an admin concern; ordinary staff are not shown
          // the tab. RLS refuses the data either way (FR-064).
          if (section.key === 'staff' && !isAdmin) return null;

          const active = pathname.includes(section.href);

          return (
            <li key={section.href}>
              <Link
                href={section.href}
                className={[
                  'flex min-h-touch items-center rounded px-3 text-sm font-semibold transition-colors',
                  active ? 'bg-brand text-on-brand' : 'text-ink-2 hover:bg-surface-2 hover:text-brand',
                ].join(' ')}
              >
                {t(section.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
