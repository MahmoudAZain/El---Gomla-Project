import type { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/actions/admin/guard';

/**
 * Report navigation.
 *
 * The profit tab is absent for ordinary staff rather than disabled (FR-078,
 * T101). A greyed-out link tells someone there is a screen they are not allowed
 * to see, which is an invitation; not rendering it says nothing at all. The
 * database refuses them either way.
 */
const TABS = [
  { href: '/admin/reports/sales', key: 'salesReport', adminOnly: false },
  { href: '/admin/reports/customers', key: 'customersReport', adminOnly: false },
  { href: '/admin/reports/promotions', key: 'promotionsReport', adminOnly: false },
  { href: '/admin/reports/inventory', key: 'inventoryReport', adminOnly: false },
  { href: '/admin/reports/profit', key: 'profitReport', adminOnly: true },
] as const;

export default async function ReportsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('reports');
  const isAdmin = (await requireAdmin()) !== null;

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label={t('reports')} className="overflow-x-auto border-b border-rule">
        <ul className="flex min-w-max gap-1 pb-2">
          {TABS.filter((tab) => !tab.adminOnly || isAdmin).map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className="flex min-h-touch items-center rounded px-3 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-brand"
              >
                {t(tab.key)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {children}
    </div>
  );
}
