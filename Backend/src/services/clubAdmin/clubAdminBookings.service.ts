import { ClubIntegrationType, ParticipantRole, ParticipantStatus, Prisma } from '@prisma/client';
import type {
  BookingItem,
  BookingKind,
  BookingScope,
  ChargeStatus,
  ClubAdminPersonRef,
  GameBookingItem,
  HoldBookingItem,
  ExternalBookingItem,
  Paged,
} from '@bandeja/shared/clubAdmin/contract';
import { addDaysToDate, clubDayWindowUtc, clubLocalDate, isClubDate } from '@bandeja/shared/clubAdmin/clubTime';
import prisma from '../../config/database';
import { CourtOccupancyService } from '../game/courtOccupancy.service';
import { clubAdminError, clubAdminValidation, parseIntParam } from './clubAdminErrors';
import { gameBelongsToClubWhere } from './clubAdminGameScope';
import { loadBillingSummaries } from './clubAdminBillingSummary.service';
import { SNAPSHOT_INTEGRATIONS } from './clubAdminSchedule.service';

/**
 * `GET /bookings` — one keyset-paged list over app games ∪ holds ∪ external snapshot slots.
 *
 * Order: `(startTime, id)` ascending for `upcoming`, descending for `past`, where `id` is the
 * item id (`game:<id>`, `hold:<id>`, `external:<courtId>:<start>`). Each DB source returns at most
 * `limit + 1` rows after the cursor; the merge takes the first `limit`, so pages never skip or
 * repeat an item and nothing is loaded wholesale.
 */

const BOOKING_KINDS: BookingKind[] = ['game', 'hold', 'external'];
const CHARGE_STATUSES: ChargeStatus[] = ['UNPAID', 'PARTIAL', 'PAID', 'WAIVED', 'VOID'];
const MAX_RANGE_DAYS = 400;

export interface BookingsParams {
  scope: BookingScope;
  from?: string;
  to?: string;
  courtId?: string;
  kinds: BookingKind[];
  payment?: ChargeStatus | 'NONE';
  q?: string;
  cursor?: BookingsCursor;
  limit: number;
}

export interface BookingsCursor {
  scope: BookingScope;
  t: string;
  id: string;
}

export function encodeBookingsCursor(c: BookingsCursor): string {
  return Buffer.from(JSON.stringify({ s: c.scope, t: c.t, k: c.id }), 'utf8').toString('base64url');
}

export function decodeBookingsCursor(raw: string): BookingsCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { s?: unknown; t?: unknown; k?: unknown };
    if ((parsed.s === 'upcoming' || parsed.s === 'past') && typeof parsed.t === 'string' && typeof parsed.k === 'string') {
      if (!Number.isNaN(new Date(parsed.t).getTime())) return { scope: parsed.s, t: parsed.t, id: parsed.k };
    }
  } catch {
    // fall through
  }
  throw clubAdminValidation('cursor', 'is invalid');
}

