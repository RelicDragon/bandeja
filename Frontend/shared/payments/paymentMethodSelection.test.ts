import { describe, expect, it } from 'vitest';
import {
  MAX_PAYMENT_METHODS,
  PAYMENT_HINT_MAX_LENGTH,
  formatPaymentMethodsSummary,
  parsePaymentMethods,
  paymentMethodsFromLegacyHint,
  resolvePaymentMethods,
  validatePaymentMethods,
} from './paymentMethodSelection';

const codes = (raw: unknown) => validatePaymentMethods(raw).issues.map((i) => i.code);

/**
 * Postgres counts `VarChar(120)` in **characters**, not UTF-16 units, so an
 * emoji costs one there and two in `String.length`. The column limit is the
 * one that matters.
 */
const charLength = (value: string) => Array.from(value).length;

describe('parsePaymentMethods', () => {
  it('drops anything it cannot make sense of instead of throwing', () => {
    expect(parsePaymentMethods(null)).toEqual([]);
    expect(parsePaymentMethods('x')).toEqual([]);
    expect(parsePaymentMethods([null, 3, 'x', {}])).toEqual([]);
    expect(parsePaymentMethods([{ method: 'GONE_IN_2027', handle: 'x' }])).toEqual([]);
  });

  it('drops a method that lost its handle', () => {
    expect(parsePaymentMethods([{ method: 'BIZUM', handle: '  ' }])).toEqual([]);
    // …but CASH never had one.
    expect(parsePaymentMethods([{ method: 'CASH', handle: null }])).toEqual([
      { method: 'CASH', handle: null },
    ]);
  });

  it('collapses pasted whitespace and keeps the readable spaces', () => {
    expect(parsePaymentMethods([{ method: 'IBAN', handle: ' RS35\n 1050  0812 ' }])).toEqual([
      { method: 'IBAN', handle: 'RS35 1050 0812' },
    ]);
  });

  it('de-duplicates and caps the list', () => {
    const raw = [
      { method: 'BIZUM', handle: '+34600112233' },
      { method: 'BIZUM', handle: '+34600999999' },
      { method: 'CASH', handle: null },
      { method: 'IBAN', handle: 'ES9121000418450200051332' },
      { method: 'REVOLUT', handle: '@marko' },
    ];
    expect(parsePaymentMethods(raw).map((e) => e.method)).toEqual(['BIZUM', 'CASH', 'IBAN']);
    expect(parsePaymentMethods(raw)).toHaveLength(MAX_PAYMENT_METHODS);
  });
});

describe('validatePaymentMethods', () => {
  it('accepts a well-formed list', () => {
    const result = validatePaymentMethods([
      { method: 'IPS_PRENESI', handle: '+381 60 111 2233' },
      { method: 'CASH', handle: 'ignored' },
    ]);
    expect(result.issues).toEqual([]);
    expect(result.value).toEqual([
      { method: 'IPS_PRENESI', handle: '+381 60 111 2233' },
      { method: 'CASH', handle: null },
    ]);
  });

  it('treats null and an empty array as "no methods"', () => {
    expect(validatePaymentMethods(null)).toEqual({ value: [], issues: [] });
    expect(validatePaymentMethods([])).toEqual({ value: [], issues: [] });
  });

  it('reports the shape problems', () => {
    expect(codes('nope')).toEqual(['unknownMethod']);
    expect(codes([{ method: 'NOT_A_METHOD', handle: 'x' }])).toEqual(['unknownMethod']);
    expect(codes([{ method: 'CASH' }, { method: 'CASH' }])).toEqual(['duplicateMethod']);
    expect(
      codes([
        { method: 'CASH' },
        { method: 'BIZUM', handle: '+34600112233' },
        { method: 'IBAN', handle: 'ES9121000418450200051332' },
        { method: 'REVOLUT', handle: '@x' },
      ]),
    ).toEqual(['tooMany']);
  });

  it('reports a missing or malformed handle per row', () => {
    expect(codes([{ method: 'BIZUM', handle: '' }])).toEqual(['handleRequired']);
    expect(codes([{ method: 'BIZUM', handle: 'call me' }])).toEqual(['handleInvalid']);
    expect(codes([{ method: 'IBAN', handle: '1234' }])).toEqual(['handleInvalid']);
    expect(codes([{ method: 'CUSTOM', handle: 'x'.repeat(121) }])).toEqual(['handleTooLong']);
  });

  it('keeps the valid rows when one row is bad', () => {
    const result = validatePaymentMethods([
      { method: 'BIZUM', handle: 'nonsense' },
      { method: 'CASH' },
    ]);
    expect(result.issues.map((i) => i.index)).toEqual([0]);
    expect(result.value).toEqual([{ method: 'CASH', handle: null }]);
  });

  it('does not veto a method that is foreign to where the game is played', () => {
    // A Spaniard organising in Belgrade can still ask for a Bizum: the country
    // list decides what the picker offers, not what the API allows.
    expect(validatePaymentMethods([{ method: 'BIZUM', handle: '+34600112233' }]).issues).toEqual([]);
  });
});

