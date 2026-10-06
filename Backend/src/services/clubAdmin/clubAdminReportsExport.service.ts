import type { Response } from 'express';
import { ParticipantStatus, Prisma } from '@prisma/client';
import { clubAdminCan } from '@bandeja/shared/clubAdmin/contract';
import { clubLocalDate, clubLocalTime } from '@bandeja/shared/clubAdmin/clubTime';
import prisma from '../../config/database';
import type { ClubAdminRequestContext } from '../../middleware/clubAdminContext';
import { clubAdminError, clubAdminValidation } from './clubAdminErrors';
import { gameBelongsToClubWhere } from './clubAdminGameScope';
import { loadLiveChargesFor } from './clubAdminBilling.service';
import { CSV_BOM, centsToDecimal, csvRow, type CsvValue } from './clubAdminCsv';
import { isBillableHoldLabel, loadPricingContext, quoteGameWithContext, quoteWithContext, type PricingContext } from './clubAdminPricing.service';
import { parseReportPeriod } from './clubAdminReportsMath';
import { blockedIdsFor, clubGamesSql, periodWindow, type ReportPeriodWindow } from './clubAdminReports.service';

/**
 * `GET /reports/export.csv?from&to&dataset=bookings|payments|players` — streamed CSV (UTF-8 BOM,
 * club-local dates/times, formula-injection safe). Rows are read in keyset pages so a year of
 * bookings never sits in memory. Revenue columns (and the payments dataset) need `reports.revenue`;
 * players are public profiles only with blocks honoured, and carry no contact data.
 */

export type ExportDataset = 'bookings' | 'payments' | 'players';
const DATASETS: ExportDataset[] = ['bookings', 'payments', 'players'];
const PAGE = 500;

async function write(res: Response, chunk: string): Promise<void> {
  if (!res.write(chunk)) await new Promise<void>((resolve) => res.once('drain', resolve));
}

function personName(u: { firstName: string | null; lastName: string | null } | null | undefined): string | null {
  if (!u) return null;
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || null;
}

/* --- bookings -------------------------------------------------------------------------------- */

const EXPORT_GAME_SELECT = {
  id: true,
  name: true,
  entityType: true,
  status: true,
  startTime: true,
  endTime: true,
  courtId: true,
  court: { select: { name: true, clubId: true } },
  gameCourts: { orderBy: { order: 'asc' }, select: { courtId: true, court: { select: { name: true, clubId: true } } } },
  _count: { select: { participants: { where: { status: ParticipantStatus.PLAYING } } } },
} satisfies Prisma.GameSelect;

type ExportGame = Prisma.GameGetPayload<{ select: typeof EXPORT_GAME_SELECT }>;

const EXPORT_HOLD_SELECT = {
  id: true,
  label: true,
  note: true,
  customerName: true,
  startTime: true,
  endTime: true,
  courtId: true,
  court: { select: { name: true } },
} satisfies Prisma.CourtSlotHoldSelect;

type ExportHold = Prisma.CourtSlotHoldGetPayload<{ select: typeof EXPORT_HOLD_SELECT }>;

type Keyset = { t: Date; id: string } | null;
const after = (k: Keyset) => (k ? { OR: [{ startTime: { gt: k.t } }, { startTime: k.t, id: { gt: k.id } }] } : {});

async function* gamePages(clubId: string, p: ReportPeriodWindow): AsyncGenerator<ExportGame[]> {
  let k: Keyset = null;
  for (;;) {
    const rows: ExportGame[] = await prisma.game.findMany({
      where: {
        AND: [
          gameBelongsToClubWhere(clubId),
          { timeIsSet: true, entityType: { not: 'LEAGUE_SEASON' }, startTime: { gte: p.fromAt, lt: p.toAt } },
          after(k),
        ],
      },
      select: EXPORT_GAME_SELECT,
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      take: PAGE,
    });
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < PAGE) return;
    const last = rows[rows.length - 1];
    k = { t: last.startTime, id: last.id };
  }
}

async function* holdPages(clubId: string, p: ReportPeriodWindow): AsyncGenerator<ExportHold[]> {
  let k: Keyset = null;
  for (;;) {
    const rows: ExportHold[] = await prisma.courtSlotHold.findMany({
      where: { AND: [{ clubId, deletedAt: null, startTime: { gte: p.fromAt, lt: p.toAt } }, after(k)] },
      select: EXPORT_HOLD_SELECT,
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      take: PAGE,
    });
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < PAGE) return;
    const last = rows[rows.length - 1];
    k = { t: last.startTime, id: last.id };
  }
}

/** Flattens paged generators into one item stream. */
async function* items<T>(pages: AsyncGenerator<T[]>): AsyncGenerator<T> {
  for await (const page of pages) yield* page;
}

