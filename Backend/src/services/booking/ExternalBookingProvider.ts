import type { RollbackBookingResult } from '../../shared/booking';

export interface ExternalBookingProvider {
  rollbackBookings(
    userId: string,
    clubId: string,
    externalBookingIds: string[],
  ): Promise<RollbackBookingResult[]>;

  importCourts(clubId: string): Promise<unknown>;
}