describe('formatPaymentMethodsSummary', () => {
  it('writes one readable line for the legacy field', () => {
    expect(
      formatPaymentMethodsSummary([
        { method: 'IPS_PRENESI', handle: '+381601112233' },
        { method: 'CASH', handle: null },
      ]),
    ).toBe('IPS Prenesi +381601112233 · Cash');
  });

  it('leaves the organiser’s own words unlabelled', () => {
    expect(formatPaymentMethodsSummary([{ method: 'CUSTOM', handle: 'cash at the bar' }])).toBe(
      'cash at the bar',
    );
  });

  it('returns null when there is nothing to say', () => {
    expect(formatPaymentMethodsSummary([])).toBeNull();
    expect(formatPaymentMethodsSummary([{ method: 'CUSTOM', handle: '' }])).toBeNull();
  });

  it('never splits an emoji into an unencodable lone surrogate', () => {
    // A 120-char custom note ending in an emoji, plus cash, forces truncation
    // right at the emoji. Slicing UTF-16 units would leave half of it behind,
    // and a lone surrogate is not valid UTF-8 for Postgres to store.
    const note = `${'x'.repeat(118)}🎾`;
    const summary = formatPaymentMethodsSummary([
      { method: 'CUSTOM', handle: note },
      { method: 'CASH', handle: null },
    ]);
    expect(summary).not.toBeNull();
    expect(charLength(summary!)).toBeLessThanOrEqual(PAYMENT_HINT_MAX_LENGTH);
    // No half of a surrogate pair survived the cut …
    expect(/[\uD800-\uDFFF]/.test(summary!.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))).toBe(
      false,
    );
    // … so the string still round-trips through UTF-8 unchanged.
    expect(Buffer.from(summary!, 'utf8').toString('utf8')).toBe(summary);
    expect(summary!.endsWith('🎾…')).toBe(true);
  });

  it('never exceeds the legacy column width', () => {
    const summary = formatPaymentMethodsSummary([
      { method: 'CUSTOM', handle: 'x'.repeat(110) },
      { method: 'IBAN', handle: 'ES91 2100 0418 4502 0005 1332' },
      { method: 'CASH', handle: null },
    ]);
    expect(summary).not.toBeNull();
    expect(charLength(summary!)).toBeLessThanOrEqual(PAYMENT_HINT_MAX_LENGTH);
    expect(summary!.endsWith('…')).toBe(true);
  });
});

describe('legacy hints', () => {
  it('reads a pre-catalogue hint as the custom entry it always was', () => {
    expect(paymentMethodsFromLegacyHint('  Revolut @marko  ')).toEqual([
      { method: 'CUSTOM', handle: 'Revolut @marko' },
    ]);
    expect(paymentMethodsFromLegacyHint('')).toEqual([]);
    expect(paymentMethodsFromLegacyHint(null)).toEqual([]);
  });

  it('prefers the structured list once the game has one', () => {
    expect(resolvePaymentMethods([{ method: 'BIZUM', handle: '+34600112233' }], 'old text')).toEqual(
      [{ method: 'BIZUM', handle: '+34600112233' }],
    );
    expect(resolvePaymentMethods(null, 'old text')).toEqual([
      { method: 'CUSTOM', handle: 'old text' },
    ]);
    expect(resolvePaymentMethods(null, null)).toEqual([]);
  });
});
