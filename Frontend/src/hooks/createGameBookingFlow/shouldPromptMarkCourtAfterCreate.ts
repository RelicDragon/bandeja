import type { EntityType } from '@/types';
import type { LocationTimeMode } from '@/components/gameLocationTime/LocationTimeMode';
import type { CreateGameBookingOverrides } from './types';

export type MarkCourtPromptInput = {
  entityType: EntityType;
  selectedCourt: string;
  hasBookedCourt: boolean;
  willBookOnCreate: boolean;
  locationTimeMode: LocationTimeMode;
  clubHasActiveIntegration: boolean;
  overrides?: CreateGameBookingOverrides;
  createdGameId?: string;
};

export function shouldPromptMarkCourtAfterCreate(input: MarkCourtPromptInput): boolean {
  if (input.entityType === 'BAR') return false;
  if (input.selectedCourt === 'notBooked') return false;
  if (input.hasBookedCourt || input.overrides?.hasBookedCourt) return false;
  if (input.willBookOnCreate) return false;
  if (input.locationTimeMode === 'bookings') return false;
  if (input.clubHasActiveIntegration) return false;
  return Boolean(input.createdGameId);
}
