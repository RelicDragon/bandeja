import type { Club } from '@/types';
import type { KlikterenClient } from '@/integrations/klikteren/client';
import {
  confirmKlikterenBooking,
  cancelKlikterenBooking,
  KlikterenSlotTakenError,
  isKlikterenSlotTakenError,
  type KlikterenPendingBooking,
} from '@/integrations/klikteren/bookFlow';
import { mapKlikterenAvailabilityToSnapshotCourts } from '@/integrations/klikteren/slots';
import { bookingProviderError } from '@shared/booking';
import { BOOKING_ERROR_KEYS } from '@shared/booking/errorKeys';
import type {
  BookSlotContext,
  BookSlotParams,
  ClubBookingProvider,
} from '../ClubBookingProvider';

export class KlikterenClubBookingProvider implements ClubBookingProvider {
  constructor(
    private readonly club: Club,
    private readonly klikterenVenueId: string,
    private readonly client: KlikterenClient,
    private readonly durationMinutes: number,
  ) {}

  async bookSlot(params: BookSlotParams, _selectedDate: Date, context: BookSlotContext) {
    const pending: KlikterenPendingBooking = {
      clubId: this.club.id,
      klikterenVenueId: this.klikterenVenueId,
      courtId: params.courtId,
      externalCourtId: params.externalCourtId,
      courtName: params.courtName,
      dateKey: params.dateKey,
      startTime: params.startTime,
      durationMinutes: params.durationMinutes,
      sport: params.sport,
    };

    try {
      const result = await confirmKlikterenBooking(
        this.client,
        this.club,
        this.klikterenVenueId,
        pending,
        context,
      );
      return {
        externalBookingId: result.bookingId,
        bookingStart: result.bookingStart,
        bookingEnd: result.bookingEnd,
        price: result.price,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : BOOKING_ERROR_KEYS.slotNoLongerAvailable;
      if (err instanceof KlikterenSlotTakenError || isKlikterenSlotTakenError(err)) {
        throw bookingProviderError('SlotTaken', BOOKING_ERROR_KEYS.slotNoLongerAvailable);
      }
      if (/session|expired|401/i.test(message) || message === BOOKING_ERROR_KEYS.sessionExpired) {
        throw bookingProviderError('AuthExpired', BOOKING_ERROR_KEYS.sessionExpired);
      }
      throw new Error(message);
    }
  }

  async cancelBooking(
    externalBookingId: string,
    refreshSnapshot: (options?: { force?: boolean }) => Promise<boolean>,
  ) {
    await cancelKlikterenBooking(this.client, externalBookingId, refreshSnapshot);
  }

  async listUpcoming() {
    const bookings = await this.client.getMyBookings();
    const now = Date.now();
    return bookings
      .filter((row) => {
        const start = new Date(`${row.date}T${row.startTime}`);
        return !Number.isNaN(start.getTime()) && start.getTime() >= now;
      })
      .map((row) => ({
        externalBookingId: String(row.id),
        bookingStart: `${row.date}T${row.startTime}`,
        bookingEnd: `${row.date}T${row.endTime}`,
        price: row.price,
      }));
  }

  async fetchSnapshotCourts(_selectedDate: Date, dateKey: string) {
    const availability = await this.client.getAvailability(this.klikterenVenueId, dateKey);
    return mapKlikterenAvailabilityToSnapshotCourts(
      this.club,
      availability,
      dateKey,
      this.durationMinutes,
    );
  }
}
