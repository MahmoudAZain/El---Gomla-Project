'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
// Creating an auth user and setting someone else's password are operations no
// RLS policy can express — they live in the `auth` schema, which the anon key
// cannot reach. This is the second and last legitimate use of the service role
// in the application, and the rule is suspended for exactly this import.
// eslint-disable-next-line no-restricted-imports
import { createServiceClient } from '@/lib/supabase/service';
import { phoneToAuthIdentifier } from '@/lib/phone';
import { staffSchema, staffRoleSchema, passwordResetSchema } from '@/lib/validation/admin-schemas';
import type { ActionResult } from '../auth';
import { adminOrRefusal, describeWriteError, recordAudit } from './guard';

/**
 * Staff accounts and the staff-mediated password reset (FR-016, FR-060).
 *
 * There is no SMS and no email in this system, so there is no self-service
 * reset: a customer who forgets their password calls the shop and a staff
 * member sets a new one. That is a privileged act — for a moment, somebody can
 * sign in as somebody else — and the design accepts it only because every use
 * leaves a row in `admin_audit_log` naming who did it, to whom, and when.
 *
 * The audit entry is written through the *caller's* client via
 * `log_admin_action()`, which takes the actor from `auth.uid()`. The service
 * role is used for the password change alone and never to write the log — a log
 * written as the system would not identify the person.
 */

export async function createStaffAccount(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const parsed = staffSchema.safeParse({
    full_name: formData.get('full_name'),
    phone: formData.get('phone'),
    password: formData.get('password'),
    role: formData.get('role'),
    preferred_locale: formData.get('preferred_locale') ?? 'ar',
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? 'adminErrors.invalidInput',
      field: String(issue?.path[0] ?? ''),
    };
  }

  const input = parsed.data;
  const service = createServiceClient();

  const { data: existing } = await service
    .from('profiles')
    .select('id')
    .eq('phone', input.phone)
    .maybeSingle();

  if (existing) return { ok: false, error: 'errors.phoneAlreadyRegistered', field: 'phone' };

  const { data: created, error: authError } = await service.auth.admin.createUser({
    email: phoneToAuthIdentifier(input.phone),
    password: input.password,
    email_confirm: true,
  });

  if (authError || !created.user) return { ok: false, error: 'adminErrors.saveFailed' };

  const { error: profileError } = await service.from('profiles').insert({
    id: created.user.id,
    full_name: input.full_name,
    phone: input.phone,
    role: input.role,
    preferred_locale: input.preferred_locale,
  });

  if (profileError) {
    // Compensate: an auth user with no profile can sign in and is nobody.
    await service.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: describeWriteError(profileError) };
  }

  await recordAudit(
    'staff.created',
    { type: 'profile', id: created.user.id },
    { role: input.role, phone: input.phone },
  );

  revalidatePath('/', 'layout');
  return { ok: true, data: { id: created.user.id } };
}

/**
 * Role assignment.
 *
 * The trigger `profiles_guard_privileged` refuses a role change from anyone who
 * is not an admin, whatever this function does. The self-check below is a
 * different concern: an admin demoting their own account can leave a shop with
 * no administrator at all, and nobody able to appoint one.
 */
export async function setStaffRole(profileId: string, role: string): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const parsed = staffRoleSchema.safeParse({ profile_id: profileId, role });
  if (!parsed.success) return { ok: false, error: 'adminErrors.invalidInput' };

  if (parsed.data.profile_id === guard.identity.id && parsed.data.role !== 'admin') {
    return { ok: false, error: 'adminErrors.cannotDemoteSelf' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.profile_id);

  if (error) return { ok: false, error: describeWriteError(error) };

  await recordAudit('staff.role_changed', { type: 'profile', id: parsed.data.profile_id }, { role: parsed.data.role });
  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}

export async function setAccountActive(profileId: string, isActive: boolean): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  if (profileId === guard.identity.id && !isActive) {
    return { ok: false, error: 'adminErrors.cannotDeactivateSelf' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', profileId);

  if (error) return { ok: false, error: describeWriteError(error) };

  await recordAudit(isActive ? 'account.activated' : 'account.deactivated', {
    type: 'profile',
    id: profileId,
  });
  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}

/**
 * Sets a new password for another account.
 *
 * The audit entry is written **before** the password changes. If the write to
 * the log fails, the password is not touched — an unrecorded reset is the one
 * outcome this feature must not produce.
 */
export async function resetPasswordFor(formData: FormData): Promise<ActionResult> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const parsed = passwordResetSchema.safeParse({
    profile_id: formData.get('profile_id'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? 'adminErrors.invalidInput',
      field: String(issue?.path[0] ?? ''),
    };
  }

  const supabase = await createClient();
  const { error: auditError } = await supabase.rpc('log_admin_action', {
    p_action: 'password.reset',
    p_target_type: 'profile',
    p_target_id: parsed.data.profile_id,
    p_detail: null,
  });

  if (auditError) return { ok: false, error: 'adminErrors.notAuthorized' };

  const service = createServiceClient();
  const { error } = await service.auth.admin.updateUserById(parsed.data.profile_id, {
    password: parsed.data.password,
  });

  if (error) return { ok: false, error: 'adminErrors.saveFailed' };

  return { ok: true, data: undefined };
}

/** Customer lookup for the reset flow — by canonical phone or by name. */
export async function findAccounts(query: string): Promise<ActionResult<
  { id: string; full_name: string; phone: string; role: string; is_active: boolean }[]
>> {
  const guard = await adminOrRefusal();
  if (!guard.ok) return guard;

  const term = query.trim();
  if (term.length < 3) return { ok: true, data: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role, is_active')
    .or(`phone.ilike.%${term.replace(/[%,()]/g, '')}%,full_name.ilike.%${term.replace(/[%,()]/g, '')}%`)
    .limit(20);

  if (error) return { ok: false, error: describeWriteError(error) };
  return { ok: true, data: data ?? [] };
}
