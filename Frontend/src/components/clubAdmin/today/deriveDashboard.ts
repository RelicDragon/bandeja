/**
 * Today's numbers derived from the day's schedule, for backends without `GET /dashboard`.
 * Same definitions as the server: occupancy = booked court-minutes / open court-minutes inside
 * the opening window, where overlapping bookings on one court count once.
 */
import type {
  AttentionItem,
  BookingItem,
  ClubDashboard,
  ClubScheduleResponseV2,
  ClubSetupChecklist,
  ScheduleSlotV2,
} from '@shared/clubAdmin/contract';
import { clubWallTimeToUtc } from '@shared/clubAdmin/clubTime';
import { slotCourtKey, UNASSIGNED_COURT, type ScheduleCourtColumn, type ScheduleWindow } from '../schedule/scheduleModel';

/** Total length (ms) of the union of intervals, clipped to [from, to). */
export function unionLength(intervals: Array<[number, number]>, from: number, to: number): number {
  const clipped = intervals
    .map(([a, b]) => [Math.max(a, from), Math.min(b, to)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curA = -Infinity;
  let curB = -Infinity;
  for (const [a, b] of clipped) {
    if (a > curB) {
      if (curB > curA) total += curB - curA;
      curA = a;
      curB = b;
    } else {
      curB = Math.max(curB, b);
    }
  }
  if (curB > curA) total += curB - curA;
  return total;
}

export function slotToBooking(slot: ScheduleSlotV2, courtName: string | null): BookingItem {
  const base = {
    courtId: slot.courtId,
    courtName,
    startTime: slot.startTime,
    endTime: slot.endTime,
  };
  if (slot.type === 'hold') {
    return {
      ...base,
      id: `hold:${slot.holdId}`,
      kind: 'hold',
      holdId: slot.holdId,
      seriesId: slot.seriesId ?? null,
      label: slot.label,
      note: slot.note,
      customerName: slot.customerName ?? null,
      customerPhone: slot.customerPhone ?? null,
      billing: slot.billing ?? null,
    };
  }
  if (slot.type === 'external') {
    return { ...base, id: `external:${slot.courtId}:${slot.startTime}`, kind: 'external', provider: '', billing: null };
  }
  return {
    ...base,
    id: `game:${slot.gameId}:${slot.courtId ?? ''}`,
    kind: 'game',
    gameId: slot.gameId,
    name: slot.name,
    status: slot.status,
    entityType: slot.entityType,
    hasBookedCourt: slot.hasBookedCourt,
    host: slot.host,
    participantCount: slot.participantCount,
    maxParticipants: slot.maxParticipants ?? null,
    billing: slot.billing ?? null,
  };
}

export function deriveDashboard(input: {
  schedule: ClubScheduleResponseV2;
  window: ScheduleWindow;
  courts: ScheduleCourtColumn[];
  nowMs: number;
  currency: string;
  setup: ClubSetupChecklist;
}): ClubDashboard {
  const { schedule, window, courts, nowMs } = input;
  const realCourts = courts.filter((c) => c.key !== UNASSIGNED_COURT && c.isActive);
  const openStart =
    window.openMin === null ? window.rowInstants[0] : clubWallTimeToUtc(window.date, window.openMin, window.timeZone).getTime();
  const openEnd =
    window.openMin === null || window.closeMin === null
      ? openStart
      : clubWallTimeToUtc(window.date, window.closeMin, window.timeZone).getTime();
  const openMinutesPerCourt = Math.max(0, (openEnd - openStart) / 60_000);

  const perCourt = new Map<string, Array<[number, number]>>();
  const games = new Map<string, number>();
  let holds = 0;
  let external = 0;
  let unassigned = 0;
  for (const s of schedule.slots) {
    const key = slotCourtKey(s);
    if (key !== UNASSIGNED_COURT) {
      const list = perCourt.get(key) ?? [];
      list.push([Date.parse(s.startTime), Date.parse(s.endTime)]);
      perCourt.set(key, list);
    }
    if (s.type === 'hold') holds += 1;
    else if (s.type === 'external') external += 1;
    else {
      games.set(s.gameId, Math.max(games.get(s.gameId) ?? 0, s.participantCount));
      if (s.courtId === null) unassigned += 1;
    }
  }
  let bookedMs = 0;
  for (const c of realCourts) bookedMs += unionLength(perCourt.get(c.key) ?? [], openStart, openEnd);
  const bookedMinutes = Math.round(bookedMs / 60_000);
  const openMinutes = Math.round(openMinutesPerCourt * realCourts.length);

  const attention: AttentionItem[] = [];
  if (schedule.conflicts.length > 0) attention.push({ kind: 'conflict', count: schedule.conflicts.length, date: window.date });
  if (schedule.externalSlotsFailed) attention.push({ kind: 'sync_failed', provider: null });
  if ((schedule.unmappedExternalCourtCount ?? 0) > 0) {
    attention.push({ kind: 'unmapped_courts', count: schedule.unmappedExternalCourtCount ?? 0 });
  }
  if (unassigned > 0) attention.push({ kind: 'game_without_court', count: unassigned, date: window.date });
  const missing = (Object.keys(input.setup) as Array<keyof ClubSetupChecklist>).filter((k) => !input.setup[k]);
  if (missing.length > 0) attention.push({ kind: 'setup', missing });

  const names = new Map(courts.map((c) => [c.key, c.name]));
  const upNext = schedule.slots
    .filter((s) => Date.parse(s.endTime) > nowMs)
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
    .slice(0, 6)
    .map((s) => slotToBooking(s, names.get(slotCourtKey(s)) ?? null));

  return {
    date: window.date,
    timezone: window.timeZone,
    now: new Date(nowMs).toISOString(),
    hours: null,
    kpis: {
      occupancyPct: openMinutes > 0 ? Math.min(100, Math.round((bookedMinutes / openMinutes) * 100)) : 0,
      bookedMinutes,
      openMinutes,
      games: games.size,
      players: [...games.values()].reduce((n, c) => n + c, 0),
      holds,
      externalBookings: external,
      currency: input.currency,
    },
    attention,
    upNext,
    week: [],
  };
}
