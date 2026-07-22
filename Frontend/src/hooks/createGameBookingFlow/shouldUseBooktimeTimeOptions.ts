import type { EntityType } from '@/types';
import type { LocationTimeMode } from '@/components/gameLocationTime/LocationTimeMode';

export function shouldUseBooktimeTimeOptions(params: {
  entityType: EntityType;
  clubHasBookingIntegration: boolean;
  needsBooktimeAuth: boolean;
  locationTimeMode: LocationTimeMode | undefined;
  willBookOnCreate: boolean;
  booktimeConnected: boolean;
  isPadelooClub?: boolean;
  isKlikterenClub?: boolean;
}): boolean {
  if (params.entityType === 'BAR') return false;
  if (!params.clubHasBookingIntegration) return false;
  if (params.needsBooktimeAuth) return false;
  if (params.locationTimeMode !== 'timeSlots') return false;
  if (!params.willBookOnCreate) return false;
  if (params.isPadelooClub || params.isKlikterenClub) return true;
  return params.booktimeConnected;
}
