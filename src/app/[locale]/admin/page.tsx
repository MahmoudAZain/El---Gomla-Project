import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/**
 * The console's front door.
 *
 * Deliberately a directory rather than a dashboard: order counts and revenue
 * belong to Stage 5 and Stage 6, and a screen full of zeroes before orders
 * exist teaches staff to ignore it.
 */
const SECTIONS = [
  { href: '/admin/products', key: 'products' },
  { href: '/admin/categories', key: 'categories' },
  { href: '/admin/brands', key: 'brands' },
  { href: '/admin/promotions', key: 'promotions' },
  { href: '/admin/governorates', key: 'delivery' },
  { href: '/admin/staff', key: 'staff' },
] as const;

export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {SECTIONS.map((section) => (
        <li key={section.href}>
          <Link
            href={section.href}
            className="flex flex-col gap-1 rounded border border-rule bg-surface p-4 transition-colors hover:border-brand"
          >
            <span className="font-semibold text-ink">{t(section.key)}</span>
            <span className="text-sm text-ink-3">{t(`${section.key}Blurb`)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
