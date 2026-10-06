/**
 * Club console occupancy math (pure). Occupancy = booked court-minutes inside the opening
 * window / (active courts × open minutes). Overlapping bookings on one court count once.
 */

export interface CourtInterval {
  courtId: string;
  start: Date;
  end: Date;
}

/** Union of the intervals per court, clipped to `window`, summed in whole minutes. */
export function bookedCourtMinutes(
  intervals: CourtInterval[],
  window: { start: Date; end: Date },
  courtIds: ReadonlySet<string>
): number {
  const byCourt = new Map<string, Array<[number, number]>>();
  const ws = window.start.getTime();
  const we = window.end.getTime();
  for (const iv of intervals) {
    if (!courtIds.has(iv.courtId)) continue;
    const s = Math.max(iv.start.getTime(), ws);
    const e = Math.min(iv.end.getTime(), we);
    if (e <= s) continue;
    const list = byCourt.get(iv.courtId) ?? [];
    list.push([s, e]);
    byCourt.set(iv.courtId, list);
  }
  let totalMs = 0;
  for (const list of byCourt.values()) {
    list.sort((a, b) => a[0] - b[0]);
    let [cs, ce] = list[0];
    for (let i = 1; i < list.length; i++) {
      const [s, e] = list[i];
      if (s <= ce) {
        ce = Math.max(ce, e);
      } else {
        totalMs += ce - cs;
        cs = s;
        ce = e;
      }
    }
    totalMs += ce - cs;
  }
  return Math.round(totalMs / 60_000);
}

export function occupancyPct(bookedMinutes: number, openCourtMinutes: number): number {
  if (openCourtMinutes <= 0) return 0;
  return Math.min(100, Math.round((bookedMinutes / openCourtMinutes) * 1000) / 10);
}
