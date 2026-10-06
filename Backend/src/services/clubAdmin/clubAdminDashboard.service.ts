import { ParticipantStatus } from '@prisma/client';
import type { AttentionItem, ClubDashboard } from '@bandeja/shared/clubAdmin/contract';
import { clubAdminCan } from '@bandeja/shared/clubAdmin/contract';
import { addDaysToDate, clubDayWindowUtc, clubLocalDate } from '@bandeja/shared/clubAdmin/clubTime';
import prisma from '../../config/database';
import type { ClubAdminRequestContext } from '../../middleware/clubAdminContext';
import { CourtOccupancyService } from '../game/courtOccupancy.service';
import { UNASSIGNED_COURT_KEY } from '../../shared/clubScheduleConstants';
import { listBookings } from './clubAdminBookings.service';
import { getSetupChecklist, missingSetup } from './clubAdminContext.service';
import { loadClubHoursSource, resolveDayHours } from './clubAdminHours.service';
import { bookedCourtMinutes, CourtInterval, occupancyPct } from './clubAdminOccupancy';
import { ClubAdminScheduleService } from './clubAdminSchedule.service';

const WEEK_DAYS = 7;
const UP_NEXT = 6;
const NEW_REVIEW_DAYS = 7;

/**
 * Billing attention (`unpaid_past`) and revenue KPIs plug in here once billing lands.
 * Return `[]` / nulls until then; the dashboard shape already carries the fields.
 */
export interface DashboardBillingExtras {
  attention: AttentionItem[];
  expectedRevenueCents: number | null;
  collectedCents: number | null;
}

export type DashboardBillingProvider = (ctx: ClubAdminRequestContext, date: string) => Promise<DashboardBillingExtras>;

let billingProvider: DashboardBillingProvider | null = null;
export function setDashboardBillingProvider(provider: DashboardBillingProvider | null): void {
  billingProvider = provider;
}

