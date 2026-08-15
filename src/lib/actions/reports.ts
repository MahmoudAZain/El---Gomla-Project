'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Records a workbook download (FR-085).
 *
 * The CSV route logs its own exports as it streams them. A workbook is built in
 * the browser, so nothing server-side would otherwise know it happened — hence
 * this. `log_report_export` takes the actor from `auth.uid()` and refuses a
 * non-staff caller, so the worst a customer can do here is be refused.
 */
export async function logWorkbookExport(
  reportKey: string,
  from: string,
  to: string,
  rowCount: number,
): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc('log_report_export', {
    p_report_key: reportKey,
    p_format: 'xlsx',
    p_from: from,
    p_to: to,
    p_row_count: rowCount,
  });
}
