import { describe, expect, it } from 'vitest';
import { centsToInput, chargeBalanceCents, formatCents, parseMoneyInput } from './money';

describe('formatCents', () => {
  it('formats integer cents in the club currency', () => {
    expect(formatCents(1250, 'EUR', 'en')).toBe('€12.50');
    expect(formatCents(0, 'USD', 'en')).toBe('$0.00');
    expect(formatCents(150000, 'RSD', 'en')).toMatch(/1,500\.00/);
  });

  it('uses the locale separators', () => {
    expect(formatCents(123456, 'EUR', 'de').replace(/\s/g, ' ')).toBe('1.234,56 €');
  });

  it('rounds stray fractions to whole cents and survives unknown currencies', () => {
    expect(formatCents(1249.6, 'EUR', 'en')).toBe('€12.50');
    expect(formatCents(1205, 'NOT', 'en')).toMatch(/12[.,]05|NOT/);
  });
});

describe('parseMoneyInput', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12,50', 1250],
    ['0,05', 5],
    ['.5', 50],
    ['1 200,50', 120050],
    ['1.250', 125000],
    ['1,234.56', 123456],
    ['12.', 1200],
  ])('%s → %i', (raw, cents) => {
    expect(parseMoneyInput(raw)).toBe(cents);
  });

  it.each(['', ' ', 'abc', '-5', '12.345.6x', '1e3'])('rejects %j', (raw) => {
    expect(parseMoneyInput(raw)).toBeNull();
  });

  it('never produces float cents', () => {
    expect(parseMoneyInput('0.29')).toBe(29);
    expect(parseMoneyInput('19.99')).toBe(1999);
  });
});

describe('centsToInput', () => {
  it('round-trips through parseMoneyInput', () => {
    for (const c of [0, 5, 50, 1200, 1250, 123456]) {
      expect(parseMoneyInput(centsToInput(c, 'en'))).toBe(c);
      expect(parseMoneyInput(centsToInput(c, 'de'))).toBe(c);
    }
  });

  it('uses the locale decimal mark and drops zero cents', () => {
    expect(centsToInput(1250, 'de')).toBe('12,50');
    expect(centsToInput(1250, 'en')).toBe('12.50');
    expect(centsToInput(1200, 'en')).toBe('12');
  });
});

describe('chargeBalanceCents', () => {
  it('is amount − paid, never negative, 0 when waived or void', () => {
    expect(chargeBalanceCents({ amountCents: 4000, paidCents: 1500, status: 'PARTIAL' })).toBe(2500);
    expect(chargeBalanceCents({ amountCents: 4000, paidCents: 5000, status: 'PAID' })).toBe(0);
    expect(chargeBalanceCents({ amountCents: 4000, paidCents: 0, status: 'WAIVED' })).toBe(0);
    expect(chargeBalanceCents({ amountCents: 4000, paidCents: 0, status: 'VOID' })).toBe(0);
  });
});
