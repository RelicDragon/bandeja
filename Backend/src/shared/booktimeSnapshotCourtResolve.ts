import type { BooktimeSnapshotCourtInput } from './booktimeBusySnapshot';

export type SnapshotCourtLookupRow = {
  id: string;
  name: string;
  externalCourtId: string | null;
  integrationCourtName: string | null;
};

function normalizeCourtName(name: string | null | undefined): string | null {
  const normalized = name?.trim().toLocaleLowerCase();
  return normalized ? normalized : null;
}

export function buildSnapshotCourtLookupMaps(dbCourts: SnapshotCourtLookupRow[]): {
  byExternal: Map<string, string>;
  byName: Map<string, string>;
} {
  const byExternal = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const court of dbCourts) {
    const externalId = court.externalCourtId?.trim();
    if (externalId) {
      byExternal.set(externalId, court.id);
    }
    for (const label of [court.integrationCourtName, court.name]) {
      const key = normalizeCourtName(label);
      if (key && !byName.has(key)) {
        byName.set(key, court.id);
      }
    }
  }
  return { byExternal, byName };
}

export function resolveSnapshotCourtIds(
  courts: BooktimeSnapshotCourtInput[],
  dbCourts: SnapshotCourtLookupRow[]
): BooktimeSnapshotCourtInput[] {
  const { byExternal, byName } = buildSnapshotCourtLookupMaps(dbCourts);

  return courts.map((court) => {
    const fromExternal = byExternal.get(court.externalCourtId);
    if (fromExternal) {
      return { ...court, courtId: fromExternal };
    }

    if (court.externalCourtName) {
      const fromName = byName.get(normalizeCourtName(court.externalCourtName) ?? '');
      if (fromName) {
        return { ...court, courtId: fromName };
      }
    }

    return court;
  });
}
