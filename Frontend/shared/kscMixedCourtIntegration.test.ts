import { describe, expect, it } from 'vitest';
import {
  clubHasBookingIntegration,
  courtHasActiveBookingIntegration,
} from './clubIntegration';
import { mappedBooktimeCourts } from '@/integrations/booktime/availability';
import { filterCourtsByClubSports, filterCourtsBySport } from '@/utils/courtSport';
import type { Club, Court } from '@/types';

const KSC_CLUB: Club = {
  id: 'cmhavpbt8000265s4wsulhivd',
  name: 'KSC (ex.CRS)',
  integrationType: 'BOOKTIME',
  integrationConfig: { companyId: '002f8a6a-6433-490f-9bae-726b98399672' },
  sports: ['PADEL', 'TENNIS'],
} as Club;

const KSC_MAPPED_PADEL_COURT: Court = {
  id: 'cmhavpx4m000665s40gkzl67k',
  name: 'Court 1',
  clubId: KSC_CLUB.id,
  sport: 'PADEL',
  isIndoor: false,
  externalCourtId: '0a338a7b-1bd7-4f94-bd75-a2b2651ecd60',
  isActive: true,
} as Court;

const KSC_UNMAPPED_TABLE_TENNIS_COURT: Court = {
  id: 'new-tt-court',
  name: 'Table tennis hall',
  clubId: KSC_CLUB.id,
  sport: 'TABLE_TENNIS',
  isIndoor: true,
  externalCourtId: null,
  isActive: true,
} as Court;

describe('KSC mixed integration: mapped Booktime courts + unmapped table tennis', () => {
  it('club stays Booktime-integrated', () => {
    expect(clubHasBookingIntegration(KSC_CLUB)).toBe(true);
  });

  it('mapped padel court uses Booktime book-on-create', () => {
    expect(courtHasActiveBookingIntegration(KSC_CLUB, KSC_MAPPED_PADEL_COURT)).toBe(true);
  });

  it('indoor table tennis court without externalCourtId is manual/free book only', () => {
    expect(courtHasActiveBookingIntegration(KSC_CLUB, KSC_UNMAPPED_TABLE_TENNIS_COURT)).toBe(false);
  });

  it('Booktime availability excludes the unmapped court', () => {
    const mapped = mappedBooktimeCourts(KSC_CLUB, [
      KSC_MAPPED_PADEL_COURT,
      KSC_UNMAPPED_TABLE_TENNIS_COURT,
    ]);
    expect(mapped.map((c) => c.id)).toEqual([KSC_MAPPED_PADEL_COURT.id]);
  });

  it('after sync, table tennis court appears on the table tennis tab', () => {
    const clubWithTt: Club = {
      ...KSC_CLUB,
      sports: ['PADEL', 'TENNIS', 'TABLE_TENNIS'],
    };
    const courts = [KSC_MAPPED_PADEL_COURT, KSC_UNMAPPED_TABLE_TENNIS_COURT];
    const inClub = filterCourtsByClubSports(courts, clubWithTt.sports);
    const ttCourts = filterCourtsBySport(inClub, 'TABLE_TENNIS');
    expect(ttCourts.map((c) => c.id)).toEqual([KSC_UNMAPPED_TABLE_TENNIS_COURT.id]);
  });
});
