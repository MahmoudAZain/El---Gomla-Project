import { NextResponse } from 'next/server';
// The export must read every table regardless of RLS — it is a backup, and a
// backup that respects row policies backs up nothing.
// eslint-disable-next-line no-restricted-imports
import { createServiceClient } from '@/lib/supabase/service';
import { cronSecretMatches, cronRefusal } from '@/lib/cron';

/**
 * The weekly data export (T117, research R13).
 *
 * **This is the only recovery point this system has.** The Supabase free tier
 * takes no backups and offers no point-in-time recovery; the business has
 * chosen to launch on it anyway, which makes this job load-bearing rather than
 * a nice-to-have. Losing it means losing everything back to the last export,
 * and there would be nothing to restore from.
 *
 * What it does *not* export is as deliberate as what it does:
 *
 *   - **`product_costs` is included.** It is business-critical data and this is
 *     a backup, not a report. The file is written to a private bucket that has
 *     no public-read policy, unlike product images.
 *   - **Passwords are not, and cannot be.** They live in `auth.users` as hashes
 *     the API does not expose. A restore therefore recreates accounts but not
 *     credentials, which is a limitation worth knowing before the day it
 *     matters — staff-mediated resets exist for exactly this.
 *
 * The output is newline-delimited JSON per table, not SQL. It restores through
 * the same client that wrote it and needs no assumptions about schema version.
 */
export const dynamic = 'force-dynamic';

/**
 * Order matters on restore: a table is listed after everything it references,
 * so replaying the file in sequence never violates a foreign key.
 */
const TABLES = [
  'governorates',
  'profiles',
  'addresses',
  'categories',
  'brands',
  'products',
  'product_costs',
  'product_photos',
  'promotions',
  'orders',
  'order_items',
  'order_status_history',
  'admin_audit_log',
] as const;

/** Rows per request. Large enough to be few round trips, small enough to hold. */
const PAGE = 1000;

export async function GET(request: Request) {
  if (!cronSecretMatches(request)) return cronRefusal();

  const supabase = createServiceClient();
  const parts: string[] = [];
  const counts: Record<string, number> = {};

  for (const table of TABLES) {
    let from = 0;

    for (;;) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .range(from, from + PAGE - 1);

      if (error) {
        return NextResponse.json(
          { ok: false, table, error: error.message },
          { status: 500 },
        );
      }

      const rows = data ?? [];
      for (const row of rows) {
        parts.push(JSON.stringify({ table, row }));
      }

      counts[table] = (counts[table] ?? 0) + rows.length;

      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const path = `${stamp}/export-${Date.now()}.ndjson`;
  const body = `${parts.join('\n')}\n`;

  // A separate bucket from product images, and a private one: this file
  // contains every customer's phone number and address, and every cost price.
  const { error: uploadError } = await supabase.storage
    .from('backups')
    .upload(path, new Blob([body], { type: 'application/x-ndjson' }), {
      contentType: 'application/x-ndjson',
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { ok: false, step: 'upload', error: uploadError.message, counts },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    path,
    bytes: body.length,
    counts,
    at: new Date().toISOString(),
  });
}
