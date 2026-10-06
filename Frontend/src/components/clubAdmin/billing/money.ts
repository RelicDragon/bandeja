/**
 * Club money helpers. Club amounts are **integer cents** (`*Cents`, always ÷100 — the backend
 * stores `pricePerHour * 100` for every currency) in `Club.currency`. Formatting uses
 * `Intl.NumberFormat` with the club currency; parsing accepts what an operator types on a numeric
 * keyboard (`12`, `12.5`, `12,50`, `1 200,50`) and never goes through floats for the result.
 */
import { resolveIntlLocale } from '@/utils/intlLocale';

export const CLUB_PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER', 'ONLINE', 'OTHER'] as const;

const cache = new Map<string, Intl.NumberFormat>();

function currencyFormatter(locale: string, currency: string): Intl.NumberFormat | null {
  const key = `${locale}|${currency}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const f = new Intl.NumberFormat(resolveIntlLocale(locale), { style: 'currency', currency });
    cache.set(key, f);
    return f;
  } catch {
    return null;
  }
}

/** `1250, 'EUR', 'en'` → `€12.50`. Non-integer input is rounded to whole cents first. */
export function formatCents(cents: number, currency: string, locale: string): string {
  const whole = Math.round(cents);
  const f = currencyFormatter(locale, currency);
  if (f) return f.format(whole / 100);
  const sign = whole < 0 ? '-' : '';
  const abs = Math.abs(whole);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')} ${currency}`;
}

/**
 * Operator input → cents, or `null` when it is not a non-negative amount with at most two
 * decimals. The last `.` or `,` followed by 1–2 digits is the decimal separator; spaces,
 * apostrophes and other `.`/`,` are grouping.
 */
export function parseMoneyInput(raw: string): number | null {
  const s = raw.replace(/[\s\u00a0\u202f'’]/g, '');
  if (!s) return null;
  if (!/^[0-9.,]+$/.test(s)) return null;
  const m = /^(.*?)(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const intPart = m[1].replace(/[.,]/g, '');
  const frac = m[2] ?? '';
  if (!intPart && !frac) return null;
  if (intPart && !/^\d+$/.test(intPart)) return null;
  // A trailing separator ("12.") or three-digit tail ("1.250") is grouping, already handled; a
  // separator left at the very end is an unfinished entry — accept it as whole units.
  const units = intPart ? Number(intPart) : 0;
  if (!Number.isSafeInteger(units) || units > 10_000_000) return null;
  const cents = frac.length === 0 ? 0 : frac.length === 1 ? Number(frac) * 10 : Number(frac);
  return units * 100 + cents;
}

/** Cents → editable input text (`1250` → `12.50`, `1200` → `12`), using the locale's decimal mark. */
export function centsToInput(cents: number, locale: string): string {
  const whole = Math.max(0, Math.round(cents));
  const units = Math.floor(whole / 100);
  const rest = whole % 100;
  if (rest === 0) return String(units);
  return `${units}${decimalSeparator(locale)}${String(rest).padStart(2, '0')}`;
}

export function decimalSeparator(locale: string): string {
  try {
    const part = new Intl.NumberFormat(resolveIntlLocale(locale)).formatToParts(1.5).find((p) => p.type === 'decimal');
    return part?.value === ',' ? ',' : '.';
  } catch {
    return '.';
  }
}

/** Balance still owed on a charge (0 when waived/void or overpaid). */
export function chargeBalanceCents(charge: { amountCents: number; paidCents: number; status: string }): number {
  if (charge.status === 'WAIVED' || charge.status === 'VOID') return 0;
  return Math.max(0, charge.amountCents - charge.paidCents);
}
