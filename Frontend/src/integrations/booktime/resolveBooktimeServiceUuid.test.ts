import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import type { BooktimeCompany } from './client';
import { resolveBooktimeServiceUuid } from './resolveBooktimeServiceUuid';

const KSC_PADEL = '7aec75f1-470d-4ff4-9547-e09a08e5a1d0';
const KSC_TENNIS = 'cf4e7fcf-2980-4412-8b1b-4911ed7ef963';
const KSC_COURT_1 = '0a338a7b-1bd7-4f94-bd75-a2b2651ecd60';

const kscCompany: BooktimeCompany = {
  bookingResources: [
    {
      uuid: KSC_COURT_1,
      name: 'Teren 1',
      services: [
        { uuid: KSC_PADEL, name: 'Padel', isBookable: true },
        { uuid: KSC_TENNIS, name: 'Tenis', isBookable: true },
        { uuid: 'rental', name: 'Najam reketa padel', isBookable: false },
      ],
    },
  ],
};

describe('resolveBooktimeServiceUuid', () => {
  it('uses legacy resource.serviceUuid when present', () => {
    const company: BooktimeCompany = {
      bookingResources: [{ uuid: 'court-1', serviceUuid: 'legacy-service' }],
    };
    expect(resolveBooktimeServiceUuid(company, 'court-1')).toBe('legacy-service');
  });

  it('uses the only bookable service on a resource', () => {
    const company: BooktimeCompany = {
      bookingResources: [
        {
          uuid: 'court-1',
          services: [{ uuid: 'padel-only', name: 'Padel unutra', isBookable: true }],
        },
      ],
    };
    expect(resolveBooktimeServiceUuid(company, 'court-1')).toBe('padel-only');
  });

  it('picks padel service for multi-service KSC courts', () => {
    expect(resolveBooktimeServiceUuid(kscCompany, KSC_COURT_1, undefined, Sports.PADEL)).toBe(KSC_PADEL);
  });

  it('picks tennis service when sport hint is tennis', () => {
    expect(resolveBooktimeServiceUuid(kscCompany, KSC_COURT_1, undefined, Sports.TENNIS)).toBe(KSC_TENNIS);
  });

  it('uses configured serviceIds when exactly one is set', () => {
    expect(
      resolveBooktimeServiceUuid(kscCompany, KSC_COURT_1, { companyId: 'x', serviceIds: [KSC_TENNIS] }),
    ).toBe(KSC_TENNIS);
  });

  it('throws when service cannot be resolved', () => {
    expect(() => resolveBooktimeServiceUuid({ bookingResources: [] }, 'missing-court')).toThrow(
      'Online booking not configured for this court',
    );
  });
});
