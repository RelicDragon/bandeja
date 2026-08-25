import type { BooktimeLinkedGame } from '@/api/booktime';
import { booktimeApi } from '@/api/booktime';

const BATCH_MAX = 50;

export async function fetchLinkedGamesByBookingIds(
  bookingIds: string[],
): Promise<Map<string, BooktimeLinkedGame[]>> {
  const ids = [...new Set(bookingIds.filter((id) => id.trim()))];
  const merged = new Map<string, BooktimeLinkedGame[]>();
  if (ids.length === 0) return merged;

  for (let offset = 0; offset < ids.length; offset += BATCH_MAX) {
    const chunk = ids.slice(offset, offset + BATCH_MAX);
    const res = await booktimeApi.getLinkedGamesBatch(chunk);
    const data = res.data ?? {};
    for (const id of chunk) {
      merged.set(id, data[id] ?? []);
    }
  }
  return merged;
}
