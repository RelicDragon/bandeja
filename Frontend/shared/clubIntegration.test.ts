import { describe, expect, it } from 'vitest';
import {
  clubHasBookingIntegration,
  courtHasActiveBookingIntegration,
  getBooktimeCompanyId,
  isBooktimeClub,
  parseBooktimeIntegrationConfig,
} from './clubIntegration';

describe('parseBooktimeIntegrationConfig', () => {
  it('returns null for invalid raw config', () => {
    expect(parseBooktimeIntegrationConfig(null)).toBeNull();
    expect(parseBooktimeIntegrationConfig('x')).toBeNull();
    expect(parseBooktimeIntegrationConfig([])).toBeNull();
    expect(parseBooktimeIntegrationConfig({ companyId: '  ' })).toBeNull();
  });

  it('parses companyId and optional fields', () => {
    expect(parseBooktimeIntegrationConfig({ companyId: ' acme ' })).toEqual({ companyId: 'acme' });
    expect(
      parseBooktimeIntegrationConfig({
        companyId: 'acme',
        termsUrl: ' https://t ',
        privacyUrl: ' https://p ',
        serviceIds: [' a ', '', 1, 'b'],
      }),
    ).toEqual({
      companyId: 'acme',
      termsUrl: 'https://t',
      privacyUrl: 'https://p',
      serviceIds: [' a ', 'b'],
    });
  });
});

describe('club integration predicates', () => {
  const integratedClub = {
    integrationType: 'BOOKTIME' as const,
    integrationConfig: { companyId: 'company-1' },
  };

  it('detects Booktime club without requiring companyId', () => {
    expect(isBooktimeClub(integratedClub)).toBe(true);
    expect(isBooktimeClub({ integrationType: 'BOOKTIME', integrationConfig: null })).toBe(true);
    expect(isBooktimeClub(undefined)).toBe(false);
    expect(isBooktimeClub({ integrationType: null })).toBe(false);
  });

  it('club-only: integrated club with companyId enables club-level booking UI', () => {
    expect(clubHasBookingIntegration(integratedClub)).toBe(true);
    expect(getBooktimeCompanyId(integratedClub)).toBe('company-1');
  });

  it('missing companyId: Booktime club without valid config is not club-integrated', () => {
    const club = { integrationType: 'BOOKTIME' as const, integrationConfig: { companyId: '  ' } };
    expect(clubHasBookingIntegration(club)).toBe(false);
    expect(getBooktimeCompanyId(club)).toBeNull();
    expect(courtHasActiveBookingIntegration(club, { externalCourtId: 'court-ext' })).toBe(false);
  });

  it('court-mapped: mapped externalCourtId enables court-level booking', () => {
    expect(
      courtHasActiveBookingIntegration(integratedClub, { externalCourtId: ' court-ext ' }),
    ).toBe(true);
  });

  it('unmapped court: club integrated but court without externalCourtId is not bookable', () => {
    expect(courtHasActiveBookingIntegration(integratedClub, { externalCourtId: '' })).toBe(false);
    expect(courtHasActiveBookingIntegration(integratedClub, {})).toBe(false);
    expect(courtHasActiveBookingIntegration(integratedClub, undefined)).toBe(false);
    expect(clubHasBookingIntegration(integratedClub)).toBe(true);
  });
});
