import { describe, expect, it } from 'vitest';
import { publicMemberTheme } from './memberShowcase';

describe('publicMemberTheme', () => {
  it('returns the theme of a member who shows their status', () => {
    expect(publicMemberTheme({ isPremium: true, showPremiumStatus: true, mainTheme: 'spring' })).toBe('spring');
    expect(publicMemberTheme({ isPremium: true, mainTheme: 'premium' })).toBe('premium');
  });

  it('hides the theme for hidden status, lapsed members, classic and unknown values', () => {
    expect(publicMemberTheme({ isPremium: true, showPremiumStatus: false, mainTheme: 'spring' })).toBeNull();
    expect(publicMemberTheme({ isPremium: false, showPremiumStatus: true, mainTheme: 'spring' })).toBeNull();
    expect(publicMemberTheme({ isPremium: true, mainTheme: 'classic' })).toBeNull();
    expect(publicMemberTheme({ isPremium: true, mainTheme: 'bogus' as never })).toBeNull();
    expect(publicMemberTheme({ isPremium: true, mainTheme: null })).toBeNull();
    expect(publicMemberTheme(null)).toBeNull();
  });
});
