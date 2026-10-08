import { describe, expect, it } from 'vitest';
import { PREMIUM_NAME_STYLES, premiumNameClassName, resolvePremiumNameStyle, showsPremiumStatus } from '@/utils/premiumIdentity';
import { usesPremiumTheme } from '@/utils/mainTheme';
import { canViewTournamentTableByAccess } from '@/utils/gameResults';


describe('public premium identity', () => {
  it('allows public decoration only for Premium members who have not opted out', () => {
    expect(showsPremiumStatus({ isPremium: true, showPremiumStatus: false })).toBe(false);
    expect(showsPremiumStatus({ isPremium: true })).toBe(true);
    expect(showsPremiumStatus({ isPremium: true, showPremiumStatus: true })).toBe(true);
  });

  it('keeps visibility independent of personal theme and premium access', () => {
    for (const mainTheme of ['classic', 'premium'] as const) {
      const user = { isPremium: true, showPremiumStatus: false, mainTheme };
      expect(showsPremiumStatus(user)).toBe(false);
      expect(usesPremiumTheme(user)).toBe(mainTheme === 'premium');
      expect(canViewTournamentTableByAccess({ entityType: 'TOURNAMENT', fixedNumberOfSets: 1, resultsStatus: 'IN_PROGRESS' }, user)).toBe(true);
      expect(showsPremiumStatus({ ...user, showPremiumStatus: true })).toBe(true);
    }
  });

  it('does not decorate standard or missing users even if visibility is enabled', () => {
    expect(showsPremiumStatus(null)).toBe(false);
    expect(showsPremiumStatus(undefined)).toBe(false);
    expect(showsPremiumStatus({ showPremiumStatus: true })).toBe(false);
    expect(showsPremiumStatus({ isPremium: false, showPremiumStatus: true })).toBe(false);
  });
});

describe('premium name style', () => {
  it('resolves every known style and falls back to gold', () => {
    for (const style of PREMIUM_NAME_STYLES) expect(resolvePremiumNameStyle(style)).toBe(style);
    expect(resolvePremiumNameStyle(undefined)).toBe('gold');
    expect(resolvePremiumNameStyle(null)).toBe('gold');
    expect(resolvePremiumNameStyle('plasma')).toBe('gold');
    expect(PREMIUM_NAME_STYLES[0]).toBe('gold');
  });

  it('builds the class list without touching layout utilities', () => {
    expect(premiumNameClassName('ember')).toBe('premium-name premium-name--ember');
    expect(premiumNameClassName(undefined, { animated: true, tone: 'light' })).toBe(
      'premium-name premium-name--gold premium-name--on-light premium-name--animated',
    );
  });
});
