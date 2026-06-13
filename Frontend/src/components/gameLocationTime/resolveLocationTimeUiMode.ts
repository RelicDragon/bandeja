import type { Club, EntityType, Game } from '@/types';
import { supportsClubBookingFlow } from './supportsClubBookingFlow';
import type { LocationTimeMode } from './LocationTimeMode';

export function clubHasBookingIntegration(club: Club | undefined): boolean {
  return (
    club?.integrationType === 'BOOKTIME' &&
    Boolean(club.integrationConfig?.companyId?.trim())
  );
}

export function resolveLocationTimeUiMode(args: {
  entityType: EntityType;
  panelMode: 'create' | 'edit';
  club: Club | undefined;
  liveApiEnabled: boolean;
  game?: Game;
}): {
  showSegmentedSwitch: boolean;
  showBookingsOnly: boolean;
  defaultTab: LocationTimeMode;
} {
  const { entityType, panelMode, club, liveApiEnabled, game } = args;
  const hasLinks = (game?.linkedBookings?.length ?? 0) > 0;
  const integrated =
    supportsClubBookingFlow(entityType, panelMode) &&
    clubHasBookingIntegration(club) &&
    (panelMode === 'edit' || liveApiEnabled);

  if (panelMode === 'edit' && hasLinks) {
    return { showSegmentedSwitch: false, showBookingsOnly: true, defaultTab: 'bookings' };
  }

  if (integrated) {
    return { showSegmentedSwitch: true, showBookingsOnly: false, defaultTab: 'timeSlots' };
  }

  return { showSegmentedSwitch: false, showBookingsOnly: false, defaultTab: 'timeSlots' };
}
