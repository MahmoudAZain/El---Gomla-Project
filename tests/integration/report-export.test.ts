import { describe, it, expect } from 'vitest';
import {
  toCsv,
  emptyCsv,
  escapeCell,
  piastresToDecimal,
  exportFilename,
  UTF8_BOM,
  type CsvColumn,
} from '@/lib/reports/csv';
import {
  cairoToday,
  presetRange,
  rangeFromParams,
  matchPreset,
  isValidDate,
} from '@/lib/reports/range';

/**
 * The export writer (T108, FR-079, FR-081, FR-084, SC-020).
 *
 * Each group here corresponds to a way a spreadsheet export goes wrong in the
 * field rather than in a test: mojibake, a live formula, a shifted column, a
 * file that looks like a failed download, or a date that lands on the wrong day
 * because the server is in UTC.
 */

interface Row {
  name: string;
  qty: number;
  revenue: number;
}

const columns: CsvColumn<Row>[] = [
  { header: 'المنتج / Product', value: (r) => r.name },
  { header: 'الكمية / Units', value: (r) => r.qty },
  { header: 'الإيراد / Revenue', value: (r) => piastresToDecimal(r.revenue) },
];

describe('the byte-order mark (FR-079)', () => {
  it('begins the file with EF BB BF', () => {
    const csv = toCsv([{ name: 'لبن', qty: 2, revenue: 9000 }], columns);
    const bytes = new TextEncoder().encode(csv);

    // Without these three bytes, Excel on Windows opens the file in the system
    // code page and every Arabic name becomes mojibake.
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
  });

  it('puts the BOM on an empty-range file too', () => {
    expect(emptyCsv(['Day'], 'No data').startsWith(UTF8_BOM)).toBe(true);
  });

  it('round-trips Arabic through an encode and decode', () => {
    const name = 'لبن كامل الدسم ١ لتر';
    const csv = toCsv([{ name, qty: 1, revenue: 4500 }], columns);
    const decoded = new TextDecoder('utf-8').decode(new TextEncoder().encode(csv));
    expect(decoded).toContain(name);
  });
});

