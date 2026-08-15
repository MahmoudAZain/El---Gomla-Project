import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireStaff } from '@/lib/actions/admin/guard';
import { AdminNav } from '@/components/admin/AdminNav';

/**
 * The staff gate (FR-064, FR-065).
 *
 * **This check is a courtesy, not the boundary.** Row Level Security decides
 * what any of these screens can actually read or write, and it would refuse a
 * customer who reached them with this file deleted. What the gate buys is a
 * clean redirect instead of a console full of empty tables — a difference in
 * dignity, not in safety (Constitution Principle II).
 *
 * It runs per request rather than once at sign-in, so an account demoted or
 * deactivated a minute ago stops seeing the console on its next navigation
 * rather than at the end of its session.
 */
export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const identity = await requireStaff();
  if (!identity) redirect(`/${locale}/login?next=/admin`);

  const t = await getTranslations('admin');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-ink">{t('console')}</h1>
        <p className="text-sm text-ink-3">
          {identity.full_name} · {t(identity.role === 'admin' ? 'roleAdmin' : 'roleStaff')}
        </p>
      </header>

      <AdminNav isAdmin={identity.role === 'admin'} />

      {/*
        Staff can see the console but cannot write master data — that is
        `is_admin()` in the policies, not a rule this layout enforces. Saying so
        here is kinder than letting them fill in a form and be refused.
      */}
      {identity.role !== 'admin' && (
        <p className="rounded border border-rule bg-surface-2 px-4 py-3 text-sm text-ink-2">
          {t('readOnlyNotice')}
        </p>
      )}

      {children}
    </div>
  );
}
