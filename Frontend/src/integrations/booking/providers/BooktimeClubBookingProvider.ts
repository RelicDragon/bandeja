import type { Club } from '@/types';
import type { BooktimeClient } from '@/integrations/booktime/client';
import {
  confirmBooktimeBooking,
  cancelBooktimeBooking,
  BooktimeSlotTakenError,
  isBooktimeSlotTakenError,
  type BooktimePendingBooking,
} from '@/integrations/booktime/bookFlow';
import { formatBooktimeErrorMessage } from '@/integrations/booktime/formatBooktimeErrorMessage';
import { mapAvailableSlotsToSnapshotCourts } from '@/integrations/booktime/slots';
import { bookingProviderError } from '@shared/booking';
import { BOOKING_ERROR_KEYS } from '@shared/booking/errorKeys';
import type {
  BookSlotContext,
  BookSlotParams,
  ClubBookingProvider,
} from '../ClubBookingProvider';

export class BooktimeClubBookingProvider implements ClubBookingProvider {
  constructor(
    private readonly club: Club,
    private readonly companyId: string,
    private readonly client: BooktimeClient,
  ) {}

  async bookSlot(
    params: BookSlotParams,
    selectedDate: Date,
    context: BookSlotContext,
  ) {
    const pending: BooktimePendingBooking = {
      clubId: this.club.id,
      courtId: params.courtId,
      externalCourtId: params.externalCourtId,
      courtName: params.courtName,
      dateKey: params.dateKey,
      startTime: params.startTime,
      durationMinutes: params.durationMinutes,
    };

    try {
      const result = await confirmBooktimeBooking(
        this.client,
        this.club,
        this.companyId,
        pending,
        selectedDate,
        context,
      );
      return {
        externalBookingId: result.bookingId,
        bookingStart: result.bookingStart,
        bookingEnd: result.bookingEnd,
        price: result.price,
      };
    } catch (err) {
      const message = formatBooktimeErrorMessage(err);
      if (err instanceof BooktimeSlotTakenError || isBooktimeSlotTakenError(err)) {
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
    await cancelBooktimeBooking(this.client, externalBookingId, refreshSnapshot);
  }

  async listUpcoming(index = 0, size = 20) {
    const page = await this.client.getUpcomingBookings(index, size);
    return (page.bookings ?? []).map((booking) => ({
      externalBookingId: booking.uuid,
      bookingStart: booking.bookingStart,
      bookingEnd: booking.bookingEnd,
    }));
  }

  async fetchSnapshotCourts(selectedDate: Date, dateKey: string) {
    const slotsRes = await this.client.getAvailableSlots(selectedDate, dateKey);
    return mapAvailableSlotsToSnapshotCourts(this.club, slotsRes ?? [], dateKey);
  }
}
