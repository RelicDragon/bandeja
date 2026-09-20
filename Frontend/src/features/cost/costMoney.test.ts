import { describe, expect, it } from 'vitest';
import {
  costFractionDigits,
  costMinorFactor,
  costMinorToMajorInput,
  formatCostMinor,
  parseCostMajorToMinor,
  perHeadPreviewMinor,
} from './costMoney';


/**
 * PRD 348 — money is integer minor units end to end, and is only ever rendered
 * through `Intl.NumberFormat` with the active locale and the game's currency.
 */

describe('minor units', () => {
  it('knows the factor for each shape of currency', () => {
    expect(costMinorFactor('EUR')).toBe(100);
    expect(costMinorFactor('JPY')).toBe(1);
    expect(costMinorFactor('KWD')).toBe(1000);
  });

  it('exposes the matching fraction digits', () => {
    expect(costFractionDigits('EUR')).toBe(2);
    expect(costFractionDigits('JPY')).toBe(0);
    expect(costFractionDigits('KWD')).toBe(3);
  });
});

describe('formatting', () => {
  it('renders the game currency, never a converted one', () => {
    expect(formatCostMinor(1000, 'EUR', 'en')).toContain('10');
    expect(formatCostMinor(1000, 'EUR', 'en')).toContain('€');
    expect(formatCostMinor(1000, 'USD', 'en')).toContain('$');
  });

  it('follows the active locale, not a hard-coded one', () => {
    const de = formatCostMinor(123456, 'EUR', 'de');
    const en = formatCostMinor(123456, 'EUR', 'en');
    expect(de).not.toBe(en);
    expect(de).toContain('1.234,56');
  });

  it('drops decimals for currencies that have none', () => {
    expect(formatCostMinor(4000, 'JPY', 'ja')).not.toContain('.');
  });

  it('keeps three decimals for a dinar', () => {
    expect(formatCostMinor(1234, 'KWD', 'en')).toContain('1.234');
  });

  it('falls back instead of throwing on a broken locale tag', () => {
    expect(formatCostMinor(1000, 'EUR', 'not a locale')).toContain('EUR');
  });
});

describe('keypad round trip', () => {
  it('parses what the keypad produced', () => {
    expect(parseCostMajorToMinor('10', 'EUR')).toBe(1000);
    expect(parseCostMajorToMinor('10.5', 'EUR')).toBe(1050);
    expect(parseCostMajorToMinor('10,5', 'EUR')).toBe(1050);
    expect(parseCostMajorToMinor('4000', 'JPY')).toBe(4000);
  });

  it('rejects anything that is not money', () => {
    expect(parseCostMajorToMinor('', 'EUR')).toBeNull();
    expect(parseCostMajorToMinor('abc', 'EUR')).toBeNull();
    expect(parseCostMajorToMinor('-5', 'EUR')).toBeNull();
  });

  it('round-trips through the editable string', () => {
    expect(costMinorToMajorInput(1050, 'EUR')).toBe('10.50');
    expect(parseCostMajorToMinor(costMinorToMajorInput(1050, 'EUR'), 'EUR')).toBe(1050);
    expect(costMinorToMajorInput(4000, 'JPY')).toBe('4000');
  });
});

describe('create/edit per-head preview', () => {
  it('divides a total by the seat count', () => {
    expect(perHeadPreviewMinor('TOTAL', 40, 'EUR', 4)).toBe(1000);
  });

  it('takes a per-person price as-is', () => {
    expect(perHeadPreviewMinor('PER_PERSON', 10, 'EUR', 4)).toBe(1000);
  });

  it('shows nothing without a usable price', () => {
    expect(perHeadPreviewMinor('NOT_KNOWN', 40, 'EUR', 4)).toBeNull();
    expect(perHeadPreviewMinor('FREE', 0, 'EUR', 4)).toBeNull();
    expect(perHeadPreviewMinor('PER_TEAM', 40, 'EUR', 4)).toBeNull();
    expect(perHeadPreviewMinor('TOTAL', undefined, 'EUR', 4)).toBeNull();
    expect(perHeadPreviewMinor('TOTAL', 0, 'EUR', 4)).toBeNull();
    expect(perHeadPreviewMinor('TOTAL', 40, 'EUR', 0)).toBeNull();
  });

  it('updates as the seat count changes', () => {
    expect(perHeadPreviewMinor('TOTAL', 40, 'EUR', 2)).toBe(2000);
    expect(perHeadPreviewMinor('TOTAL', 40, 'EUR', 8)).toBe(500);
  });
});
