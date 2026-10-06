import { ClubIntegrationType, Prisma } from '@prisma/client';
import type {
  ClubAdminPersonRef,
  ClubPaymentMethod,
  ClubReport,
  ClubReportMetrics,
  ClubReportPeriod,
  HoldLabel,
} from '@bandeja/shared/clubAdmin/contract';
import { clubAdminCan } from '@bandeja/shared/clubAdmin/contract';
import { clubDayWindowUtc, clubLocalDate } from '@bandeja/shared/clubAdmin/clubTime';
import prisma from '../../config/database';
import type { ClubAdminRequestContext } from '../../middleware/clubAdminContext';
import { CourtOccupancyService } from '../game/courtOccupancy.service';
import { UNASSIGNED_COURT_KEY } from '../../shared/clubScheduleConstants';
import { loadGameCourtTime, loadHoldRows, type GameCourtTimeRow, type HoldRow } from './clubAdminBookingRows';
import { loadClubHoursSource, resolveDayHours } from './clubAdminHours.service';
import type { CourtInterval } from './clubAdminOccupancy';
import { isBillableHoldLabel, loadPricingContext, quoteGameWithContext, quoteWithContext } from './clubAdminPricing.service';
import {
  hourBuckets,
  mergeIntervalsByCourt,
  mondayWeeks,
  overlapMs,
  parseReportPeriod,
  pct,
  periodDates,
  previousPeriod,
} from './clubAdminReportsMath';
import { cachedClubReport } from './clubAdminReportsCache';
import { SNAPSHOT_INTEGRATIONS } from './clubAdminSchedule.service';

/**
 * `GET /reports` (docs/domains/club-admin.md "Reports" — the definitions there are load-bearing).
 * Everything is computed for club-local calendar days. One SQL query per metric family; the
 * result is cached per club + range + revenue capability and orphaned by billing mutations.
 * The top-regulars candidate list is cached viewer-independent; blocks are applied per request.
 */

export const TOP_REGULARS = 10;
/** Over-fetch so a viewer with blocks still gets a full list after filtering. */
const REGULAR_CANDIDATES = TOP_REGULARS * 3;
const MS_PER_MIN = 60_000;

export interface ReportPeriodWindow extends ClubReportPeriod {
  fromAt: Date;
  toAt: Date;
}

export function periodWindow(p: ClubReportPeriod, timezone: string): ReportPeriodWindow {
  return { ...p, fromAt: clubDayWindowUtc(p.from, timezone).start, toAt: clubDayWindowUtc(p.to, timezone).end };
}

/**
 * Games at the club whose start is in `[from, to)`: club, primary court or any court slot here
 * (`gameBelongsToClubWhere`), time set, any `Game.status`. LEAGUE_SEASON rows are containers,
 * not bookings, and are left out.
 */
export function clubGamesSql(clubId: string, from: Date, to: Date): Prisma.Sql {
  return Prisma.sql`
    SELECT g.id, g."startTime", g."entityType"::text AS "entityType" FROM "Game" g
    WHERE g."clubId" = ${clubId} AND g."timeIsSet" AND g."startTime" >= ${from} AND g."startTime" < ${to}
      AND g."entityType" <> 'LEAGUE_SEASON'
    UNION
    SELECT g.id, g."startTime", g."entityType"::text FROM "Court" c JOIN "Game" g ON g."courtId" = c.id
    WHERE c."clubId" = ${clubId} AND g."timeIsSet" AND g."startTime" >= ${from} AND g."startTime" < ${to}
      AND g."entityType" <> 'LEAGUE_SEASON'
    UNION
    SELECT g.id, g."startTime", g."entityType"::text FROM "Court" c
    JOIN "GameCourt" gc ON gc."courtId" = c.id JOIN "Game" g ON g.id = gc."gameId"
    WHERE c."clubId" = ${clubId} AND g."timeIsSet" AND g."startTime" >= ${from} AND g."startTime" < ${to}
      AND g."entityType" <> 'LEAGUE_SEASON'`;
}

