import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { CreateGameBookingFields, CreateGameBookingOverrides } from './types';
import type { LocationTimeMode } from '@/components/gameLocationTime/LocationTimeMode';
import type { CreateGameBookingFields as SharedCreateGameBookingFields } from '@shared/gameBooking/contracts';
import { mergeBookingSnapshotCourtIds } from '@shared/gameBooking/applyCourtIdsToBookingSnapshots';

function uniqueCourtIds(...groups: Array<string[] | undefined>): string[] | undefined {
  const merged = [...new Set(groups.flatMap((group) => group ?? []))];
  return merged.length > 0 ? merged : undefined;
}

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

  const courtIds = uniqueCourtIds(
    input.overrides?.courtIds,
    bookingPayload?.courtIds,
    input.selectedCourtIds,
  );

  const externalBookingIds =
    input.overrides?.externalBookingIds ?? bookingPayload?.externalBookingIds;

  const bookingSnapshots = mergeBookingSnapshotCourtIds(
    input.overrides?.bookingSnapshots ?? bookingPayload?.bookingSnapshots,
    courtIds ?? [],
  );

  return {
    courtId:
      input.overrides?.courtIds?.[0] ??
      bookingPayload?.courtIds?.[0] ??
      (input.selectedCourt !== 'notBooked' ? input.selectedCourt : undefined) ??
      courtIds?.[0],
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
    bookingSnapshots,
  };
}
