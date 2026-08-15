import { NextResponse } from 'next/server';
// Listing and removing storage objects is a system operation with no session
// behind it.
// eslint-disable-next-line no-restricted-imports
import { createServiceClient } from '@/lib/supabase/service';
import { cronSecretMatches, cronRefusal } from '@/lib/cron';

/**
 * Reclaims storage nothing points at (T116).
 *
 * `uploadProductPhoto` compensates when its own database write fails, but a
 * request that dies between the upload and the insert cannot compensate for
 * itself. Those files are invisible — no row references them — and they consume
 * the same 1 GB every product photo competes for.
 *
 * Only objects older than an hour are considered, so an upload still in flight
 * is never mistaken for an orphan.
 */
export const dynamic = 'force-dynamic';

const BUCKET = 'product-images';

export async function GET(request: Request) {
  if (!cronSecretMatches(request)) return cronRefusal();

  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc('orphan_image_paths', { p_limit: 500 });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const paths = ((data ?? []) as { storage_path: string }[]).map((row) => row.storage_path);

  if (paths.length === 0) {
    return NextResponse.json({ ok: true, removed: 0, at: new Date().toISOString() });
  }

  const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
  if (removeError) {
    return NextResponse.json(
      { ok: false, step: 'remove', found: paths.length, error: removeError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, removed: paths.length, at: new Date().toISOString() });
}
