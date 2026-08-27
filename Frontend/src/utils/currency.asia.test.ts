import { describe, expect, it } from 'vitest';
import { formatPrice, getCurrencyMinorFactor } from './currency';

describe('Asia market currencies', () => {
  it('uses 0 decimal places for JPY and IDR', () => {
    expect(getCurrencyMinorFactor('JPY')).toBe(1);
    expect(getCurrencyMinorFactor('IDR')).toBe(1);
    expect(formatPrice(1500, 'JPY')).toBe('¥1,500');
    expect(formatPrice(25000, 'IDR')).toBe('Rp25,000');
  });

  it('keeps 2 decimals for CNY INR THB', () => {
    expect(getCurrencyMinorFactor('CNY')).toBe(100);
    expect(getCurrencyMinorFactor('INR')).toBe(100);
    expect(getCurrencyMinorFactor('THB')).toBe(100);
    expect(formatPrice(1999, 'CNY')).toBe('¥19.99');
    expect(formatPrice(1999, 'INR')).toBe('₹19.99');
    expect(formatPrice(1999, 'THB')).toBe('฿19.99');
  });
});
