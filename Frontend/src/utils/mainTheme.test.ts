import { expect, it } from 'vitest';
import { usesPremiumTheme } from './mainTheme';

it('requires both premium membership and an explicit premium theme preference', () => {
  expect(usesPremiumTheme({ isPremium: true, mainTheme: 'premium' })).toBe(true);
  expect(usesPremiumTheme({ isPremium: true, mainTheme: 'classic' })).toBe(false);
  expect(usesPremiumTheme({ isPremium: false, mainTheme: 'premium' })).toBe(false);
  expect(usesPremiumTheme({ isPremium: false, mainTheme: 'classic' })).toBe(false);
  expect(usesPremiumTheme({ isPremium: true })).toBe(false);
  expect(usesPremiumTheme(null)).toBe(false);
  expect(usesPremiumTheme(undefined)).toBe(false);
});
