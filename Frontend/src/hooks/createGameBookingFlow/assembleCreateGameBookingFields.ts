import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { CreateGameBookingFields, CreateGameBookingOverrides } from './types';
import type { LocationTimeMode } from '@/components/gameLocationTime/LocationTimeMode';
import type { CreateGameBookingFields as SharedCreateGameBookingFields } from '@shared/gameBooking/contracts';

type BuildCreatePayload = (
  selectedBookings: BooktimeBookingRecord[],
) => SharedCreateGameBookingFields & {
  courtIds?: string[];
  startTime: string;
  endTime: string;
  hasBookedCourt: boolean;
};

export type AssembleCreateGameBookingFieldsInput = {
  locationTimeMode: LocationTimeMode;
  selectedBookingRecords: BooktimeBookingRecord[];
  buildCreatePayload: BuildCreatePayload;
  createDateFromSelection: () => { startTime: string; endTime: string };
  multiCourtMode: boolean;
  selectedCourt: string;
  selectedCourtIds: string[];
  hasBookedCourt: boolean;
  overrides?: CreateGameBookingOverrides;
};

export function assembleCreateGameBookingFields(
  input: AssembleCreateGameBookingFieldsInput,
): CreateGameBookingFields {
  const bookingPayload =
    input.locationTimeMode === 'bookings'
      ? input.buildCreatePayload(input.selectedBookingRecords)
      : null;
  const slotTimes = input.createDateFromSelection();

  const courtIds =
    input.overrides?.courtIds ??
    bookingPayload?.courtIds ??
    (input.multiCourtMode && input.selectedCourtIds.length > 0 ? input.selectedCourtIds : undefined);

  const externalBookingIds =
    input.overrides?.externalBookingIds ?? bookingPayload?.externalBookingIds;

  return {
    courtId:
      input.overrides?.courtIds?.[0] ??
      bookingPayload?.courtIds?.[0] ??
      (input.selectedCourt !== 'notBooked' ? input.selectedCourt : undefined),
    courtIds,
    startTime: input.overrides?.startTime ?? bookingPayload?.startTime ?? slotTimes.startTime,
    endTime: input.overrides?.endTime ?? bookingPayload?.endTime ?? slotTimes.endTime,
    timeOverride: input.overrides?.timeOverride ?? bookingPayload?.timeOverride ?? false,
    hasBookedCourt:
      input.overrides?.hasBookedCourt ??
      bookingPayload?.hasBookedCourt ??
      input.hasBookedCourt,
    externalBookingIds,
    externalBookingProvider: externalBookingIds?.length ? 'BOOKTIME' : undefined,
    bookingSnapshots: input.overrides?.bookingSnapshots ?? bookingPayload?.bookingSnapshots,
  };
}
