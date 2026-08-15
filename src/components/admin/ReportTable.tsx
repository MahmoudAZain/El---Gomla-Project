import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import type { DateRange } from '@/lib/reports/range';
import { ExcelButton, type ExcelColumnSpec } from './ExcelButton';

export interface ReportColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
  /** Numbers get tabular figures and align to the inline end. */
  numeric?: boolean;
  /** Dropped on phones, where only the first columns fit meaningfully. */
  hideOnMobile?: boolean;
}

/**
 * A report table with its download button (T097–T101).
 *
 * Server-rendered, and deliberately not the sortable `DataTable` the catalog
 * uses. A report arrives already ordered by the thing that matters — revenue,
 * usually — and re-sorting it in the browser invites the reader to believe a
 * different ordering is also authoritative when the export will not match it.
 *
 * The export link points at the same range the table was built from, so what
 * downloads is what is on screen (FR-081).
 */
export async function ReportTable<T>({
  title,
  rows,
  columns,
  getRowKey,
  exportKey,
  range,
  note,
  excelColumns,
}: {
  title: string;
  rows: T[];
  columns: ReportColumn<T>[];
  getRowKey: (row: T) => string;
  /** Omit to hide the download buttons. */
  exportKey?: string;
  range: DateRange;
  note?: string;
  /**
   * Raw field names for the workbook. The CSV goes through the server, which
   * reads the same query the table did; the workbook is built in the browser
   * from the rows already on the page, so it needs to know which keys to take.
   */
  excelColumns?: ExcelColumnSpec[];
}) {
  const t = await getTranslations('reports');

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">{title}</h2>

        {exportKey && rows.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/reports/${exportKey}/export?from=${range.from}&to=${range.to}`}
              className="flex min-h-touch items-center rounded border border-rule px-3 text-sm font-semibold text-ink-2 hover:border-brand hover:text-brand"
              // A real navigation, not fetch-and-blob: the browser's own download
              // handling is what puts the file somewhere the owner can find it.
              download
            >
              {t('downloadCsv')}
            </a>

            {excelColumns && (
              <ExcelButton
                rows={rows as Record<string, unknown>[]}
                columns={excelColumns}
                reportKey={exportKey}
                range={range}
                sheetName={title}
              />
            )}
          </div>
        )}
      </div>

      {note && <p className="text-xs text-ink-3">{note}</p>}

      {rows.length === 0 ? (
        <p className="rounded border border-rule bg-surface px-4 py-8 text-center text-ink-2">
          {t('noDataInRange')}
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded border border-rule bg-surface sm:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-rule">
                  {columns.map((column) => (
                    <th
                      key={column.header}
                      scope="col"
                      className={[
                        'px-3 py-2 font-semibold text-ink-2',
                        column.numeric ? 'text-end' : 'text-start',
                      ].join(' ')}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={getRowKey(row)} className="border-b border-rule last:border-0">
                    {columns.map((column) => (
                      <td
                        key={column.header}
                        className={[
                          'px-3 py-2 text-ink',
                          // Tabular figures in a column of numbers, so digits
                          // line up down the page.
                          column.numeric ? 'text-end tabular' : 'text-start',
                        ].join(' ')}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-2 sm:hidden">
            {rows.map((row) => (
              <li
                key={getRowKey(row)}
                className="flex flex-col gap-1 rounded border border-rule bg-surface p-3"
              >
                {columns
                  .filter((column) => !column.hideOnMobile)
                  .map((column) => (
                    <div key={column.header} className="flex items-baseline justify-between gap-3">
                      <span className="text-xs font-semibold text-ink-3">{column.header}</span>
                      <span className={column.numeric ? 'text-sm text-ink tabular' : 'text-sm text-ink'}>
                        {column.cell(row)}
                      </span>
                    </div>
                  ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