export async function getClubDashboard(ctx: ClubAdminRequestContext, now: Date = new Date()): Promise<ClubDashboard> {
  const { clubId, timezone } = ctx;
  const today = clubLocalDate(now, timezone);
  const lastDay = addDaysToDate(today, WEEK_DAYS - 1);
  const dates = Array.from({ length: WEEK_DAYS }, (_, i) => addDaysToDate(today, i));

  const hoursSource = await loadClubHoursSource(clubId, timezone, { fromDate: today, toDate: lastDay });
  const hoursByDate = new Map(dates.map((d) => [d, resolveDayHours(hoursSource, d)]));
  const todayWindow = clubDayWindowUtc(today, timezone);
  const rangeStart = new Date(
    Math.min(todayWindow.start.getTime(), ...[...hoursByDate.values()].flatMap((h) => (h ? [new Date(h.openAt).getTime()] : [])))
  );
  const rangeEnd = new Date(
    Math.max(
      clubDayWindowUtc(lastDay, timezone).end.getTime(),
      ...[...hoursByDate.values()].flatMap((h) => (h ? [new Date(h.closeAt).getTime()] : []))
    )
  );

  const [activeCourts, occupancy, schedule, setup] = await Promise.all([
    prisma.court.findMany({ where: { clubId, isActive: true }, select: { id: true } }),
    CourtOccupancyService.getOccupancy({ clubId, rangeStart, rangeEnd, gameCourtFilter: 'admin', includeUnmapped: false }),
    ClubAdminScheduleService.buildDaySchedule(clubId, today),
    getSetupChecklist(clubId),
  ]);
  const courtIds = new Set(activeCourts.map((c) => c.id));

  // Booked = games on a court, holds except MAINTENANCE, provider bookings. Unions per court.
  const intervals: CourtInterval[] = occupancy.blocks
    .filter((b) => b.courtId && b.courtId !== UNASSIGNED_COURT_KEY)
    .filter((b) => !(b.kind === 'hold' && b.holdLabel === 'MAINTENANCE'))
    .map((b) => ({ courtId: b.courtId!, start: new Date(b.startTime), end: new Date(b.endTime) }));

  const week = dates.map((date) => {
    const hours = hoursByDate.get(date) ?? null;
    if (!hours) return { date, occupancyPct: 0, bookedMinutes: 0, openMinutes: 0 };
    const window = { start: new Date(hours.openAt), end: new Date(hours.closeAt) };
    const openMinutes = Math.round((window.end.getTime() - window.start.getTime()) / 60_000) * courtIds.size;
    const booked = bookedCourtMinutes(intervals, window, courtIds);
    return { date, occupancyPct: occupancyPct(booked, openMinutes), bookedMinutes: booked, openMinutes };
  });
  const todayStats = week[0];

  // Today's counts are by start time within the club-local day.
  const startsToday = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= todayWindow.start.getTime() && t < todayWindow.end.getTime();
  };
  const todaysGameIds = [
    ...new Set(
      schedule.slots.flatMap((s) => ((s.type === 'game' || s.type === 'game_court') && startsToday(s.startTime) ? [s.gameId] : []))
    ),
  ];
  const holdsToday = new Set(schedule.slots.flatMap((s) => (s.type === 'hold' && startsToday(s.startTime) ? [s.holdId] : [])));
  const externalsToday = schedule.slots.filter((s) => s.type === 'external' && startsToday(s.startTime)).length;
  const players = todaysGameIds.length
    ? await prisma.gameParticipant.findMany({
        where: { gameId: { in: todaysGameIds }, status: ParticipantStatus.PLAYING },
        distinct: ['userId'],
        select: { userId: true },
      })
    : [];

  const attention: AttentionItem[] = [];
  if (schedule.conflicts.length > 0) attention.push({ kind: 'conflict', count: schedule.conflicts.length, date: today });
  if (schedule.externalSlotsFailed) attention.push({ kind: 'sync_failed', provider: ctx.club.integrationType });
  if (schedule.unmappedExternalCourtCount > 0) attention.push({ kind: 'unmapped_courts', count: schedule.unmappedExternalCourtCount });
  const courtless = new Set(schedule.slots.flatMap((s) => (s.type === 'game' && s.courtId == null ? [s.gameId] : [])));
  if (courtless.size > 0) attention.push({ kind: 'game_without_court', count: courtless.size, date: today });
  if (clubAdminCan(ctx.role, 'reviews.view')) {
    const since = new Date(now.getTime() - NEW_REVIEW_DAYS * 86_400_000);
    const reviews = await prisma.clubReview.aggregate({
      where: { clubId, createdAt: { gte: since } },
      _count: { _all: true },
      _avg: { stars: true },
    });
    if (reviews._count._all > 0) {
      attention.push({
        kind: 'new_reviews',
        count: reviews._count._all,
        averageStars: reviews._avg.stars == null ? null : Math.round(reviews._avg.stars * 10) / 10,
      });
    }
  }
  const missing = missingSetup(setup);
  if (missing.length > 0 && clubAdminCan(ctx.role, 'club.edit')) attention.push({ kind: 'setup', missing });

  const billing = billingProvider ? await billingProvider(ctx, today) : null;
  if (billing && clubAdminCan(ctx.role, 'billing.collect')) attention.push(...billing.attention);
  const showRevenue = clubAdminCan(ctx.role, 'reports.revenue');

  const upNext = await listBookings(
    { clubId, timezone, currency: ctx.currency, integrationType: ctx.club.integrationType },
    { scope: 'upcoming', to: today, kinds: ['game', 'hold', 'external'], limit: UP_NEXT },
    now
  );

  return {
    date: today,
    timezone,
    now: now.toISOString(),
    hours: hoursByDate.get(today) ?? null,
    kpis: {
      occupancyPct: todayStats.occupancyPct,
      bookedMinutes: todayStats.bookedMinutes,
      openMinutes: todayStats.openMinutes,
      games: todaysGameIds.length,
      players: players.length,
      holds: holdsToday.size,
      externalBookings: externalsToday,
      ...(showRevenue
        ? { expectedRevenueCents: billing?.expectedRevenueCents ?? null, collectedCents: billing?.collectedCents ?? null }
        : {}),
      currency: ctx.currency,
    },
    attention,
    upNext: upNext.items,
    week: week.map(({ date, occupancyPct: pct, bookedMinutes }) => ({ date, occupancyPct: pct, bookedMinutes })),
  };
}
