import { createZip } from './zip';

/**
 * Workbook generation, in the browser (T104, FR-079, research R19).
 *
 * **Never imported statically, and never by a storefront route.** The reports
 * screen loads it with `await import('@/lib/reports/xlsx')` at the moment
 * someone presses the button, so a customer browsing the shop never downloads
 * a byte of it. That is the whole reason it lives in its own module.
 *
 * It runs in the browser rather than on the server because a Cloudflare Worker
 * has roughly 10 ms of CPU per request. Building a workbook is not expensive,
 * but it is not free either, and the visitor's machine is idle.
 *
 * What this gives that the CSV does not:
 *
 *   - **Real numbers.** A CSV hands Excel a string and hopes; here revenue is a
 *     number with a currency format, so it sums and sorts correctly without
 *     anyone re-typing a column.
 *   - **Right-to-left sheets.** The sheet opens with column A on the right for
 *     an Arabic reader, which is what makes it feel like their spreadsheet
 *     rather than a translated one.
 *
 * The formula-injection guard the CSV writer needs has no equivalent here, and
 * does not need one: cells in this format are *typed*. A product named
 * `=SUM(A1:A9)` is written as `t="inlineStr"`, and a string cell is a string —
 * a formula would have to be declared with an `<f>` element, which nothing here
 * emits.
 */

export interface SheetColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
  /** Money in piastres — written as pounds with a currency format. */
  money?: boolean;
  width?: number;
}

/** XML text escaping. Product names contain ampersands more often than you'd think. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `1` → `A`, `27` → `AA`. */
function columnLetter(index: number): string {
  let result = '';
  let n = index;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/**
 * Styles.
 *
 * Three: the default, a bold header, and Egyptian pounds to two decimals. The
 * currency format is what makes a column of money behave like money in a
 * spreadsheet rather than like a list of numbers that happen to have a point in
 * them.
 */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;EGP&quot;"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/**
 * Right-to-left is a property of the *sheet view*, not of the workbook — there
 * is no workbook-level RTL flag in the format, and inventing one makes the file
 * unreadable to strict parsers. It is set on `sheetView` below.
 */
function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<workbookPr/>
<bookViews><workbookView/></bookViews>
<sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

/**
 * Builds the workbook and returns it as a Blob.
 *
 * Strings are written inline (`t="inlineStr"`) rather than through a shared
 * strings table. The table saves space when values repeat, which report rows
 * rarely do, and inline strings keep the writer small enough to read.
 */
export function createWorkbook<T>({
  rows,
  columns,
  sheetName,
  rtl,
  emptyMessage,
}: {
  rows: T[];
  columns: SheetColumn<T>[];
  sheetName: string;
  /** Opens with column A on the right, for an Arabic reader. */
  rtl: boolean;
  /** Written as a single row when the range is empty (FR-084). */
  emptyMessage: string;
}): Blob {
  const lines: string[] = [];

  const widths = columns
    .map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width ?? 22}" customWidth="1"/>`)
    .join('');

  lines.push(
    `<row r="1">${columns
      .map(
        (column, index) =>
          `<c r="${columnLetter(index + 1)}1" s="1" t="inlineStr"><is><t>${xmlEscape(column.header)}</t></is></c>`,
      )
      .join('')}</row>`,
  );

  if (rows.length === 0) {
    // An empty sheet is indistinguishable from a failed download, so it says so.
    lines.push(
      `<row r="2"><c r="A2" t="inlineStr"><is><t>${xmlEscape(emptyMessage)}</t></is></c></row>`,
    );
  }

  for (const [rowIndex, row] of rows.entries()) {
    const cells = columns
      .map((column, columnIndex) => {
        const reference = `${columnLetter(columnIndex + 1)}${rowIndex + 2}`;
        const raw = column.value(row);

        if (raw === null || raw === undefined || raw === '') {
          return `<c r="${reference}"/>`;
        }

        if (column.money && typeof raw === 'number') {
          // Piastres become pounds exactly once, here, and arrive as a real
          // number so the spreadsheet can sum the column.
          return `<c r="${reference}" s="2"><v>${(raw / 100).toFixed(2)}</v></c>`;
        }

        if (typeof raw === 'number') {
          return `<c r="${reference}"><v>${raw}</v></c>`;
        }

        if (typeof raw === 'boolean') {
          return `<c r="${reference}" t="b"><v>${raw ? 1 : 0}</v></c>`;
        }

        return `<c r="${reference}" t="inlineStr"><is><t>${xmlEscape(String(raw))}</t></is></c>`;
      })
      .join('');

    lines.push(`<row r="${rowIndex + 2}">${cells}</row>`);
  }

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths}</cols>
<sheetData>${lines.join('')}</sheetData>
</worksheet>`;

  return createZip([
    { name: '[Content_Types].xml', content: CONTENT_TYPES },
    { name: '_rels/.rels', content: ROOT_RELS },
    { name: 'xl/workbook.xml', content: workbookXml(sheetName) },
    { name: 'xl/_rels/workbook.xml.rels', content: WORKBOOK_RELS },
    { name: 'xl/styles.xml', content: STYLES },
    { name: 'xl/worksheets/sheet1.xml', content: sheet },
  ]);
}
