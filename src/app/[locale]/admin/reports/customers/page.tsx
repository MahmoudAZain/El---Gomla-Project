import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getCustomerReport, getSummary } from '@/lib/queries/reports';
import { rangeFromParams } from '@/lib/reports/range';
import { formatMoney, formatNumber } from '@/lib/money';
import { DateRangePicker } from '@/components/admin/DateRangePicker';
import { ReportTable } from '@/components/admin/ReportTable';
import { StatTile } from '@/components/admin/StatTile';
import type { Locale } from '@/i18n/routing';

/**
 * Customers (T098, FR-075).
 *
 * "New" means a customer whose first order ever falls inside the range — not
 * their first order inside it. Counting the latter would make every returning
 * customer new again each month and flatter the number permanently.
 */
export default async function CustomersReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('reports');
  const activeLocale = locale as Locale;

  const one = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : undefined);
  const range = rangeFromParams({ from: one('from'), to: one('to') });

  const [customers, summary] = await Promise.all([getCustomerReport(range), getSummary(range)]);

  const newCustomers = customers.filter((row) => row.is_new).length;
  const returning = customers.length - newCustomers;

  return (
    <div className="flex flex-col gap-8">
      <DateRangePicker range={range} />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label={t('customersServed')}
          value={formatNumber(summary?.customers_served ?? 0, activeLocale)}
        />
        <StatTile label={t('newCustomers')} value={formatNumber(newCustomers, activeLocale)} />
        <StatTile
          label={t('returningCustomers')}
          value={formatNumber(returning, activeLocale)}
          tone="quiet"
        />
      </div>

      <ReportTable
        title={t('topCustomers')}
        rows={customers}
        getRowKey={(row) => row.profile_id}
        exportKey="customers"
        range={range}
        note={t('newMeansFirstEver')}
        columns={[
          { header: t('customer'), cell: (row) => row.full_name },
          {
            header: t('mobile'),
            cell: (row) => <span dir="ltr">{row.phone}</span>,
            hideOnMobile: true,
          },
          { header: t('orders'), cell: (row) => formatNumber(row.orders, activeLocale), numeric: true },
          { header: t('total'), cell: (row) => formatMoney(row.revenue, activeLocale), numeric: true },
          {
            header: t('customerType'),
            cell: (row) => (row.is_new ? t('isNew') : t('isReturning')),
            hideOnMobile: true,
          },
        ]}
      />
    </div>
  );
}
