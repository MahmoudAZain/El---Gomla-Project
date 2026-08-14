import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';

export { describeWriteError } from './errors';

/**
 * Authorization for the staff console.
 *
 * **These checks are a courtesy, not the boundary.** Every write below them
 * goes through the RLS-bound server client, where the `is_admin()` policies
 * decide the outcome. Their whole purpose is that a customer who guesses the
 * URL sees a clean "not allowed" page instead of an empty table, and that a
 * refused action produces a sentence rather than a Postgres error
 * (Constitution Principle II, FR-064, FR-065).
 */

export interface AdminIdentity {
  id: string;
  role: UserRole;
  full_name: string;
}

export async function currentIdentity(): Promise<AdminIdentity | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, role, full_name, is_active')
    .eq('id', user.id)
    .maybeSingle();

  // A deactivated staff account is not staff. `current_role_name()` takes the
  // same view in SQL, so the two agree.
  if (!data || !data.is_active) return null;

  return { id: data.id, role: data.role, full_name: data.full_name };
}

export async function requireStaff(): Promise<AdminIdentity | null> {
  const identity = await currentIdentity();
  return identity && identity.role !== 'customer' ? identity : null;
}

export async function requireAdmin(): Promise<AdminIdentity | null> {
  const identity = await currentIdentity();
  return identity?.role === 'admin' ? identity : null;
}

/**
 * Guard for the top of a Server Action.
 *
 * The refusal branch is shaped so it can be returned directly as an
 * `ActionResult<T>` of any `T` — the caller writes `if (!guard.ok) return guard`
 * and keeps its own return type.
 */
export async function adminOrRefusal(): Promise<
  { ok: true; identity: AdminIdentity } | { ok: false; error: string; field?: string }
> {
  const identity = await requireAdmin();
  if (!identity) return { ok: false, error: 'adminErrors.notAuthorized' };
  return { ok: true, identity };
}

/**
 * Records a privileged action (FR-016, FR-085).
 *
 * `log_admin_action` takes the actor from `auth.uid()` and ignores anything the
 * caller says about it, so the log records who acted rather than who claimed to
 * (migration 0014). There is no INSERT policy on the table for that reason.
 */
export async function recordAudit(
  action: string,
  target: { type: string; id: string },
  detail?: Record<string, unknown>,
): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc('log_admin_action', {
    p_action: action,
    p_target_type: target.type,
    p_target_id: target.id,
    p_detail: detail ?? null,
  });
}