const localDaySql = (column: Prisma.Sql, timezone: string) =>
  Prisma.sql`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}, 'YYYY-MM-DD')`;

interface CourtRef {
  id: string;
  name: string;
}

interface PeriodResult {
  metrics: ClubReportMetrics;
  heatmap: number[][];
  perCourt: ClubReport['perCourt'];
  daily: ClubReport['daily'];
  ratingTrend: ClubReport['ratingTrend'];
  regularCandidates: ClubReport['topRegulars'];
}

interface ComputeOpts {
  clubId: string;
  timezone: string;
  currency: string;
  integrationType: string | null;
  revenue: boolean;
  details: boolean;
}

async function loadExternalIntervals(o: ComputeOpts, from: Date, to: Date): Promise<CourtInterval[]> {
  const type = o.integrationType as ClubIntegrationType | null;
  if (!type || !SNAPSHOT_INTEGRATIONS.has(type)) return [];
  // Provider snapshots exist only for days somebody looked at; whatever is stored counts.
  const { blocks } = await CourtOccupancyService.getOccupancy({
    clubId: o.clubId,
    rangeStart: from,
    rangeEnd: to,
    includeUnmapped: false,
    sources: { games: false, holds: false, externals: true },
  });
  return blocks
    .filter((b) => b.kind === 'external' && b.courtId && b.courtId !== UNASSIGNED_COURT_KEY)
    .map((b) => ({ courtId: b.courtId!, start: new Date(b.startTime), end: new Date(b.endTime) }));
}

async function queryClubGames(clubId: string, from: Date, to: Date) {
  return prisma.$queryRaw<Array<{ id: string; startTime: Date; entityType: string }>>(clubGamesSql(clubId, from, to));
}

async function queryPlayers(clubId: string, timezone: string, from: Date, to: Date) {
  const rows = await prisma.$queryRaw<Array<{ day: string | null; players: number; noShows: number }>>(Prisma.sql`
    WITH cg AS (${clubGamesSql(clubId, from, to)}),
    pd AS (
      SELECT p."userId", p."noShowNotedAt", ${localDaySql(Prisma.sql`cg."startTime"`, timezone)} AS day
      FROM cg JOIN "GameParticipant" p ON p."gameId" = cg.id AND p.status = 'PLAYING'
    )
    SELECT day, COUNT(DISTINCT "userId")::int AS players,
           (COUNT(*) FILTER (WHERE "noShowNotedAt" IS NOT NULL))::int AS "noShows"
    FROM pd GROUP BY GROUPING SETS ((day), ())`);
  const total = rows.find((r) => r.day === null);
  return {
    unique: total?.players ?? 0,
    noShows: total?.noShows ?? 0,
    byDay: new Map(rows.filter((r) => r.day !== null).map((r) => [r.day!, r.players])),
  };
}

