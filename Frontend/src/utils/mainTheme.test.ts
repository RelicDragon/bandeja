import { expect, it } from 'vitest';
import { MEMBER_THEME_IDS, MEMBER_THEMES, activeMemberTheme, appPageBackground, memberChromeIsDark, usesPremiumTheme } from './mainTheme';

it('requires both premium membership and an explicit premium theme preference', () => {
  expect(usesPremiumTheme({ isPremium: true, mainTheme: 'premium' })).toBe(true);
  expect(usesPremiumTheme({ isPremium: true, mainTheme: 'classic' })).toBe(false);
  expect(usesPremiumTheme({ isPremium: false, mainTheme: 'premium' })).toBe(false);
  expect(usesPremiumTheme({ isPremium: false, mainTheme: 'classic' })).toBe(false);
  expect(usesPremiumTheme({ isPremium: true })).toBe(false);
  expect(usesPremiumTheme(null)).toBe(false);
  expect(usesPremiumTheme(undefined)).toBe(false);
});

it('resolves every member theme for members and falls back to Classic for unknown values', () => {
  for (const id of MEMBER_THEME_IDS) {
    expect(activeMemberTheme({ isPremium: true, mainTheme: id })).toBe(id);
    expect(activeMemberTheme({ isPremium: false, mainTheme: id })).toBeNull();
    expect(usesPremiumTheme({ isPremium: true, mainTheme: id })).toBe(true);
  }
  expect(activeMemberTheme({ isPremium: true, mainTheme: 'vaporwave' as never })).toBeNull();
  expect(activeMemberTheme({ isPremium: true, mainTheme: 'classic' })).toBeNull();
});

it('keeps the registry complete and the light chromes light only in the light appearance', () => {
  expect(Object.keys(MEMBER_THEMES).sort()).toEqual([...MEMBER_THEME_IDS].sort());
  for (const id of MEMBER_THEME_IDS) expect(memberChromeIsDark(id, 'dark')).toBe(true);
  expect(MEMBER_THEME_IDS.filter((id) => !memberChromeIsDark(id, 'light')).sort()).toEqual(['alpine', 'nordic', 'spring', 'summer']);
  expect(memberChromeIsDark(null, 'dark')).toBe(false);
  expect(appPageBackground(false, null)).toBe('#f9fafb');
  expect(appPageBackground(true, null)).toBe('#111827');
  expect(appPageBackground(false, 'premium')).toBe('#faf9f6');
  expect(appPageBackground(true, 'premium')).toBe('#141411');
});