function str(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

export function parseBookingsQuery(query: Record<string, unknown>): BookingsParams {
  const scope = str(query.scope) ?? 'upcoming';
  if (scope !== 'upcoming' && scope !== 'past') throw clubAdminValidation('scope', 'must be upcoming or past');
  const from = str(query.from);
  const to = str(query.to);
  if (from !== undefined && !isClubDate(from)) throw clubAdminValidation('from', 'must be yyyy-MM-dd');
  if (to !== undefined && !isClubDate(to)) throw clubAdminValidation('to', 'must be yyyy-MM-dd');
  if (from && to && to < from) throw clubAdminValidation('to', 'must not be before from');
  if (from && to && Number(new Date(to)) - Number(new Date(from)) > MAX_RANGE_DAYS * 86_400_000) {
    throw clubAdminError(400, 'clubAdmin.rangeTooLarge', `Range is limited to ${MAX_RANGE_DAYS} days`);
  }
  const kindsRaw = query.kinds;
  const kindList = (Array.isArray(kindsRaw) ? kindsRaw : typeof kindsRaw === 'string' ? kindsRaw.split(',') : [])
    .map((k) => String(k).trim())
    .filter(Boolean);
  for (const k of kindList) {
    if (!BOOKING_KINDS.includes(k as BookingKind)) throw clubAdminValidation('kinds', `unknown kind ${k}`);
  }
  const payment = str(query.payment);
  if (payment !== undefined && payment !== 'NONE' && !CHARGE_STATUSES.includes(payment as ChargeStatus)) {
    throw clubAdminValidation('payment', 'unknown payment status');
  }
  const cursorRaw = str(query.cursor);
  const cursor = cursorRaw ? decodeBookingsCursor(cursorRaw) : undefined;
  if (cursor && cursor.scope !== scope) throw clubAdminValidation('cursor', 'belongs to another scope');
  const q = str(query.q);
  return {
    scope,
    from,
    to,
    courtId: str(query.courtId),
    kinds: kindList.length ? (kindList as BookingKind[]) : BOOKING_KINDS,
    payment: payment as BookingsParams['payment'],
    q: q ? q.slice(0, 100) : undefined,
    cursor,
    limit: parseIntParam(query.limit, 'limit', { fallback: 30, min: 1, max: 100 }),
  };
}

/** `a` before `b` in the scope's order. */
function compareItems(a: { startTime: string; id: string }, b: { startTime: string; id: string }, desc: boolean): number {
  const ta = new Date(a.startTime).getTime();
  const tb = new Date(b.startTime).getTime();
  const base = ta !== tb ? ta - tb : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return desc ? -base : base;
}

/**
 * Keyset predicate for a DB source whose item ids are `${prefix}${row.id}`: rows strictly after
 * the cursor `(t, k)` in (startTime, itemId) order.
 */
function keysetWhere(prefix: string, cursor: BookingsCursor | undefined, desc: boolean): Prisma.GameWhereInput & Prisma.CourtSlotHoldWhereInput {
  if (!cursor) return {};
  const t = new Date(cursor.t);
  const after = desc ? 'lt' : 'gt';
  let sameInstant: Record<string, unknown> | null;
  if (cursor.id.startsWith(prefix)) {
    sameInstant = { id: { [after]: cursor.id.slice(prefix.length) } };
  } else {
    // Every `${prefix}…` id sorts entirely before or after a cursor id from another kind.
    const prefixAfterCursor = prefix > cursor.id;
    sameInstant = prefixAfterCursor !== desc ? {} : null;
  }
  return {
    OR: [{ startTime: { [after]: t } }, ...(sameInstant ? [{ startTime: t, ...sameInstant }] : [])],
  } as Prisma.GameWhereInput & Prisma.CourtSlotHoldWhereInput;
}

interface TimeBounds {
  now: Date;
  fromAt?: Date;
  toAt?: Date;
}

function timeBounds(params: BookingsParams, timezone: string, now: Date): TimeBounds {
  return {
    now,
    fromAt: params.from ? clubDayWindowUtc(params.from, timezone).start : undefined,
    toAt: params.to ? clubDayWindowUtc(params.to, timezone).end : undefined,
  };
}

function timeWhere(scope: BookingScope, b: TimeBounds) {
  return {
    ...(scope === 'upcoming' ? { endTime: { gt: b.now } } : { endTime: { lte: b.now } }),
    ...(b.fromAt || b.toAt ? { startTime: { ...(b.fromAt ? { gte: b.fromAt } : {}), ...(b.toAt ? { lt: b.toAt } : {}) } } : {}),
  };
}

function personRef(user: { id: string; firstName: string | null; lastName: string | null; avatar: string | null } | undefined): ClubAdminPersonRef {
  return user
    ? { id: user.id, firstName: user.firstName, lastName: user.lastName, avatar: user.avatar }
    : { id: '', firstName: null, lastName: null, avatar: null };
}

const GAME_BOOKING_INCLUDE = {
  court: { select: { id: true, name: true, clubId: true } },
  gameCourts: { orderBy: { order: 'asc' }, select: { courtId: true, court: { select: { name: true, clubId: true } } } },
  participants: {
    where: { role: { in: [ParticipantRole.OWNER, ParticipantRole.ADMIN] } },
    take: 1,
    orderBy: { role: 'asc' },
    select: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
  },
  _count: { select: { participants: { where: { status: ParticipantStatus.PLAYING } } } },
} satisfies Prisma.GameInclude;

type GameBookingRow = Prisma.GameGetPayload<{ include: typeof GAME_BOOKING_INCLUDE }>;

export function gameRowToBookingItem(game: GameBookingRow, clubId: string, preferCourtId?: string): GameBookingItem {
  const clubSlots = game.gameCourts.filter((gc) => gc.court.clubId === clubId);
  const preferred = preferCourtId ? clubSlots.find((gc) => gc.courtId === preferCourtId) : undefined;
  let courtId: string | null = null;
  let courtName: string | null = null;
  if (preferred) {
    courtId = preferred.courtId;
    courtName = preferred.court.name;
  } else if (game.court && game.court.clubId === clubId) {
    courtId = game.court.id;
    courtName = game.court.name;
  } else if (clubSlots[0]) {
    courtId = clubSlots[0].courtId;
    courtName = clubSlots[0].court.name;
  }
  return {
    id: `game:${game.id}`,
    kind: 'game',
    gameId: game.id,
    courtId,
    courtName,
    startTime: game.startTime.toISOString(),
    endTime: game.endTime.toISOString(),
    billing: null,
    name: game.name,
    status: game.status,
    entityType: game.entityType,
    hasBookedCourt: game.hasBookedCourt,
    host: personRef(game.participants[0]?.user),
    participantCount: game._count.participants,
    maxParticipants: game.maxParticipants,
  };
}

const HOLD_BOOKING_INCLUDE = { court: { select: { name: true } } } satisfies Prisma.CourtSlotHoldInclude;
type HoldBookingRow = Prisma.CourtSlotHoldGetPayload<{ include: typeof HOLD_BOOKING_INCLUDE }>;

export function holdRowToBookingItem(hold: HoldBookingRow): HoldBookingItem {
  return {
    id: `hold:${hold.id}`,
    kind: 'hold',
    holdId: hold.id,
    seriesId: hold.seriesId,
    courtId: hold.courtId,
    courtName: hold.court.name,
    startTime: hold.startTime.toISOString(),
    endTime: hold.endTime.toISOString(),
    billing: null,
    label: hold.label,
    note: hold.note,
    customerName: hold.customerName,
    customerPhone: hold.customerPhone,
  };
}

function paymentWhere(clubId: string, payment: BookingsParams['payment']) {
  if (!payment) return undefined;
  if (payment === 'NONE') return { none: { clubId, status: { not: 'VOID' as const } } };
  return { some: { clubId, status: payment } };
}

async function queryGames(clubId: string, p: BookingsParams, b: TimeBounds, desc: boolean, take: number) {
  const charges = paymentWhere(clubId, p.payment);
  const where: Prisma.GameWhereInput = {
    AND: [
      gameBelongsToClubWhere(clubId),
      { timeIsSet: true },
      timeWhere(p.scope, b),
      ...(p.courtId ? [{ OR: [{ courtId: p.courtId }, { gameCourts: { some: { courtId: p.courtId } } }] }] : []),
      ...(charges ? [{ clubCharges: charges }] : []),
      ...(p.q
        ? [
            {
              OR: [
                { name: { contains: p.q, mode: 'insensitive' as const } },
                {
                  participants: {
                    some: {
                      role: ParticipantRole.OWNER,
                      user: {
                        OR: [
                          { firstName: { contains: p.q, mode: 'insensitive' as const } },
                          { lastName: { contains: p.q, mode: 'insensitive' as const } },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          ]
        : []),
      keysetWhere('game:', p.cursor, desc),
    ],
  };
  const dir = desc ? 'desc' : 'asc';
  return prisma.game.findMany({ where, include: GAME_BOOKING_INCLUDE, orderBy: [{ startTime: dir }, { id: dir }], take });
}

async function queryHolds(clubId: string, p: BookingsParams, b: TimeBounds, desc: boolean, take: number) {
  const charges = paymentWhere(clubId, p.payment);
  const where: Prisma.CourtSlotHoldWhereInput = {
    AND: [
      { clubId, deletedAt: null },
      timeWhere(p.scope, b),
      ...(p.courtId ? [{ courtId: p.courtId }] : []),
      ...(charges ? [{ charges }] : []),
      ...(p.q
        ? [
            {
              OR: [
                { customerName: { contains: p.q, mode: 'insensitive' as const } },
                { customerPhone: { contains: p.q } },
                { note: { contains: p.q, mode: 'insensitive' as const } },
              ],
            },
          ]
        : []),
      keysetWhere('hold:', p.cursor, desc),
    ],
  };
  const dir = desc ? 'desc' : 'asc';
  return prisma.courtSlotHold.findMany({ where, include: HOLD_BOOKING_INCLUDE, orderBy: [{ startTime: dir }, { id: dir }], take });
}

/** Snapshot rows exist only for days somebody looked at; load exactly those dates. */
async function snapshotDates(clubId: string, integrationType: ClubIntegrationType, fromDate: string, toDate: string): Promise<string[]> {
  const where = { clubId, date: { gte: fromDate, lte: toDate } };
  const args = { where, distinct: ['date' as const], select: { date: true }, orderBy: { date: 'asc' as const } };
  const rows =
    integrationType === ClubIntegrationType.PADELOO
      ? await prisma.clubPadelooBusySnapshot.findMany(args)
      : integrationType === ClubIntegrationType.KLIKTEREN
        ? await prisma.clubKlikterenBusySnapshot.findMany(args)
        : await prisma.clubBooktimeBusySnapshot.findMany(args);
  return rows.map((r) => r.date);
}

async function queryExternals(
  clubId: string,
  integrationType: ClubIntegrationType,
  timezone: string,
  p: BookingsParams,
  b: TimeBounds,
  desc: boolean
): Promise<ExternalBookingItem[]> {
  const todayLocal = clubLocalDate(b.now, timezone);
  const cursorDate = p.cursor ? clubLocalDate(new Date(p.cursor.t), timezone) : undefined;
  let fromDate = p.from ?? (p.scope === 'upcoming' ? addDaysToDate(todayLocal, -1) : addDaysToDate(todayLocal, -MAX_RANGE_DAYS));
  let toDate = p.to ?? (p.scope === 'upcoming' ? addDaysToDate(todayLocal, MAX_RANGE_DAYS) : addDaysToDate(todayLocal, 1));
  if (cursorDate && !desc && cursorDate > fromDate) fromDate = addDaysToDate(cursorDate, -1);
  if (cursorDate && desc && cursorDate < toDate) toDate = addDaysToDate(cursorDate, 1);
  if (toDate < fromDate) return [];
  const dates = await snapshotDates(clubId, integrationType, fromDate, toDate);
  if (dates.length === 0) return [];

  const rangeStart = clubDayWindowUtc(dates[0], timezone).start;
  const rangeEnd = clubDayWindowUtc(dates[dates.length - 1], timezone).end;
  const [occupancy, linked] = await Promise.all([
    CourtOccupancyService.getOccupancy({
      clubId,
      rangeStart,
      rangeEnd,
      courtId: p.courtId,
      includeUnmapped: false,
      sources: { games: false, holds: false, externals: true },
    }),
    // A provider booking linked to an app game is that game's booking, not a separate row.
    prisma.gameExternalBooking.findMany({
      where: { court: { clubId }, bookingStart: { lt: rangeEnd }, bookingEnd: { gt: rangeStart } },
      select: { courtId: true, bookingStart: true, bookingEnd: true },
    }),
  ]);

  const items: ExternalBookingItem[] = [];
  const seen = new Set<string>();
  for (const block of occupancy.blocks) {
    if (block.kind !== 'external' || !block.courtId) continue;
    const start = new Date(block.startTime);
    const end = new Date(block.endTime);
    if (p.scope === 'upcoming' ? end <= b.now : end > b.now) continue;
    if ((b.fromAt && start < b.fromAt) || (b.toAt && start >= b.toAt)) continue;
    if (linked.some((l) => l.courtId === block.courtId && l.bookingStart && l.bookingEnd && l.bookingStart < end && l.bookingEnd > start)) {
      continue;
    }
    const id = `external:${block.courtId}:${start.toISOString()}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      kind: 'external',
      provider: integrationType,
      courtId: block.courtId,
      courtName: block.courtName,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      billing: null,
    });
  }
  const cursor = p.cursor;
  return cursor ? items.filter((i) => compareItems(i, { startTime: cursor.t, id: cursor.id }, desc) > 0) : items;
}

export async function listBookings(
  ctx: { clubId: string; timezone: string; currency: string; integrationType: string | null },
  params: BookingsParams,
  now: Date = new Date()
): Promise<Paged<BookingItem>> {
  const desc = params.scope === 'past';
  const bounds = timeBounds(params, ctx.timezone, now);
  const take = params.limit + 1;
  const integrationType = ctx.integrationType as ClubIntegrationType | null;
  const wantExternals =
    params.kinds.includes('external') &&
    !params.q &&
    (params.payment === undefined || params.payment === 'NONE') &&
    integrationType != null &&
    SNAPSHOT_INTEGRATIONS.has(integrationType);

  const [games, holds, externals] = await Promise.all([
    params.kinds.includes('game') ? queryGames(ctx.clubId, params, bounds, desc, take) : Promise.resolve([]),
    params.kinds.includes('hold') ? queryHolds(ctx.clubId, params, bounds, desc, take) : Promise.resolve([]),
    wantExternals ? queryExternals(ctx.clubId, integrationType!, ctx.timezone, params, bounds, desc) : Promise.resolve([]),
  ]);

  const merged: BookingItem[] = [
    ...games.map((g) => gameRowToBookingItem(g, ctx.clubId, params.courtId)),
    ...holds.map(holdRowToBookingItem),
    ...externals,
  ].sort((a, b) => compareItems(a, b, desc));
  const page = merged.slice(0, params.limit);
  const last = page[page.length - 1];
  const nextCursor =
    merged.length > params.limit && last ? encodeBookingsCursor({ scope: params.scope, t: last.startTime, id: last.id }) : null;

  await attachBilling(ctx.clubId, ctx.currency, page);
  return { items: page, nextCursor };
}

/** Fills `billing` on game and hold items in place. */
export async function attachBilling(clubId: string, currency: string, items: BookingItem[]): Promise<void> {
  const summaries = await loadBillingSummaries(clubId, currency, {
    games: items
      .filter((i): i is GameBookingItem => i.kind === 'game')
      .map((i) => ({ gameId: i.gameId, courtId: i.courtId, startTime: new Date(i.startTime), endTime: new Date(i.endTime) })),
    holds: items
      .filter((i): i is HoldBookingItem => i.kind === 'hold')
      .map((i) => ({ holdId: i.holdId, courtId: i.courtId, startTime: new Date(i.startTime), endTime: new Date(i.endTime) })),
  });
  for (const item of items) {
    if (item.kind === 'game') item.billing = summaries.game.get(item.gameId) ?? null;
    else if (item.kind === 'hold') item.billing = summaries.hold.get(item.holdId) ?? null;
  }
}
