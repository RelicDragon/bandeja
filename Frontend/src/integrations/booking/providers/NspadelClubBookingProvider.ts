import type { Club } from '@/types';
import { NspadelClient, isNspadelClubNotConfiguredError } from '@/integrations/nspadel/client';
import { mapNspadelAvailabilityToSnapshotCourts } from '@/integrations/nspadel/slots';
import { buildNspadelEndTime } from '@/integrations/nspadel/slots';
import { bookingProviderError } from '@shared/booking';
import { BOOKING_ERROR_KEYS } from '@shared/booking/errorKeys';
import type {
  BookSlotContext,
  BookSlotParams,
  ClubBookingProvider,
} from '../ClubBookingProvider';

export class NspadelClubBookingProvider implements ClubBookingProvider {
  constructor(
    private readonly club: Club,
    private readonly client: NspadelClient,
    private readonly durationMinutes: number,
  ) {}

  async bookSlot(params: BookSlotParams, _selectedDate: Date, _context: BookSlotContext) {
    try {
      const booking = await this.client.createBooking({
        courtId: params.externalCourtId,
        date: params.dateKey,
        startTime: params.startTime,
        endTime: buildNspadelEndTime(params.startTime, params.durationMinutes),
      });
      return {
        externalBookingId: booking.id,
        bookingStart: `${booking.date}T${booking.startTime}`,
        bookingEnd: `${booking.date}T${booking.endTime}`,
        price: booking.price,
      };
    } catch (err) {
      if (isNspadelClubNotConfiguredError(err)) {
        throw bookingProviderError('SlotTaken', BOOKING_ERROR_KEYS.nspadelSupabaseUrlRequired);
      }
      const message = err instanceof Error ? err.message : BOOKING_ERROR_KEYS.slotNoLongerAvailable;
      const status = (err as { status?: unknown })?.status;
      if (status === 409) {
        throw bookingProviderError('SlotTaken', BOOKING_ERROR_KEYS.slotNoLongerAvailable);
      }
      if (status === 401 || status === 403 || message === BOOKING_ERROR_KEYS.sessionExpired) {
        throw bookingProviderError('AuthExpired', BOOKING_ERROR_KEYS.sessionExpired);
      }
      throw new Error(message);
    }
  }

  async cancelBooking(
    externalBookingId: string,
    _refreshSnapshot: (options?: { force?: boolean }) => Promise<boolean>,
  ) {
    await this.client.cancelBooking(externalBookingId);
  }

  async listUpcoming() {
    // No upstream per-user listing; bookings made through Bandeja are linked
    // to games via snapshots at book time.
    return [];
  }

  async fetchSnapshotCourts(_selectedDate: Date, dateKey: string) {
    try {
      const availability = await this.client.getAvailability(dateKey, this.durationMinutes);
      return mapNspadelAvailabilityToSnapshotCourts(this.club, availability, this.durationMinutes);
    } catch (err) {
      if (isNspadelClubNotConfiguredError(err)) {
        return (this.club.courts ?? [])
          .filter((c) => c.externalCourtId)
          .map((c) => ({
            courtId: c.id,
            externalCourtId: c.externalCourtId!,
            externalCourtName: c.name,
            busySlots: [],
          }));
      }
      throw err;
    }
  }
}
