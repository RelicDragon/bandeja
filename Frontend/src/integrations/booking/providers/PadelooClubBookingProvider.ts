import type { Club } from '@/types';
import type { PadelooClient } from '@/integrations/padeloo/client';
import {
  confirmPadelooBooking,
  cancelPadelooBooking,
  PadelooSlotTakenError,
  isPadelooSlotTakenError,
  type PadelooPendingBooking,
} from '@/integrations/padeloo/bookFlow';
import { mapPadelooAvailableSlotsToSnapshotCourts } from '@/integrations/padeloo/slots';
import { bookingProviderError } from '@shared/booking';
import { BOOKING_ERROR_KEYS } from '@shared/booking/errorKeys';
import type {
  BookSlotContext,
  BookSlotParams,
  ClubBookingProvider,
} from '../ClubBookingProvider';

export class PadelooClubBookingProvider implements ClubBookingProvider {
  constructor(
    private readonly club: Club,
    private readonly padelooClubId: number,
    private readonly client: PadelooClient,
    private readonly durationMinutes: number,
  ) {}

  async bookSlot(params: BookSlotParams, _selectedDate: Date, context: BookSlotContext) {
    const pending: PadelooPendingBooking = {
      clubId: this.club.id,
      padelooClubId: this.padelooClubId,
      courtId: params.courtId,
      externalCourtId: params.externalCourtId,
      courtName: params.courtName,
      dateKey: params.dateKey,
      startTime: params.startTime,
      durationMinutes: params.durationMinutes,
      sport: params.sport,
    };

    try {
      const result = await confirmPadelooBooking(
        this.client,
        this.club,
        this.padelooClubId,
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
      if (err instanceof PadelooSlotTakenError || isPadelooSlotTakenError(err)) {
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
    await cancelPadelooBooking(this.client, externalBookingId, refreshSnapshot);
  }

  async listUpcoming() {
    const reservations = await this.client.getMyReservations();
    const now = Date.now();
    return reservations
      .filter((row) => {
        if (row.clubId !== this.padelooClubId) return false;
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
    const rows = await this.client.getAvailableSlots(this.padelooClubId, dateKey, this.durationMinutes);
    return mapPadelooAvailableSlotsToSnapshotCourts(this.club, rows ?? [], dateKey);
  }
}
