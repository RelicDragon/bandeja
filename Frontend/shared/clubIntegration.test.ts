import { describe, expect, it } from 'vitest';
import {
  clubHasBookingIntegration,
  courtHasActiveBookingIntegration,
  getBooktimeCompanyId,
  getPadelooClubId,
  isBooktimeClub,
  isPadelooClub,
  parseBooktimeIntegrationConfig,
  parsePadelooIntegrationConfig,
  shouldUseBooktimeCompanyDurations,
} from './clubIntegration';

describe('parsePadelooIntegrationConfig', () => {
  it('returns null for invalid raw config', () => {
    expect(parsePadelooIntegrationConfig(null)).toBeNull();
    expect(parsePadelooIntegrationConfig({ clubId: 0 })).toBeNull();
    expect(parsePadelooIntegrationConfig({ clubId: 'abc' })).toBeNull();
  });

  it('parses numeric clubId', () => {
    expect(parsePadelooIntegrationConfig({ clubId: 2 })).toEqual({ clubId: 2 });
    expect(parsePadelooIntegrationConfig({ clubId: '3' })).toEqual({ clubId: 3 });
  });
});

describe('padeloo club integration predicates', () => {
  const integratedClub = {
    integrationType: 'PADELOO' as const,
    integrationConfig: { clubId: 2 },
  };

  it('detects Padeloo club and clubId', () => {
    expect(isPadelooClub(integratedClub)).toBe(true);
    expect(getPadelooClubId(integratedClub)).toBe(2);
    expect(clubHasBookingIntegration(integratedClub)).toBe(true);
    expect(
      courtHasActiveBookingIntegration(integratedClub, { externalCourtId: '5' }),
    ).toBe(true);
  });
});

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

describe('shouldUseBooktimeCompanyDurations', () => {
  const integratedClub = {
    integrationType: 'BOOKTIME' as const,
    integrationConfig: { companyId: 'company-1' },
  };
  const mappedCourt = { id: 'court-1', externalCourtId: 'ext-1' };
  const unmappedCourt = { id: 'court-2', externalCourtId: '' };

  it('uses company durations when club is integrated and no court is selected', () => {
    expect(shouldUseBooktimeCompanyDurations(integratedClub, null, [mappedCourt])).toBe(true);
    expect(shouldUseBooktimeCompanyDurations(integratedClub, undefined, [mappedCourt])).toBe(true);
  });

  it('uses defaults when user opts out of court booking', () => {
    expect(shouldUseBooktimeCompanyDurations(integratedClub, 'notBooked', [mappedCourt])).toBe(false);
  });

  it('uses company durations only for mapped courts', () => {
    expect(shouldUseBooktimeCompanyDurations(integratedClub, 'court-1', [mappedCourt, unmappedCourt])).toBe(
      true,
    );
    expect(shouldUseBooktimeCompanyDurations(integratedClub, 'court-2', [mappedCourt, unmappedCourt])).toBe(
      false,
    );
  });

  it('uses defaults when club has no external booking', () => {
    expect(shouldUseBooktimeCompanyDurations(undefined, 'court-1', [mappedCourt])).toBe(false);
    expect(
      shouldUseBooktimeCompanyDurations(
        { integrationType: 'BOOKTIME', integrationConfig: { companyId: ' ' } },
        'court-1',
        [mappedCourt],
      ),
    ).toBe(false);
  });
});
