import type { BookingSnapshotInput } from './contracts';

export function applyCourtIdsToBookingSnapshots(
  snapshots: BookingSnapshotInput[],
  courtIds: string[],
): BookingSnapshotInput[] {
  if (courtIds.length === 0) return snapshots;
  const fallbackCourtId = courtIds[0]!;
  return snapshots.map((snap, index) => ({
    ...snap,
    courtId: snap.courtId ?? courtIds[index] ?? fallbackCourtId,
  }));
}

export function mergeBookingSnapshotCourtIds(
  snapshots: BookingSnapshotInput[] | undefined,
  courtIds: string[],
): BookingSnapshotInput[] | undefined {
  if (!snapshots?.length || courtIds.length === 0) return snapshots;
  return applyCourtIdsToBookingSnapshots(snapshots, courtIds);
}
