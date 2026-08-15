import { NextResponse } from 'next/server';
// Scheduled maintenance runs as the system: there is no session, and the
// sweeps touch tables no client role has a grant on.
// eslint-disable-next-line no-restricted-imports
import { createServiceClient } from '@/lib/supabase/service';
import { cronSecretMatches, cronRefusal } from '@/lib/cron';

/**
 * Daily sweeps (T115, T118).
 *
 * Two jobs that keep the shop inside the free tier's ceilings:
 *
 *   - `login_attempts` is trimmed to a day. It exists to rate-limit sign-in
 *     over a fifteen-minute window, so everything older is dead weight — and
 *     it is the fastest-growing table in the system.
 *   - Storage is measured, and the response says plainly when it passes 700 MB
 *     of the 1 GB allowance. The failure past the ceiling is that staff can no
 *     longer add product photos, and nothing would tell them why.
 */
export const dynamic = 'force-dynamic';

/** 700 MB of the 1 GB bucket — early enough to act, late enough not to nag. */
const STORAGE_WARN_BYTES = 700 * 1024 * 1024;

export async function GET(request: Request) {
  if (!cronSecretMatches(request)) return cronRefusal();

  const supabase = createServiceClient();

  const { data: removed, error: sweepError } = await supabase.rpc('sweep_login_attempts');
  if (sweepError) {
    return NextResponse.json({ ok: false, step: 'sweep', error: sweepError.message }, { status: 500 });
  }

  const { data: usage } = await supabase.rpc('storage_usage');
  const row = (usage as { bytes: number | null; object_count: number | null }[] | null)?.[0];
  const bytes = row?.bytes ?? null;

  const warning =
    bytes !== null && bytes > STORAGE_WARN_BYTES
      ? `storage at ${Math.round(bytes / 1024 / 1024)}MB of the 1024MB free-tier ceiling`
      : null;

  return NextResponse.json({
    ok: true,
    login_attempts_removed: removed ?? 0,
    storage_bytes: bytes,
    storage_objects: row?.object_count ?? null,
    warning,
    at: new Date().toISOString(),
  });
}
