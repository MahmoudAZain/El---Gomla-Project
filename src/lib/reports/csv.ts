/**
 * CSV export (T102, FR-079, FR-080, research R19).
 *
 * Three things here are not optional, and each one exists because its absence
 * produces a specific, real failure:
 *
 *   1. **A UTF-8 byte-order mark.** Excel on Windows opens a BOM-less UTF-8
 *      file in the system code page, and every Arabic product name becomes
 *      mojibake. The three bytes `EF BB BF` are the whole fix, and without
 *      them an Arabic-first shop cannot hand its accountant a file.
 *   2. **A formula-injection guard.** A product named `=SUM(A1:A9)` or, worse,
 *      `=cmd|'/c calc'!A0` is a live formula the moment the file opens. Values
 *      beginning `=`, `+`, `-`, `@`, tab or carriage return are prefixed with an
 *      apostrophe so the spreadsheet treats them as text.
 *   3. **RFC 4180 quoting.** Fields containing a comma, a quote or a newline are
 *      quoted, and embedded quotes doubled. Arabic names routinely contain
 *      commas; a naive join silently shifts every column after them.
 *
 * Money is written as decimal pounds — `45.50`, not `4550`. The file is read by
 * a person in a spreadsheet, and piastres would have every reader dividing by a
 * hundred in their head or, worse, not noticing.
 */

/** The three bytes that make Excel read UTF-8 as UTF-8. */
export const UTF8_BOM = '﻿';

/**
 * Characters that make a spreadsheet treat a cell as a formula.
 *
 * The leading `-` catches negative numbers too, which is why numeric values are
 * formatted before they reach here and never passed as user text.
 */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

export function escapeCell(value: string): string {
  let cell = value;

  if (cell.length > 0 && FORMULA_TRIGGERS.includes(cell[0] as string)) {
    // A leading apostrophe is the convention every major spreadsheet
    // understands as "this is text". It is stripped on display.
    cell = `'${cell}`;
  }

  if (/[",\n\r]/.test(cell)) {
    cell = `"${cell.replace(/"/g, '""')}"`;
  }

  return cell;
}

/** `4550` → `"45.50"`. The one place piastres become pounds in an export. */
export function piastresToDecimal(piastres: number): string {
  const sign = piastres < 0 ? '-' : '';
  const absolute = Math.abs(piastres);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<T> {
  header: string;
  /** Return a plain value; money should already be `piastresToDecimal`'d. */
  value: (row: T) => CsvValue;
}

function render(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
}

/**
 * Builds the file.
 *
 * Line endings are CRLF, which is what RFC 4180 specifies and what Excel
 * expects; every other spreadsheet copes with it.
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines: string[] = [];

  lines.push(columns.map((column) => escapeCell(column.header)).join(','));

  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(render(column.value(row)))).join(','));
  }

  return UTF8_BOM + lines.join('\r\n') + '\r\n';
}

/**
 * The marker for a range with nothing in it (FR-084).
 *
 * An empty file is indistinguishable from a failed download, and the person who
 * receives one will ask whether the export is broken. A single row saying so in
 * their language answers the question before it is asked.
 */
export function emptyCsv(headers: string[], message: string): string {
  return (
    UTF8_BOM +
    [headers.map(escapeCell).join(','), escapeCell(message)].join('\r\n') +
    '\r\n'
  );
}

/** `sales-2025-01-01-to-2025-01-31.csv` — sortable, and obvious in a downloads folder. */
export function exportFilename(key: string, from: string, to: string, extension: string): string {
  return `${key}-${from}-to-${to}.${extension}`;
}
