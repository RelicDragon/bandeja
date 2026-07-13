import { ApiError } from '../../utils/ApiError';
import {
  type BooktimeBusySlot,
} from '../../shared/booktimeBusySnapshot';
import { parseBusySlotsForIngest } from '../../shared/booktime/ingest';

export type SnapshotCourtInput = {
  courtId: string | null;
  externalCourtId: string;
  externalCourtName?: string | null;
  busySlots: BooktimeBusySlot[];
};

export type SnapshotResponse = {
  date: string;
  fetchedAt: string | null;
  courts: Array<{
    courtId: string | null;
    externalCourtId: string | null;
    externalCourtName: string | null;
    busySlots: BooktimeBusySlot[];
  }>;
};

export function parseFetchedAt(raw: unknown): Date {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ApiError(400, 'fetchedAt is required');
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError(400, 'fetchedAt is invalid');
  }
  return d;
}

export function parseCourtsInput(raw: unknown): SnapshotCourtInput[] {
  if (!Array.isArray(raw)) {
    throw new ApiError(400, 'courts must be an array');
  }

  const courts: SnapshotCourtInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      throw new ApiError(400, 'Each court entry must be an object');
    }
    const record = item as Record<string, unknown>;
    const courtId = record.courtId;
    const externalCourtId = record.externalCourtId;
    const externalCourtName = record.externalCourtName;

    if (courtId != null && typeof courtId !== 'string') {
      throw new ApiError(400, 'courtId must be a string or null');
    }
    if (typeof externalCourtId !== 'string' || !externalCourtId.trim()) {
      throw new ApiError(400, 'externalCourtId is required for each court');
    }

    courts.push({
      courtId: courtId == null ? null : courtId,
      externalCourtId: externalCourtId.trim(),
      externalCourtName:
        typeof externalCourtName === 'string' && externalCourtName.trim()
          ? externalCourtName.trim()
          : null,
      busySlots: parseBusySlotsForIngest(record.busySlots),
    });
  }

  return courts;
}