function gameCourtsHere(g: ExportGame, clubId: string): Array<{ id: string; name: string }> {
  if (g.gameCourts.length) return g.gameCourts.filter((gc) => gc.court.clubId === clubId).map((gc) => ({ id: gc.courtId, name: gc.court.name }));
  return g.courtId && g.court?.clubId === clubId ? [{ id: g.courtId, name: g.court.name }] : [];
}

async function streamBookings(res: Response, ctx: ClubAdminRequestContext, p: ReportPeriodWindow, revenue: boolean): Promise<void> {
  const tz = ctx.timezone;
  const pricing: PricingContext | null = revenue ? await loadPricingContext(ctx.clubId) : null;
  await write(
    res,
    csvRow([
      'date',
      'start',
      'end',
      'kind',
      'court',
      'name',
      'type',
      'status',
      'players',
      'hold_label',
      'customer',
      ...(revenue ? ['currency', 'quote', 'charged', 'paid', 'payment_status'] : []),
    ])
  );

  type Row = { at: Date; id: string; cells: CsvValue[]; key: string; quote: number | null };
  const games = items(gamePages(ctx.clubId, p));
  const holds = items(holdPages(ctx.clubId, p));
  const toGameRow = (g: ExportGame): Row => {
    const courts = gameCourtsHere(g, ctx.clubId);
    return {
      at: g.startTime,
      id: `game:${g.id}`,
      key: `game:${g.id}`,
      quote: pricing ? quoteGameWithContext(pricing, courts.map((c) => c.id), g.startTime, g.endTime) : null,
      cells: [
        clubLocalDate(g.startTime, tz),
        clubLocalTime(g.startTime, tz),
        clubLocalTime(g.endTime, tz),
        'game',
        courts.map((c) => c.name).join(' + ') || null,
        g.name,
        g.entityType,
        g.status,
        g._count.participants,
        null,
        null,
      ],
    };
  };
  const toHoldRow = (h: ExportHold): Row => ({
    at: h.startTime,
    id: `hold:${h.id}`,
    key: `hold:${h.id}`,
    quote:
      pricing && isBillableHoldLabel(h.label, pricing.billableHoldLabels)
        ? quoteWithContext(pricing, h.courtId, h.startTime, h.endTime).amountCents
        : null,
    cells: [
      clubLocalDate(h.startTime, tz),
      clubLocalTime(h.startTime, tz),
      clubLocalTime(h.endTime, tz),
      'hold',
      h.court.name,
      h.note,
      null,
      null,
      null,
      h.label,
      h.customerName,
    ],
  });

  let nextGame = await games.next();
  let nextHold = await holds.next();
  let batch: Row[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    const charges = revenue
      ? await loadLiveChargesFor(
          ctx.clubId,
          batch.map((r) => ({ kind: r.key.startsWith('game:') ? ('game' as const) : ('hold' as const), id: r.key.slice(5) }))
        )
      : null;
    let out = '';
    for (const r of batch) {
      const charge = charges?.get(r.key);
      out += csvRow([
        ...r.cells,
        ...(revenue
          ? [ctx.currency, centsToDecimal(r.quote), centsToDecimal(charge?.amountCents), centsToDecimal(charge ? charge.paidCents : null), charge?.status ?? null]
          : []),
      ]);
    }
    batch = [];
    await write(res, out);
  };
  while (!nextGame.done || !nextHold.done) {
    const takeGame =
      !nextGame.done &&
      (nextHold.done ||
        nextGame.value.startTime < nextHold.value.startTime ||
        (nextGame.value.startTime.getTime() === nextHold.value.startTime.getTime() && `game:${nextGame.value.id}` < `hold:${nextHold.value.id}`));
    if (takeGame && !nextGame.done) {
      batch.push(toGameRow(nextGame.value));
      nextGame = await games.next();
    } else if (!nextHold.done) {
      batch.push(toHoldRow(nextHold.value));
      nextHold = await holds.next();
    }
    if (batch.length >= PAGE) await flush();
  }
  await flush();
}

/* --- payments -------------------------------------------------------------------------------- */

const EXPORT_PAYMENT_INCLUDE = {
  recordedBy: { select: { firstName: true, lastName: true } },
  charge: { select: { description: true, startTime: true, currency: true, court: { select: { name: true } } } },
} satisfies Prisma.ClubPaymentInclude;

type ExportPayment = Prisma.ClubPaymentGetPayload<{ include: typeof EXPORT_PAYMENT_INCLUDE }>;

