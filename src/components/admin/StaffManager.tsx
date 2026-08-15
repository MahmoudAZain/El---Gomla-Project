'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createStaffAccount,
  setStaffRole,
  setAccountActive,
  resetPasswordFor,
  findAccounts,
} from '@/lib/actions/admin/staff';
import { Button } from '@/components/ui/Button';
import { Input, Select, FormError } from '@/components/ui/Field';
import type { AdminStaffRow } from '@/lib/queries/admin';

/**
 * Staff accounts and the password reset counter (FR-016, FR-060).
 *
 * The reset section deliberately searches *all* accounts, not just staff: the
 * whole reason it exists is the customer who has forgotten their password and
 * has no email or SMS to recover it with. Every use writes an audit row naming
 * who performed it, before the password is changed.
 */

interface Found {
  id: string;
  full_name: string;
  phone: string;
  role: string;
  is_active: boolean;
}

export function StaffManager({ staff, currentUserId }: { staff: AdminStaffRow[]; currentUserId: string }) {
  const t = useTranslations('admin');
  const tError = useTranslations();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Found[]>([]);
  const [resetTarget, setResetTarget] = useState<Found | null>(null);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await action();
    if (result.ok) setNotice(success ?? null);
    else setError(result.error ?? 'adminErrors.saveFailed');
    setBusy(false);
    router.refresh();
  }

  async function onCreate(formData: FormData) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await createStaffAccount(formData);
    if (result.ok) setNotice('staffCreated');
    else setError(result.error);
    setBusy(false);
    router.refresh();
  }

  async function onSearch() {
    setError(null);
    const result = await findAccounts(query);
    if (result.ok) setResults(result.data);
    else setError(result.error);
  }

  async function onReset(formData: FormData) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await resetPasswordFor(formData);
    if (result.ok) {
      setNotice('passwordReset');
      setResetTarget(null);
    } else {
      setError(result.error);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-8">
      {error && <FormError>{tError(error)}</FormError>}
      {notice && (
        <p role="status" className="rounded border border-brand bg-surface px-4 py-3 text-sm text-brand">
          {t(notice)}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-ink">{t('staffAccounts')}</h2>

        <ul className="flex flex-col gap-2">
          {staff.map((member) => (
            <li
              key={member.id}
              className={[
                'flex flex-col gap-2 rounded border p-3 sm:flex-row sm:items-center sm:justify-between',
                member.is_active ? 'border-rule bg-surface' : 'border-dashed border-rule-strong bg-surface-2',
              ].join(' ')}
            >
              <div className="flex flex-col">
                <span className="font-semibold text-ink">{member.full_name}</span>
                <span className="text-xs text-ink-3" dir="ltr">
                  {member.phone}
                </span>
                {!member.is_active && <span className="text-xs text-ink-3">{t('accountDisabled')}</span>}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={member.role}
                  disabled={busy}
                  aria-label={t('role')}
                  onChange={(event) => run(() => setStaffRole(member.id, event.target.value))}
                  className="min-h-touch rounded border border-rule bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none"
                >
                  <option value="staff">{t('roleStaff')}</option>
                  <option value="admin">{t('roleAdmin')}</option>
                  <option value="customer">{t('roleCustomer')}</option>
                </select>

                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || member.id === currentUserId}
                  onClick={() => run(() => setAccountActive(member.id, !member.is_active))}
                >
                  {member.is_active ? t('deactivate') : t('activate')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-ink">{t('newStaffAccount')}</h2>

        <form action={onCreate} className="flex flex-col gap-4 rounded border border-rule bg-surface p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="full_name" name="full_name" label={t('fullName')} required />
            <Input
              id="staff_phone"
              name="phone"
              label={t('phone')}
              required
              type="tel"
              inputMode="tel"
              dir="ltr"
            />
            <Input
              id="staff_password"
              name="password"
              label={t('temporaryPassword')}
              hint={t('passwordHint')}
              required
              type="password"
            />
            <Select id="role" name="role" label={t('role')} required defaultValue="staff">
              <option value="staff">{t('roleStaff')}</option>
              <option value="admin">{t('roleAdmin')}</option>
            </Select>
          </div>

          <Button type="submit" disabled={busy}>
            {busy ? t('saving') : t('createAccount')}
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-ink">{t('passwordResetTitle')}</h2>
        <p className="rounded border border-rule bg-surface-2 px-4 py-3 text-sm text-ink-2">
          {t('passwordResetHelp')}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="account-search" className="text-sm font-semibold text-ink">
              {t('findAccount')}
            </label>
            <input
              id="account-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-h-touch w-full rounded border border-rule bg-surface px-3 text-base text-ink focus:border-brand focus:outline-none"
            />
          </div>
          <Button type="button" variant="secondary" onClick={onSearch}>
            {t('search')}
          </Button>
        </div>

        <ul className="flex flex-col gap-2">
          {results.map((account) => (
            <li
              key={account.id}
              className="flex flex-col gap-2 rounded border border-rule bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-ink">{account.full_name}</span>
                <span className="text-xs text-ink-3" dir="ltr">
                  {account.phone}
                </span>
              </div>
              <Button type="button" variant="secondary" onClick={() => setResetTarget(account)}>
                {t('resetPassword')}
              </Button>
            </li>
          ))}
        </ul>

        {resetTarget && (
          <form action={onReset} className="flex flex-col gap-4 rounded border border-danger bg-surface p-4">
            <p className="text-sm text-ink">
              {t('resettingFor', { name: resetTarget.full_name, phone: resetTarget.phone })}
            </p>
            <input type="hidden" name="profile_id" value={resetTarget.id} />
            <Input
              id="new_password"
              name="password"
              label={t('newPassword')}
              hint={t('passwordHint')}
              required
              type="password"
            />
            <p className="text-xs text-ink-3">{t('resetIsAudited')}</p>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={busy}>
                {busy ? t('saving') : t('confirmReset')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setResetTarget(null)}>
                {t('cancel')}
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
