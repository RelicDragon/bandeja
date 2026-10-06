/**
 * CSV for club report exports (pure). RFC 4180 quoting, CRLF rows, and spreadsheet formula
 * injection defence: a text cell starting with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`
 * so Excel / Sheets show it as text instead of evaluating it. Numbers are written as-is.
 */

export const CSV_BOM = '\uFEFF';

export type CsvValue = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : String(value);
  if (typeof value === 'string' && FORMULA_START.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRow(values: readonly CsvValue[]): string {
  return `${values.map(csvCell).join(',')}\r\n`;
}

/** Integer cents → `12.50` (major units, two decimals). */
export function centsToDecimal(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