/** Players whose first-ever PLAYING game at this club starts inside `[from, to)`. */
async function queryNewPlayers(clubId: string, from: Date, to: Date): Promise<number> {
  const [row] = await prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    WITH cg AS (${clubGamesSql(clubId, new Date(0), to)}),
    firsts AS (
      SELECT p."userId", MIN(cg."startTime") AS first
      FROM cg JOIN "GameParticipant" p ON p."gameId" = cg.id AND p.status = 'PLAYING'
      GROUP BY p."userId"
    )
    SELECT COUNT(*)::int AS n FROM firsts WHERE first >= ${from}`);
  return row?.n ?? 0;
}

/** Public profiles only (`isActive`, `nameIsSet`) — the club public page's regulars rule. */
async function queryRegularCandidates(clubId: string, from: Date, to: Date): Promise<ClubReport['topRegulars']> {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; firstName: string | null; lastName: string | null; avatar: string | null; games: number }>
  >(Prisma.sql`
    WITH cg AS (${clubGamesSql(clubId, from, to)})
    SELECT u.id, u."firstName", u."lastName", u.avatar, COUNT(*)::int AS games
    FROM cg
    JOIN "GameParticipant" p ON p."gameId" = cg.id AND p.status = 'PLAYING'
    JOIN "User" u ON u.id = p."userId"
    WHERE u."isActive" AND u."nameIsSet"
    GROUP BY u.id, u."firstName", u."lastName", u.avatar
    ORDER BY games DESC, u.id ASC
    LIMIT ${REGULAR_CANDIDATES}`);
  return rows.map((r) => ({ user: { id: r.id, firstName: r.firstName, lastName: r.lastName, avatar: r.avatar }, games: r.games }));
}

async function queryRatingTrend(clubId: string, timezone: string, p: ReportPeriodWindow): Promise<ClubReport['ratingTrend']> {
  const rows = await prisma.$queryRaw<Array<{ week: string; avg: number | null; n: number }>>(Prisma.sql`
    SELECT to_char(date_trunc('week', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}), 'YYYY-MM-DD') AS week,
           AVG(stars)::float8 AS avg, COUNT(*)::int AS n
    FROM "ClubReview"
    WHERE "clubId" = ${clubId} AND "createdAt" >= ${p.fromAt} AND "createdAt" < ${p.toAt}
    GROUP BY 1`);
  const byWeek = new Map(rows.map((r) => [r.week, r]));
  return mondayWeeks(p.from, p.to).map((weekStart) => {
    const r = byWeek.get(weekStart);
    return { weekStart, averageStars: r?.avg == null ? null : round2(r.avg), count: r?.n ?? 0 };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function queryCharged(clubId: string, p: ReportPeriodWindow) {
  const [row] = await prisma.$queryRaw<Array<{ charged: bigint | null; outstanding: bigint | null }>>(Prisma.sql`
    SELECT SUM(x.amount)::bigint AS charged, SUM(GREATEST(x.amount - x.paid, 0))::bigint AS outstanding
    FROM (
      SELECT c."amountCents" AS amount,
             COALESCE((SELECT SUM(p."amountCents") FROM "ClubPayment" p WHERE p."chargeId" = c.id AND p."voidedAt" IS NULL), 0) AS paid,
             CASE WHEN c."sourceKind" = 'MANUAL' OR c."startTime" IS NULL THEN c."createdAt" ELSE c."startTime" END AS at
      FROM "ClubCharge" c
      WHERE c."clubId" = ${clubId} AND c.status NOT IN ('VOID', 'WAIVED')
    ) x
    WHERE x.at >= ${p.fromAt} AND x.at < ${p.toAt}`);
  return { charged: Number(row?.charged ?? 0), outstanding: Number(row?.outstanding ?? 0) };
}

async function queryCollected(clubId: string, timezone: string, p: ReportPeriodWindow) {
  const rows = await prisma.$queryRaw<Array<{ method: string | null; day: string | null; courtId: string | null; total: bigint; g: number }>>(Prisma.sql`
    WITH pp AS (
      SELECT p."amountCents" AS amount, p.method::text AS method, c."courtId" AS "courtId",
             ${localDaySql(Prisma.sql`p."paidAt"`, timezone)} AS day
      FROM "ClubPayment" p JOIN "ClubCharge" c ON c.id = p."chargeId"
      WHERE p."clubId" = ${clubId} AND p."voidedAt" IS NULL AND p."paidAt" >= ${p.fromAt} AND p."paidAt" < ${p.toAt}
    )
    SELECT method, day, "courtId", SUM(amount)::bigint AS total, GROUPING(method, day, "courtId")::int AS g
    FROM pp GROUP BY GROUPING SETS ((method), (day), ("courtId"))`);
  const byMethod: Partial<Record<ClubPaymentMethod, number>> = {};
  const byDay = new Map<string, number>();
  const byCourt = new Map<string, number>();
  let collected = 0;
  for (const r of rows) {
    const total = Number(r.total);
    if (r.g === 3 && r.method) {
      byMethod[r.method as ClubPaymentMethod] = total;
      collected += total;
    } else if (r.g === 5 && r.day) byDay.set(r.day, total);
    else if (r.g === 6 && r.courtId) byCourt.set(r.courtId, total);
  }
  return { collected, byMethod, byDay, byCourt };
}

async function computePeriod(o: ComputeOpts, p: ReportPeriodWindow, courts: CourtRef[]): Promise<PeriodResult> {
  const { clubId, timezone } = o;
  const dates = periodDates(p);
  const hoursSource = await loadClubHoursSource(clubId, timezone, { fromDate: p.from, toDate: p.to });
  const windows = dates.map((date) => {
    const h = resolveDayHours(hoursSource, date);
    return { date, window: h ? { start: new Date(h.openAt), end: new Date(h.closeAt) } : null };
  });
  // Opening windows may run past the period's last midnight; load bookings for all of them.
  const occFrom = new Date(Math.min(p.fromAt.getTime(), ...windows.flatMap((w) => (w.window ? [w.window.start.getTime()] : []))));
  const occTo = new Date(Math.max(p.toAt.getTime(), ...windows.flatMap((w) => (w.window ? [w.window.end.getTime()] : []))));

  const [gameRows, holdRows, externals, clubGames, players, newPlayers, cancelled, reviews] = await Promise.all([
    loadGameCourtTime(clubId, occFrom, occTo),
    loadHoldRows(clubId, occFrom, occTo),
    loadExternalIntervals(o, occFrom, occTo),
    queryClubGames(clubId, p.fromAt, p.toAt),
    queryPlayers(clubId, timezone, p.fromAt, p.toAt),
    queryNewPlayers(clubId, p.fromAt, p.toAt),
    prisma.cancelledGame.count({ where: { clubId, startTime: { gte: p.fromAt, lt: p.toAt } } }),
    prisma.clubReview.aggregate({
      where: { clubId, createdAt: { gte: p.fromAt, lt: p.toAt } },
      _count: { _all: true },
      _avg: { stars: true },
    }),
  ]);

  /* --- occupancy ------------------------------------------------------------------------------ */
  const courtIds = new Set(courts.map((c) => c.id));
  const intervals: CourtInterval[] = [
    ...gameRows.flatMap((g) => g.courtIds.map((courtId) => ({ courtId, start: g.start, end: g.end }))),
    ...holdRows.filter((h) => h.label !== 'MAINTENANCE').map((h) => ({ courtId: h.courtId, start: h.start, end: h.end })),
    ...externals,
  ];
  const merged = mergeIntervalsByCourt(intervals, courtIds);
  const heatOpen = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const heatBooked = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const courtBookedMs = new Map(courts.map((c) => [c.id, 0]));
  const dailyOcc = new Map<string, { bookedMs: number; openMs: number }>();
  let openMs = 0;
  let bookedMs = 0;
  for (const { date, window } of windows) {
    if (!window || courts.length === 0) {
      dailyOcc.set(date, { bookedMs: 0, openMs: 0 });
      continue;
    }
    const ws = window.start.getTime();
    const we = window.end.getTime();
    const dayOpen = (we - ws) * courts.length;
    let dayBooked = 0;
    for (const c of courts) {
      const ms = overlapMs(merged.get(c.id), ws, we);
      dayBooked += ms;
      courtBookedMs.set(c.id, (courtBookedMs.get(c.id) ?? 0) + ms);
    }
    for (const b of hourBuckets(date, window, timezone)) {
      heatOpen[b.weekday][b.hour] += (b.end - b.start) * courts.length;
      for (const c of courts) heatBooked[b.weekday][b.hour] += overlapMs(merged.get(c.id), b.start, b.end);
    }
    openMs += dayOpen;
    bookedMs += dayBooked;
    dailyOcc.set(date, { bookedMs: dayBooked, openMs: dayOpen });
  }

  /* --- games, holds --------------------------------------------------------------------------- */
  const inPeriod = (d: Date) => d >= p.fromAt && d < p.toAt;
  const byEntityType: Record<string, number> = {};
  const gamesByDay = new Map<string, number>();
  for (const g of clubGames) {
    byEntityType[g.entityType] = (byEntityType[g.entityType] ?? 0) + 1;
    const day = clubLocalDate(g.startTime, timezone);
    gamesByDay.set(day, (gamesByDay.get(day) ?? 0) + 1);
  }
  const periodGameRows = gameRows.filter((g) => inPeriod(g.start));
  const gamesPerCourt = new Map<string, number>();
  for (const g of periodGameRows) for (const id of g.courtIds) gamesPerCourt.set(id, (gamesPerCourt.get(id) ?? 0) + 1);
  const periodHolds = holdRows.filter((h) => inPeriod(h.start));
  const holdsByLabel: Partial<Record<HoldLabel, number>> = {};
  for (const h of periodHolds) holdsByLabel[h.label as HoldLabel] = (holdsByLabel[h.label as HoldLabel] ?? 0) + 1;

  /* --- revenue -------------------------------------------------------------------------------- */
  let revenue: ClubReportMetrics['revenue'];
  let collectedByDay = new Map<string, number>();
  let collectedByCourt = new Map<string, number>();
  if (o.revenue) {
    const [pricing, charged, collected] = await Promise.all([
      loadPricingContext(clubId),
      queryCharged(clubId, p),
      queryCollected(clubId, timezone, p),
    ]);
    revenue = {
      currency: o.currency,
      expectedCents: expectedCents(pricing, periodGameRows, periodHolds),
      chargedCents: charged.charged,
      collectedCents: collected.collected,
      outstandingCents: charged.outstanding,
      byMethod: collected.byMethod,
    };
    collectedByDay = collected.byDay;
    collectedByCourt = collected.byCourt;
  }

  const metrics: ClubReportMetrics = {
    occupancy: { pct: pct(bookedMs, openMs), bookedMinutes: Math.round(bookedMs / MS_PER_MIN), openMinutes: Math.round(openMs / MS_PER_MIN) },
    games: { total: clubGames.length, byEntityType, cancelled, noShows: players.noShows },
    holds: { total: periodHolds.length, byLabel: holdsByLabel },
    players: { unique: players.unique, new: newPlayers, returning: Math.max(0, players.unique - newPlayers) },
    ...(revenue ? { revenue } : {}),
    reviews: {
      count: reviews._count._all,
      averageStars: reviews._avg.stars == null ? null : round2(reviews._avg.stars),
    },
  };
  if (!o.details) return { metrics, heatmap: [], perCourt: [], daily: [], ratingTrend: [], regularCandidates: [] };

  const [ratingTrend, regularCandidates] = await Promise.all([
    queryRatingTrend(clubId, timezone, p),
    queryRegularCandidates(clubId, p.fromAt, p.toAt),
  ]);
  const courtOpenMs = courts.length ? openMs / courts.length : 0;
  return {
    metrics,
    heatmap: heatOpen.map((row, wd) => row.map((open, h) => pct(heatBooked[wd][h], open))),
    perCourt: courts.map((c) => {
      const booked = courtBookedMs.get(c.id) ?? 0;
      return {
        courtId: c.id,
        name: c.name,
        occupancyPct: pct(booked, courtOpenMs),
        bookedMinutes: Math.round(booked / MS_PER_MIN),
        games: gamesPerCourt.get(c.id) ?? 0,
        ...(o.revenue ? { collectedCents: collectedByCourt.get(c.id) ?? 0 } : {}),
      };
    }),
    daily: dates.map((date) => {
      const occ = dailyOcc.get(date) ?? { bookedMs: 0, openMs: 0 };
      return {
        date,
        occupancyPct: pct(occ.bookedMs, occ.openMs),
        bookedMinutes: Math.round(occ.bookedMs / MS_PER_MIN),
        games: gamesByDay.get(date) ?? 0,
        players: players.byDay.get(date) ?? 0,
        ...(o.revenue ? { collectedCents: collectedByDay.get(date) ?? 0 } : {}),
      };
    }),
    ratingTrend,
    regularCandidates,
  };
}

/** Quotes of the period's billable bookings (by start): games always, holds by billable label. */
function expectedCents(
  pricing: Awaited<ReturnType<typeof loadPricingContext>>,
  games: GameCourtTimeRow[],
  holds: HoldRow[]
): number {
  let total = 0;
  for (const g of games) total += quoteGameWithContext(pricing, g.courtIds, g.start, g.end) ?? 0;
  for (const h of holds) {
    if (!isBillableHoldLabel(h.label, pricing.billableHoldLabels)) continue;
    total += quoteWithContext(pricing, h.courtId, h.start, h.end).amountCents ?? 0;
  }
  return total;
}

/** Ids the viewer blocked or is blocked by. */
export async function blockedIdsFor(viewerId: string): Promise<Set<string>> {
  const edges = await prisma.blockedUser.findMany({
    where: { OR: [{ userId: viewerId }, { blockedUserId: viewerId }] },
    select: { userId: true, blockedUserId: true },
  });
  return new Set(edges.map((e) => (e.userId === viewerId ? e.blockedUserId : e.userId)));
}

export function applyBlocks<T extends { user: ClubAdminPersonRef }>(rows: T[], blocked: ReadonlySet<string>, limit: number): T[] {
  return rows.filter((r) => !blocked.has(r.user.id)).slice(0, limit);
}

export async function activeCourtRefs(clubId: string): Promise<CourtRef[]> {
  return prisma.court.findMany({
    where: { clubId, isActive: true },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getClubReport(
  ctx: ClubAdminRequestContext,
  viewerId: string,
  query: Record<string, unknown>,
  now: Date = new Date()
): Promise<ClubReport> {
  const period = parseReportPeriod(query.from, query.to);
  const compare = query.compare === '1' || query.compare === 'true';
  const revenue = clubAdminCan(ctx.role, 'reports.revenue');
  const today = clubLocalDate(now, ctx.timezone);
  // Ranges that reach today change minute by minute; history only changes with billing edits.
  const ttlSec = period.to >= today ? 60 : 600;
  const opts: ComputeOpts = {
    clubId: ctx.clubId,
    timezone: ctx.timezone,
    currency: ctx.currency,
    integrationType: ctx.club.integrationType,
    revenue,
    details: true,
  };
  const cached = await cachedClubReport<ClubReport>(
    ctx.clubId,
    [period.from, period.to, compare ? 'cmp' : 'one', revenue ? 'rev' : 'norev', ctx.timezone],
    ttlSec,
    async () => {
      const courts = await activeCourtRefs(ctx.clubId);
      const [current, previous] = await Promise.all([
        computePeriod(opts, periodWindow(period, ctx.timezone), courts),
        compare ? computePeriod({ ...opts, details: false }, periodWindow(previousPeriod(period), ctx.timezone), courts) : null,
      ]);
      return {
        period,
        timezone: ctx.timezone,
        current: current.metrics,
        previous: previous?.metrics ?? null,
        heatmap: current.heatmap,
        perCourt: current.perCourt,
        daily: current.daily,
        // Viewer-independent candidates; trimmed per viewer below.
        topRegulars: current.regularCandidates,
        ratingTrend: current.ratingTrend,
      };
    }
  );
  const blocked = await blockedIdsFor(viewerId);
  return { ...cached, topRegulars: applyBlocks(cached.topRegulars, blocked, TOP_REGULARS) };
}
