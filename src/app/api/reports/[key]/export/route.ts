import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, requireAdmin } from '@/lib/actions/admin/guard';
import { REPORTS } from '@/lib/reports/definitions';
import { toCsv, emptyCsv, exportFilename } from '@/lib/reports/csv';
import { rangeFromParams } from '@/lib/reports/range';

/**
 * Report downloads (T103, FR-081, FR-083, FR-085).
 *
 * The route does four things and refuses to do a fifth:
 *
 *   1. Checks the caller's role — staff for most reports, admin for margin and
 *      profit. The database checks again inside the function, so this is the
 *      polite refusal rather than the boundary.
 *   2. Calls **the same function the screen calls**. A download assembled by
 *      different code from its display will eventually disagree with it, and
 *      the owner discovers that while reconciling with an accountant.
 *   3. Writes a `report_exports` row. A spreadsheet that leaves the building
 *      cannot be recalled; recording that it left is the least the system owes.
 *   4. Returns an explicit marker for an empty range rather than an empty file,
 *      because an empty file reads as a broken download (FR-084).
 *
 * It does not accept a row limit, an arbitrary column list, or raw SQL. The
 * report key selects from a fixed registry; anything unrecognised is a 404.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const definition = REPORTS[key];

  if (!definition) {
    return NextResponse.json({ error: 'unknown_report' }, { status: 404 });
  }

  const identity = definition.adminOnly ? await requireAdmin() : await requireStaff();
  if (!identity) {
    return NextResponse.json({ error: 'not_authorized' }, { status: 403 });
  }

  const url = new URL(request.url);
  const range = rangeFromParams({
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  });

  const rows = await definition.fetch(range);

  const arabicHeaders = definition.columns.map((column) => column.header);
  const body =
    rows.length === 0
      ? emptyCsv(arabicHeaders, 'لا توجد بيانات في هذه الفترة / No data in this range')
      : toCsv(rows, definition.columns);

  // Recorded after the data is in hand, so a refused report is not logged as a
  // download that happened. The actor comes from auth.uid() inside the
  // function, not from anything this route passes.
  const supabase = await createClient();
  await supabase.rpc('log_report_export', {
    p_report_key: key,
    p_format: 'csv',
    p_from: range.from,
    p_to: range.to,
    p_row_count: rows.length,
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      // `charset=utf-8` and the BOM together: the header is what a browser
      // reads, the BOM is what Excel reads, and they disagree often enough that
      // both are needed.
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename(key, range.from, range.to, 'csv')}"`,
      // A report is a snapshot of a moment. Caching one and serving it after
      // another order lands would be worse than making the owner wait.
      'Cache-Control': 'no-store',
    },
  });
}
