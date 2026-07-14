/**
 * Hard ceilings for Find available fetches.
 *
 * Calendar month: clients page with `cursor` / `take` (default {@link AVAILABLE_GAMES_MONTH_TAKE}).
 * Upcoming list: fixed take {@link AVAILABLE_GAMES_UPCOMING_TAKE}.
 * Selected-day detail: {@link AVAILABLE_GAMES_DAY_TAKE} (narrow date range + cursor).
 *
 * Client request next page: pass meta.nextCursor as `cursor` with the same filter/date params.
 */

export const AVAILABLE_GAMES_MONTH_TAKE = 300;
export const AVAILABLE_GAMES_UPCOMING_TAKE = 300;
export const AVAILABLE_GAMES_DAY_TAKE = 100;
export const AVAILABLE_GAMES_MAX_TAKE = 300;

export type AvailableGamesCursor = {
  startTime: string;
  id: string;
};

export type AvailableGamesPageMeta = {
  take: number;
  bound: number;
  hasMore: boolean;
  nextCursor: string | null;
  truncated: boolean;
};

export function clampAvailableTake(
  requested: unknown,
  fallback: number,
): number {
  const n = typeof requested === 'number' ? requested : Number(requested);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), AVAILABLE_GAMES_MAX_TAKE);
}

export function encodeAvailableGamesCursor(cursor: AvailableGamesCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeAvailableGamesCursor(raw: unknown): AvailableGamesCursor | null {
  if (raw == null || raw === '') return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8')) as {
      startTime?: unknown;
      id?: unknown;
    };
    if (typeof parsed.startTime !== 'string' || typeof parsed.id !== 'string') {
      return null;
    }
    const t = new Date(parsed.startTime);
    if (Number.isNaN(t.getTime())) return null;
    return { startTime: parsed.startTime, id: parsed.id };
  } catch {
    return null;
  }
}

export function buildAvailableGamesPageMeta(
  rows: Array<{ id: string; startTime: Date | string }>,
  take: number,
): AvailableGamesPageMeta {
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeAvailableGamesCursor({
          startTime:
            last.startTime instanceof Date
              ? last.startTime.toISOString()
              : String(last.startTime),
          id: last.id,
        })
      : null;
  return {
    take,
    bound: AVAILABLE_GAMES_MAX_TAKE,
    hasMore,
    nextCursor,
    truncated: hasMore,
  };
}

/** Prisma cursor/OR for stable (startTime, id) pagination ascending. */
export function availableGamesCursorWhere(
  cursor: AvailableGamesCursor | null,
): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  const startTime = new Date(cursor.startTime);
  return {
    OR: [
      { startTime: { gt: startTime } },
      { startTime, id: { gt: cursor.id } },
    ],
  };
}

/**
 * After an optional post-fetch filter (e.g. availableSlots), build the delivered page
 * and next cursor without skipping leftover filtered rows already in `filtered`.
 *
 * If `filtered.length > take`, cursor tips at the last *delivered* row so the next
 * page resumes after it (leftover filtered rows are not jumped over).
 * Otherwise if the DB scan had more rows, tip at the scan end to continue scanning.
 */
export function resolveAvailablePageAfterFilter<
  T extends { id: string; startTime: Date | string },
>(
  scanned: T[],
  filtered: T[],
  take: number,
  scannedHasMore: boolean,
): { page: T[]; hasMore: boolean; cursorTip: T | null } {
  const page = filtered.slice(0, take);
  if (filtered.length > take) {
    return {
      page,
      hasMore: true,
      cursorTip: page[page.length - 1] ?? null,
    };
  }
  if (scannedHasMore) {
    return {
      page,
      hasMore: true,
      cursorTip: scanned[scanned.length - 1] ?? null,
    };
  }
  return { page, hasMore: false, cursorTip: null };
}