async function streamPayments(res: Response, ctx: ClubAdminRequestContext, p: ReportPeriodWindow): Promise<void> {
  const tz = ctx.timezone;
  await write(
    res,
    csvRow(['date', 'time', 'amount', 'currency', 'method', 'payer', 'booking_date', 'booking_start', 'court', 'description', 'note', 'recorded_by', 'voided'])
  );
  let k: { t: Date; id: string } | null = null;
  for (;;) {
    const rows: ExportPayment[] = await prisma.clubPayment.findMany({
      where: {
        AND: [
          { clubId: ctx.clubId, paidAt: { gte: p.fromAt, lt: p.toAt } },
          k ? { OR: [{ paidAt: { gt: k.t } }, { paidAt: k.t, id: { gt: k.id } }] } : {},
        ],
      },
      include: EXPORT_PAYMENT_INCLUDE,
      orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
      take: PAGE,
    });
    if (rows.length === 0) return;
    let out = '';
    for (const r of rows) {
      out += csvRow([
        clubLocalDate(r.paidAt, tz),
        clubLocalTime(r.paidAt, tz),
        centsToDecimal(r.amountCents),
        r.charge.currency,
        r.method,
        r.payerName,
        r.charge.startTime ? clubLocalDate(r.charge.startTime, tz) : null,
        r.charge.startTime ? clubLocalTime(r.charge.startTime, tz) : null,
        r.charge.court?.name ?? null,
        r.charge.description,
        r.note,
        personName(r.recordedBy),
        r.voidedAt ? 'yes' : 'no',
      ]);
    }
    await write(res, out);
    if (rows.length < PAGE) return;
    const last = rows[rows.length - 1];
    k = { t: last.paidAt, id: last.id };
  }
}

/* --- players --------------------------------------------------------------------------------- */

async function streamPlayers(res: Response, ctx: ClubAdminRequestContext, viewerId: string, p: ReportPeriodWindow): Promise<void> {
  const tz = ctx.timezone;
  const [rows, blocked] = await Promise.all([
    prisma.$queryRaw<
      Array<{ id: string; firstName: string | null; lastName: string | null; games: number; lastAt: Date; firstEver: Date }>
    >(Prisma.sql`
      WITH cg AS (${clubGamesSql(ctx.clubId, p.fromAt, p.toAt)}),
      per AS (
        SELECT p."userId", COUNT(*)::int AS games, MAX(cg."startTime") AS "lastAt"
        FROM cg JOIN "GameParticipant" p ON p."gameId" = cg.id AND p.status = 'PLAYING'
        GROUP BY p."userId"
      ),
      allg AS (${clubGamesSql(ctx.clubId, new Date(0), p.toAt)}),
      firsts AS (
        SELECT p."userId", MIN(allg."startTime") AS "firstEver"
        FROM allg JOIN "GameParticipant" p ON p."gameId" = allg.id AND p.status = 'PLAYING'
        WHERE p."userId" IN (SELECT "userId" FROM per)
        GROUP BY p."userId"
      )
      SELECT u.id, u."firstName", u."lastName", per.games, per."lastAt", firsts."firstEver"
      FROM per
      JOIN firsts ON firsts."userId" = per."userId"
      JOIN "User" u ON u.id = per."userId"
      WHERE u."isActive" AND u."nameIsSet"
      ORDER BY per.games DESC, u.id ASC`),
    blockedIdsFor(viewerId),
  ]);
  await write(res, csvRow(['first_name', 'last_name', 'games', 'first_game_at_club', 'last_game_in_period', 'new_in_period']));
  let out = '';
  let n = 0;
  for (const r of rows) {
    if (blocked.has(r.id)) continue;
    out += csvRow([
      r.firstName,
      r.lastName,
      r.games,
      clubLocalDate(r.firstEver, tz),
      clubLocalDate(r.lastAt, tz),
      r.firstEver >= p.fromAt ? 'yes' : 'no',
    ]);
    if (++n % PAGE === 0) {
      await write(res, out);
      out = '';
    }
  }
  if (out) await write(res, out);
}

export function parseExportDataset(raw: unknown): ExportDataset {
  if (typeof raw !== 'string' || !DATASETS.includes(raw as ExportDataset)) {
    throw clubAdminValidation('dataset', `must be one of ${DATASETS.join(', ')}`);
  }
  return raw as ExportDataset;
}

/** Validates, then streams. Errors before the first byte go through the normal error handler. */
export async function streamClubReportCsv(
  res: Response,
  ctx: ClubAdminRequestContext,
  viewerId: string,
  query: Record<string, unknown>
): Promise<void> {
  const period = parseReportPeriod(query.from, query.to);
  const dataset = parseExportDataset(query.dataset);
  const revenue = clubAdminCan(ctx.role, 'reports.revenue');
  if (dataset === 'payments' && !revenue) {
    throw clubAdminError(403, 'clubAdmin.capability', 'Your club role cannot reports.revenue', { capability: 'reports.revenue' });
  }
  const p = periodWindow(period, ctx.timezone);
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="club-${dataset}-${period.from}_${period.to}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  await write(res, CSV_BOM);
  try {
    if (dataset === 'bookings') await streamBookings(res, ctx, p, revenue);
    else if (dataset === 'payments') await streamPayments(res, ctx, p);
    else await streamPlayers(res, ctx, viewerId, p);
  } catch (err) {
    // Headers are gone; cut the stream so the client sees a failed download, not a short file.
    console.error('[clubAdmin] report export failed', err);
    res.destroy(err instanceof Error ? err : undefined);
    return;
  }
  res.end();
}
