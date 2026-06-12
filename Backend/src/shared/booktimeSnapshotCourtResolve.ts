import type { BooktimeBusySlot, BooktimeSnapshotCourtInput } from './booktimeBusySnapshot';

export type SnapshotCourtLookupRow = {
  id: string;
  name: string;
  externalCourtId: string | null;
  integrationCourtName: string | null;
};

export function buildSnapshotCourtLookupByExternalId(
  dbCourts: SnapshotCourtLookupRow[]
): Map<string, string> {
  const byExternal = new Map<string, string>();
  for (const court of dbCourts) {
    const externalId = court.externalCourtId?.trim();
    if (externalId) {
      byExternal.set(externalId, court.id);
    }
  }
  return byExternal;
}

export function resolveSnapshotCourtIds(
  courts: BooktimeSnapshotCourtInput[],
  dbCourts: SnapshotCourtLookupRow[]
): BooktimeSnapshotCourtInput[] {
  const byExternal = buildSnapshotCourtLookupByExternalId(dbCourts);

  return courts.map((court) => {
    const fromExternal = byExternal.get(court.externalCourtId);
    return {
      ...court,
      courtId: fromExternal ?? null,
    };
  });
}

function dedupeBusySlots(slots: BooktimeBusySlot[]): BooktimeBusySlot[] {
  const seen = new Set<string>();
  const out: BooktimeBusySlot[] = [];
  for (const slot of slots) {
    const key = `${slot.startTime}|${slot.endTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(slot);
  }
  return out;
}

export function mergeSnapshotCourtsForStorage(
  courts: BooktimeSnapshotCourtInput[],
  dbCourts: SnapshotCourtLookupRow[] = []
): BooktimeSnapshotCourtInput[] {
  const canonicalExternalByCourtId = new Map<string, string>();
  const courtById = new Map<string, SnapshotCourtLookupRow>();
  for (const court of dbCourts) {
    courtById.set(court.id, court);
    const externalId = court.externalCourtId?.trim();
    if (externalId) {
      canonicalExternalByCourtId.set(court.id, externalId);
    }
  }

  const byKey = new Map<string, BooktimeSnapshotCourtInput>();
  for (const court of courts) {
    const key =
      court.courtId == null
        ? `unmapped:${court.externalCourtId}`
        : `court:${court.courtId}`;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...court, busySlots: [...court.busySlots] });
      continue;
    }

    existing.busySlots = dedupeBusySlots([...existing.busySlots, ...court.busySlots]);
  }

  return [...byKey.values()].map((court) => {
    if (court.courtId == null) return court;

    const dbCourt = courtById.get(court.courtId);
    const canonicalExternal = canonicalExternalByCourtId.get(court.courtId);
    return {
      ...court,
      externalCourtId: canonicalExternal ?? court.externalCourtId,
      externalCourtName:
        dbCourt?.integrationCourtName ?? dbCourt?.name ?? court.externalCourtName,
    };
  });
}

export function prepareSnapshotCourtsForStorage(
  courts: BooktimeSnapshotCourtInput[],
  dbCourts: SnapshotCourtLookupRow[]
): BooktimeSnapshotCourtInput[] {
  return mergeSnapshotCourtsForStorage(resolveSnapshotCourtIds(courts, dbCourts), dbCourts);
}
