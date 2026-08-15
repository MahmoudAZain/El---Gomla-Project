import { NextResponse } from 'next/server';
// The keep-alive must reach Supabase even when no customer has visited, so it
// cannot use a session client — there is no session. This is a scheduled
// system task, one of the narrow set of legitimate service-role uses.
// eslint-disable-next-line no-restricted-imports
import { createServiceClient } from '@/lib/supabase/service';
import { cronSecretMatches, cronRefusal } from '@/lib/cron';

/**
 * Keep-alive (T114, FR-069).
 *
 * **This is not optional.** A free-tier Supabase project pauses after seven
 * days without an API request. A shop that is quiet over a holiday week would
 * come back to a paused database and a storefront returning errors, and the
 * owner would have no idea why.
 *
 * Six-hourly gives four requests a day — trivially inside every quota, and
 * enough that several consecutive failures still leave days of margin.
 *
 * The query is deliberately the cheapest one available: a count of a small,
 * indexed table with no rows returned.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!cronSecretMatches(request)) return cronRefusal();

  const supabase = createServiceClient();

  const { count, error } = await supabase
    .from('governorates')
    .select('id', { count: 'exact', head: true });

  if (error) {
    // A 500 is what makes this visible: Cloudflare records a failed scheduled
    // invocation, which is the only alarm this system has.
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, governorates: count ?? 0, at: new Date().toISOString() });
}