describe('formula injection (FR-080, research R19)', () => {
  it('neutralises a product named like a formula', () => {
    expect(escapeCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
  });

  it('neutralises the dangerous command form', () => {
    // This one is not a nuisance — unescaped, it is remote code execution in
    // older Excel via DDE.
    expect(escapeCell("=cmd|'/c calc'!A0")).toBe("'=cmd|'/c calc'!A0");
  });

  it('neutralises every trigger character', () => {
    for (const prefix of ['=', '+', '-', '@', '\t', '\r']) {
      const escaped = escapeCell(`${prefix}danger`);

      // The guard is the apostrophe immediately before the trigger. A value
      // containing a carriage return is *also* RFC-quoted afterwards, which
      // puts the apostrophe one character in — so the check unwraps the quoting
      // before looking, rather than assuming the apostrophe is first.
      const unquoted = escaped.startsWith('"') ? escaped.slice(1, -1).replace(/""/g, '"') : escaped;

      expect(unquoted).toBe(`'${prefix}danger`);
    }
  });

  it('leaves an ordinary name alone', () => {
    expect(escapeCell('لبن')).toBe('لبن');
    expect(escapeCell('Fresh Milk')).toBe('Fresh Milk');
  });

  it('escapes a formula name inside a real file', () => {
    const csv = toCsv([{ name: '=SUM(A1:A9)', qty: 1, revenue: 100 }], columns);
    expect(csv).toContain("'=SUM(A1:A9)");
  });
});

describe('RFC 4180 quoting', () => {
  it('quotes a value containing a comma', () => {
    // Arabic product names routinely contain commas; a naive join shifts every
    // column after them and nobody notices until the totals are wrong.
    expect(escapeCell('Milk, full fat')).toBe('"Milk, full fat"');
  });

  it('doubles an embedded quote', () => {
    expect(escapeCell('The "big" pack')).toBe('"The ""big"" pack"');
  });

  it('quotes a value containing a newline', () => {
    expect(escapeCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('uses CRLF line endings', () => {
    const csv = toCsv([{ name: 'a', qty: 1, revenue: 100 }], columns);
    expect(csv).toContain('\r\n');
  });

  it('writes one header row and one row per record', () => {
    const rows: Row[] = [
      { name: 'a', qty: 1, revenue: 100 },
      { name: 'b', qty: 2, revenue: 200 },
    ];
    const lines = toCsv(rows, columns).trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
  });
});

describe('money in the file', () => {
  it('writes decimal pounds, not piastres', () => {
    expect(piastresToDecimal(4550)).toBe('45.50');
    expect(piastresToDecimal(4500)).toBe('45.00');
    expect(piastresToDecimal(5)).toBe('0.05');
    expect(piastresToDecimal(0)).toBe('0.00');
  });

  it('keeps a negative amount readable', () => {
    expect(piastresToDecimal(-4550)).toBe('-45.50');
  });

  it('never loses a piastre to floating point', () => {
    for (const value of [1, 99, 100, 12345, 999999, 100000001]) {
      const decimal = piastresToDecimal(value);
      expect(Math.round(parseFloat(decimal) * 100)).toBe(value);
    }
  });
});

describe('an empty range (FR-084)', () => {
  it('returns a marker row rather than an empty file', () => {
    const csv = emptyCsv(['Day', 'Revenue'], 'No data in this range');
    expect(csv).toContain('No data in this range');
    // An empty file is indistinguishable from a failed download.
    expect(csv.replace(UTF8_BOM, '').trim().split('\r\n')).toHaveLength(2);
  });
});

describe('volume (SC-020)', () => {
  it('writes five thousand rows without special-casing', () => {
    const rows: Row[] = Array.from({ length: 5000 }, (_, i) => ({
      name: `منتج ${i}`,
      qty: i,
      revenue: i * 100,
    }));

    const csv = toCsv(rows, columns);
    expect(csv.trimEnd().split('\r\n')).toHaveLength(5001);
  });
});

describe('filenames', () => {
  it('names the file after the report and its range', () => {
    expect(exportFilename('sales', '2025-01-01', '2025-01-31', 'csv')).toBe(
      'sales-2025-01-01-to-2025-01-31.csv',
    );
  });
});

describe('Cairo ranges (FR-073)', () => {
  it('reads today in Cairo, not in the server timezone', () => {
    // 22:30 UTC on the 15th is already the 16th in Cairo. A server computing
    // "today" in UTC would show the owner an empty dashboard on a busy evening.
    const late = new Date('2025-01-15T22:30:00Z');
    expect(cairoToday(late)).toBe('2025-01-16');
  });

  it('still reads the same day earlier in the evening', () => {
    expect(cairoToday(new Date('2025-01-15T18:00:00Z'))).toBe('2025-01-15');
  });

  it('gives today as a single-day range', () => {
    const range = presetRange('today', new Date('2025-03-12T09:00:00Z'));
    expect(range.from).toBe(range.to);
  });

  it('starts the week on Saturday, as the Egyptian week does', () => {
    // 2025-03-12 is a Wednesday; the Saturday before is the 8th.
    const range = presetRange('week', new Date('2025-03-12T09:00:00Z'));
    expect(range.from).toBe('2025-03-08');
    expect(range.to).toBe('2025-03-12');
  });

  it('runs this month from the first to today', () => {
    const range = presetRange('month', new Date('2025-03-12T09:00:00Z'));
    expect(range).toEqual({ from: '2025-03-01', to: '2025-03-12' });
  });

  it('covers the whole of last month, including its last day', () => {
    const range = presetRange('lastMonth', new Date('2025-03-12T09:00:00Z'));
    expect(range).toEqual({ from: '2025-02-01', to: '2025-02-28' });
  });

  it('handles a leap February', () => {
    const range = presetRange('lastMonth', new Date('2024-03-12T09:00:00Z'));
    expect(range).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });

  it('handles the January-to-December rollover', () => {
    const range = presetRange('lastMonth', new Date('2025-01-12T09:00:00Z'));
    expect(range).toEqual({ from: '2024-12-01', to: '2024-12-31' });
  });
});

describe('reading a range off the URL', () => {
  it('accepts a valid pair', () => {
    expect(rangeFromParams({ from: '2025-01-01', to: '2025-01-31' })).toEqual({
      from: '2025-01-01',
      to: '2025-01-31',
    });
  });

  it('swaps a reversed range rather than refusing it', () => {
    // "December to March" is a typo with an obvious intention.
    expect(rangeFromParams({ from: '2025-03-01', to: '2025-01-01' })).toEqual({
      from: '2025-01-01',
      to: '2025-03-01',
    });
  });

  it('falls back to this month for a malformed date', () => {
    const now = new Date('2025-03-12T09:00:00Z');
    expect(rangeFromParams({ from: 'not-a-date', to: '2025-03-31' }, now).from).toBe('2025-03-01');
  });

  it('rejects a date that is the right shape but not a real day', () => {
    expect(isValidDate('2025-02-30')).toBe(false);
    expect(isValidDate('2025-13-01')).toBe(false);
    expect(isValidDate('2025-02-28')).toBe(true);
  });

  it('recognises which preset a range corresponds to', () => {
    const now = new Date('2025-03-12T09:00:00Z');
    expect(matchPreset(presetRange('month', now), now)).toBe('month');
    expect(matchPreset({ from: '2020-01-01', to: '2020-01-02' }, now)).toBe('custom');
  });
});
