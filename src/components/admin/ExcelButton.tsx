'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { logWorkbookExport } from '@/lib/actions/reports';
import { exportFilename } from '@/lib/reports/csv';
import type { DateRange } from '@/lib/reports/range';

export interface ExcelColumnSpec {
  header: string;
  key: string;
  /** Piastres — written as pounds with a currency number format. */
  money?: boolean;
}

/**
 * Workbook download (T104).
 *
 * The workbook writer is loaded with a dynamic `import()` inside the click
 * handler, so it is a separate chunk that only exists once someone actually
 * wants a file. A storefront visitor never fetches it, and neither does a
 * staff member who only ever reads reports on screen.
 */
export function ExcelButton({
  rows,
  columns,
  reportKey,
  range,
  sheetName,
}: {
  rows: Record<string, unknown>[];
  columns: ExcelColumnSpec[];
  reportKey: string;
  range: DateRange;
  sheetName: string;
}) {
  const t = useTranslations('reports');
  const locale = useLocale();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);

    try {
      const { createWorkbook } = await import('@/lib/reports/xlsx');

      const blob = createWorkbook({
        rows,
        columns: columns.map((column) => ({
          header: column.header,
          money: column.money,
          value: (row: Record<string, unknown>) =>
            row[column.key] as string | number | boolean | null | undefined,
        })),
        sheetName,
        // Column A on the right for an Arabic reader — what makes the file feel
        // like their spreadsheet rather than a translated one.
        rtl: locale === 'ar',
        emptyMessage: t('noDataInRange'),
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exportFilename(reportKey, range.from, range.to, 'xlsx');
      anchor.click();
      URL.revokeObjectURL(url);

      // Recorded after the file is in the user's hands, not before — a failed
      // build should not appear in the log as a download that happened.
      await logWorkbookExport(reportKey, range.from, range.to, rows.length);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="flex min-h-touch items-center rounded border border-rule px-3 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
    >
      {busy ? t('preparing') : t('downloadExcel')}
    </button>
  );
}
