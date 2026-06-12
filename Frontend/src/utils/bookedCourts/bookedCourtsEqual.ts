import { BookedCourtSlot } from '@/types';

export function bookedCourtsEqual(a: BookedCourtSlot[], b: BookedCourtSlot[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (
      left.courtId !== right.courtId ||
      left.courtName !== right.courtName ||
      left.integrationCourtName !== right.integrationCourtName ||
      left.startTime !== right.startTime ||
      left.endTime !== right.endTime ||
      left.hasBookedCourt !== right.hasBookedCourt ||
      left.clubBooked !== right.clubBooked ||
      left.isFree !== right.isFree ||
      left.slotKind !== right.slotKind ||
      left.holdBlocked !== right.holdBlocked
    ) {
      return false;
    }
  }

  return true;
}
