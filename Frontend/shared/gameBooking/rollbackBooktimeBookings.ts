export type RollbackCancelOutcome = {
  externalBookingId: string;
  cancelled: boolean;
};

export async function rollbackBooktimeBookings(
  cancelBooking: (externalBookingId: string) => Promise<void>,
  externalBookingIds: readonly string[],
): Promise<RollbackCancelOutcome[]> {
  const uniqueIds = [...new Set(externalBookingIds.map((id) => id.trim()).filter(Boolean))];
  const outcomes: RollbackCancelOutcome[] = [];

  for (const externalBookingId of uniqueIds) {
    try {
      await cancelBooking(externalBookingId);
      outcomes.push({ externalBookingId, cancelled: true });
    } catch {
      outcomes.push({ externalBookingId, cancelled: false });
    }
  }

  return outcomes;
}

export function hasRollbackFailures(outcomes: readonly RollbackCancelOutcome[]): boolean {
  return outcomes.some((outcome) => !outcome.cancelled);
}
