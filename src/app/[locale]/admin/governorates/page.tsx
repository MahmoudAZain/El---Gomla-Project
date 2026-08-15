import { getTranslations, setRequestLocale } from 'next-intl/server';
import { listAllGovernorates } from '@/lib/queries/admin';
import { GovernoratePricing } from '@/components/admin/GovernoratePricing';

/**
 * Delivery coverage and pricing (FR-056, FR-056a, FR-056b).
 *
 * All 27 governorates are listed, served or not. That is the whole point of the
 * screen: coverage is a decision made here, in data, rather than a constant
 * somebody edits and redeploys. Fees and minimums can be changed at any time
 * and take effect on the next cart priced.
 */
export default async function AdminGovernoratesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const governorates = await listAllGovernorates();

  const active = governorates.filter((governorate) => governorate.is_active).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-ink">{t('delivery')}</h2>
        <p className="text-sm text-ink-3">
          {t('coverageSummary', { active, total: governorates.length })}
        </p>
      </div>

      <GovernoratePricing governorates={governorates} />
    </div>
  );
}
