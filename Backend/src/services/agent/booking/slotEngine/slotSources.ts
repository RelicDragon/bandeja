/**
 * Production `SlotEngineSources`: the existing provider services behind the 60 s live cache.
 * Tests never import this file; they pass mocked sources to `computeClubSlots`.
 */
import { ClubIntegrationType } from '@prisma/client';
import { getSnapshotDateMeta } from '../../../../shared/booktimeBusySnapshot';
import { CourtOccupancyService } from '../../../game/courtOccupancy.service';
import { getNspadelAvailability } from '../../../nspadel/nspadelBookings.service';
import { getWeltnerAvailability } from '../../../weltner/weltner.service';
import { liveProviderCache } from './liveProviderCache';
import type { SlotEngineSources } from './slotEngine';

export const defaultSlotEngineSources: SlotEngineSources = {
  nspadelFreeRanges: (clubId, date, durationMinutes) =>
    liveProviderCache.get('NSPADELSUPABASE', `${clubId}:${date}:${durationMinutes}`, async () => {
      const { slots } = await getNspadelAvailability(clubId, date, durationMinutes);
      return slots.map((slot) => ({ externalCourtId: slot.courtId, startTime: slot.startTime, endTime: slot.endTime }));
    }),
  // One Weltner response carries every duration, so the key is (club, date).
  weltnerTuples: (clubId, date) =>
    liveProviderCache.get('WELTNER', `${clubId}:${date}`, async () => {
      const availability = await getWeltnerAvailability(clubId, date);
      return availability.courts.map((court) => ({ courtId: court.courtId, slots: court.slots }));
    }),
  occupancy: async ({ clubId, rangeStart, rangeEnd, externals }) => {
    const result = await CourtOccupancyService.getOccupancy({
      clubId,
      rangeStart,
      rangeEnd,
      sources: { games: true, holds: true, externals },
    });
    return result.blocks;
  },
  snapshotFetchedAt: async (clubId, provider, date) => {
    if (provider !== 'BOOKTIME' && provider !== 'PADELOO' && provider !== 'KLIKTEREN') return null;
    const meta = await getSnapshotDateMeta(clubId, date, ClubIntegrationType[provider]);
    return meta.snapshotFetchedAt;
  },
};
