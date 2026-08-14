import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { listStaffAccounts } from '@/lib/queries/admin';
import { requireAdmin } from '@/lib/actions/admin/guard';
import { StaffManager } from '@/components/admin/StaffManager';

export default async function AdminStaffPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Appointing staff and resetting passwords are admin acts. RLS and
  // `log_admin_action()` both refuse ordinary staff regardless; this redirect
  // only spares them a screen they cannot use.
  const identity = await requireAdmin();
  if (!identity) redirect(`/${locale}/admin`);

  const t = await getTranslations('admin');
  const staff = await listStaffAccounts();

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-ink">{t('staff')}</h2>
      <StaffManager staff={staff} currentUserId={identity.id} />
    </div>
  );
}
