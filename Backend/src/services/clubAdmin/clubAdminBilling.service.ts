import { ClubPaymentMethod, Prisma } from '@prisma/client';
import type {
  AttentionItem,
  ChargeSource,
  ChargeStatus,
  ClubAdminPersonRef,
  ClubCharge,
  ClubPayment,
  PaymentLedgerItem,
  PaymentLedgerResponse,
} from '@bandeja/shared/clubAdmin/contract';
import { clubDayWindowUtc, isClubDate } from '@bandeja/shared/clubAdmin/clubTime';
import prisma from '../../config/database';
import type { ClubAdminRequestContext } from '../../middleware/clubAdminContext';
import { clubAdminError, clubAdminNotFound, clubAdminValidation, parseIntParam } from './clubAdminErrors';
import { logClubActivity } from './clubAdminActivity.service';
import { gameBelongsToClubWhere } from './clubAdminGameScope';
import { parseInstant, parseOptionalText } from './clubAdminHold.service';
import { chargeBalanceCents, deriveChargeStatus } from './clubAdminBillingMath';
import { setBookingQuoteProvider, type BookingQuote, type BookingQuoteRequest } from './clubAdminBillingSummary.service';
import { setDashboardBillingProvider, type DashboardBillingExtras } from './clubAdminDashboard.service';
import { loadGameCourtTime, loadHoldRows } from './clubAdminBookingRows';
import {
  gameCourtsAtClub,
  isBillableHoldLabel,
  loadPricingContext,
  quoteGameWithContext,
  quoteWithContext,
  type PricingContext,
} from './clubAdminPricing.service';
import { invalidateClubReports } from './clubAdminReportsCache';

/**
 * Club console billing (docs/domains/club-admin.md "Billing"): charges against bookings, payments
 * against charges, the payments ledger, and the billing halves of schedule/bookings/dashboard.
 * Money is integer cents in the club currency. Every money mutation runs in a transaction that
 * row-locks the charge, and writes a `ClubActivity` row after commit.
 */

const MAX_AMOUNT_CENTS = 100_000_000;
const PAYMENT_METHODS = Object.values(ClubPaymentMethod) as string[];
const UNPAID_PAST_DAYS = 30;
/** Clock skew allowed for `paidAt` ("not in the future"). */
const PAID_AT_SKEW_MS = 5 * 60_000;
const LEDGER_MAX_RANGE_DAYS = 400;

export interface BillingCtx {
  clubId: string;
  timezone: string;
  currency: string;
}

const USER_REF_SELECT = { id: true, firstName: true, lastName: true, avatar: true } as const;

function personRef(u: { id: string; firstName: string | null; lastName: string | null; avatar: string | null } | null): ClubAdminPersonRef {
  return u ? { id: u.id, firstName: u.firstName, lastName: u.lastName, avatar: u.avatar } : { id: '', firstName: null, lastName: null, avatar: null };
}

const CHARGE_INCLUDE = {
  court: { select: { name: true } },
  createdBy: { select: USER_REF_SELECT },
  payments: {
    orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
    include: { recordedBy: { select: USER_REF_SELECT } },
  },
} satisfies Prisma.ClubChargeInclude;

type ChargeRow = Prisma.ClubChargeGetPayload<{ include: typeof CHARGE_INCLUDE }>;
type PaymentRow = ChargeRow['payments'][number];

function paymentToContract(p: PaymentRow): ClubPayment {
  return {
    id: p.id,
    amountCents: p.amountCents,
    method: p.method,
    paidAt: p.paidAt.toISOString(),
    payerName: p.payerName,
    payerUserId: p.payerUserId,
    note: p.note,
    recordedBy: personRef(p.recordedBy),
    voidedAt: p.voidedAt ? p.voidedAt.toISOString() : null,
  };
}

function chargeSource(c: Pick<ChargeRow, 'sourceKind' | 'gameId' | 'holdId' | 'courtId' | 'startTime' | 'endTime'>): ChargeSource {
  if (c.sourceKind === 'GAME' && c.gameId) return { kind: 'game', gameId: c.gameId };
  if (c.sourceKind === 'HOLD' && c.holdId) return { kind: 'hold', holdId: c.holdId };
  // Manual, or a booking that no longer exists (cancelled game: the FK is set null).
  return {
    kind: 'manual',
    courtId: c.courtId,
    startTime: c.startTime ? c.startTime.toISOString() : null,
    endTime: c.endTime ? c.endTime.toISOString() : null,
  };
}

export function chargeToContract(c: ChargeRow): ClubCharge {
  return {
    id: c.id,
    source: chargeSource(c),
    courtId: c.courtId,
    courtName: c.court?.name ?? null,
    startTime: c.startTime ? c.startTime.toISOString() : null,
    endTime: c.endTime ? c.endTime.toISOString() : null,
    description: c.description,
    amountCents: c.amountCents,
    paidCents: livePaid(c.payments),
    currency: c.currency,
    status: c.status,
    payments: c.payments.map(paymentToContract),
    createdAt: c.createdAt.toISOString(),
    createdBy: personRef(c.createdBy),
  };
}

function livePaid(payments: Array<{ amountCents: number; voidedAt: Date | null }>): number {
  return payments.reduce((sum, p) => (p.voidedAt ? sum : sum + p.amountCents), 0);
}

export async function getCharge(clubId: string, chargeId: string): Promise<ClubCharge> {
  const charge = await prisma.clubCharge.findFirst({ where: { id: chargeId, clubId }, include: CHARGE_INCLUDE });
  if (!charge) throw clubAdminNotFound('Charge');
  return chargeToContract(charge);
}

function parseAmount(raw: unknown, field: string, opts: { min: number }): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < opts.min || raw > MAX_AMOUNT_CENTS) {
    throw clubAdminValidation(field, opts.min > 0 ? 'must be a positive integer (cents)' : 'must be a non-negative integer (cents)');
  }
  return raw;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

const chargeExists = () => clubAdminError(409, 'clubAdmin.chargeExists', 'This booking already has a charge');

interface ResolvedSource {
  kind: 'GAME' | 'HOLD' | 'MANUAL';
  gameId: string | null;
  holdId: string | null;
  courtId: string | null;
  startTime: Date | null;
  endTime: Date | null;
  quoteCents: number | null;
  /** For activity meta. */
  courtName: string | null;
}

async function resolveSource(ctx: BillingCtx, raw: unknown, pricing: PricingContext): Promise<ResolvedSource> {
  if (!raw || typeof raw !== 'object') throw clubAdminValidation('source', 'is required');
  const src = raw as Record<string, unknown>;
  const courtName = async (courtId: string | null) =>
    courtId ? ((await prisma.court.findUnique({ where: { id: courtId }, select: { name: true } }))?.name ?? null) : null;

  if (src.kind === 'game') {
    if (typeof src.gameId !== 'string' || !src.gameId) throw clubAdminValidation('source.gameId', 'is required');
    const game = await prisma.game.findFirst({
      where: { AND: [{ id: src.gameId }, gameBelongsToClubWhere(ctx.clubId)] },
      select: { id: true, startTime: true, endTime: true, timeIsSet: true },
    });
    if (!game) throw clubAdminNotFound('Game');
    const courtIds = (await gameCourtsAtClub(ctx.clubId, [game.id])).get(game.id) ?? [];
    const courtId = courtIds[0] ?? null;
    return {
      kind: 'GAME',
      gameId: game.id,
      holdId: null,
      courtId,
      startTime: game.timeIsSet ? game.startTime : null,
      endTime: game.timeIsSet ? game.endTime : null,
      quoteCents: game.timeIsSet ? quoteGameWithContext(pricing, courtIds, game.startTime, game.endTime) : null,
      courtName: await courtName(courtId),
    };
  }
  if (src.kind === 'hold') {
    if (typeof src.holdId !== 'string' || !src.holdId) throw clubAdminValidation('source.holdId', 'is required');
    const hold = await prisma.courtSlotHold.findFirst({
      where: { id: src.holdId, clubId: ctx.clubId, deletedAt: null },
      select: { id: true, courtId: true, label: true, startTime: true, endTime: true, court: { select: { name: true } } },
    });
    if (!hold) throw clubAdminNotFound('Hold');
    if (hold.label === 'MAINTENANCE') throw clubAdminValidation('source.holdId', 'maintenance holds are never billable');
    const billable = isBillableHoldLabel(hold.label, pricing.billableHoldLabels);
    return {
      kind: 'HOLD',
      gameId: null,
      holdId: hold.id,
      courtId: hold.courtId,
      startTime: hold.startTime,
      endTime: hold.endTime,
      quoteCents: billable ? quoteWithContext(pricing, hold.courtId, hold.startTime, hold.endTime).amountCents : null,
      courtName: hold.court.name,
    };
  }
  if (src.kind === 'manual') {
    const courtId = src.courtId == null || src.courtId === '' ? null : src.courtId;
    if (courtId !== null && (typeof courtId !== 'string' || !pricing.courtPriceCents.has(courtId))) {
      throw clubAdminValidation('source.courtId', 'is not a court of this club');
    }
    const hasStart = src.startTime != null && src.startTime !== '';
    const hasEnd = src.endTime != null && src.endTime !== '';
    if (hasStart !== hasEnd) throw clubAdminValidation('source.endTime', 'startTime and endTime go together');
    const startTime = hasStart ? parseInstant(src.startTime, 'source.startTime') : null;
    const endTime = hasEnd ? parseInstant(src.endTime, 'source.endTime') : null;
    if (startTime && endTime && endTime <= startTime) throw clubAdminValidation('source.endTime', 'must be after startTime');
    return {
      kind: 'MANUAL',
      gameId: null,
      holdId: null,
      courtId: courtId as string | null,
      startTime,
      endTime,
      quoteCents:
        courtId && startTime && endTime ? quoteWithContext(pricing, courtId as string, startTime, endTime).amountCents : null,
      courtName: await courtName(courtId as string | null),
    };
  }
  throw clubAdminValidation('source.kind', 'must be game, hold or manual');
}

/** `POST /charges`. Amount defaults to the quote; one live charge per game (at this club) / hold. */
export async function createCharge(ctx: BillingCtx, actorId: string, raw: unknown): Promise<ClubCharge> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pricing = await loadPricingContext(ctx.clubId);
  const source = await resolveSource(ctx, body.source, pricing);
  const amountCents =
    body.amountCents === undefined || body.amountCents === null
      ? source.quoteCents
      : parseAmount(body.amountCents, 'amountCents', { min: 0 });
  if (amountCents == null) throw clubAdminValidation('amountCents', 'no price is configured for this booking; send amountCents');
  const description = parseOptionalText(body.description, 'description', 200) ?? null;

  let id: string;
  try {
    id = await prisma.$transaction(async (tx) => {
      // The partial unique indexes are the real guard; this gives the friendly error first.
      if (source.gameId || source.holdId) {
        const live = await tx.clubCharge.findFirst({
          where: {
            clubId: ctx.clubId,
            status: { not: 'VOID' },
            ...(source.gameId ? { gameId: source.gameId } : { holdId: source.holdId }),
          },
          select: { id: true },
        });
        if (live) throw chargeExists();
      }
      const row = await tx.clubCharge.create({
        data: {
          clubId: ctx.clubId,
          sourceKind: source.kind,
          gameId: source.gameId,
          holdId: source.holdId,
          courtId: source.courtId,
          startTime: source.startTime,
          endTime: source.endTime,
          description,
          amountCents,
          currency: pricing.currency,
          status: deriveChargeStatus('UNPAID', amountCents, 0),
          createdById: actorId,
        },
        select: { id: true },
      });
      return row.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw chargeExists();
    throw err;
  }
  await logClubActivity(ctx.clubId, actorId, 'CHARGE_CREATED', {
    chargeId: id,
    kind: source.kind,
    court: source.courtName,
    startTime: source.startTime ? source.startTime.toISOString() : null,
    amountCents,
    currency: pricing.currency,
  });
  await invalidateClubReports(ctx.clubId);
  return getCharge(ctx.clubId, id);
}

/** Row-locks the charge for the rest of the transaction and returns it with its payments. */
async function lockCharge(tx: Prisma.TransactionClient, clubId: string, chargeId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "ClubCharge" WHERE id = ${chargeId} AND "clubId" = ${clubId} FOR UPDATE`);
  const charge = await tx.clubCharge.findFirst({
    where: { id: chargeId, clubId },
    include: { payments: { select: { id: true, amountCents: true, voidedAt: true } } },
  });
  if (!charge) throw clubAdminNotFound('Charge');
  return charge;
}

/** `PATCH /charges/:id` — amount/description, or WAIVED / VOID. */
export async function patchCharge(ctx: BillingCtx, actorId: string, chargeId: string, raw: unknown): Promise<ClubCharge> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const amount = body.amountCents === undefined ? undefined : parseAmount(body.amountCents, 'amountCents', { min: 0 });
  const description = parseOptionalText(body.description, 'description', 200);
  const status = body.status;
  if (status !== undefined && status !== 'WAIVED' && status !== 'VOID') throw clubAdminValidation('status', 'must be WAIVED or VOID');

  const result = await prisma.$transaction(async (tx) => {
    const charge = await lockCharge(tx, ctx.clubId, chargeId);
    if (charge.status === 'VOID') throw clubAdminError(409, 'clubAdmin.chargeVoid', 'The charge is void');
    const paid = livePaid(charge.payments);
    const nextAmount = amount ?? charge.amountCents;
    if (nextAmount < paid) throw clubAdminValidation('amountCents', 'cannot be below the amount already paid');
    if (status === 'VOID' && paid > 0) {
      throw clubAdminError(409, 'clubAdmin.chargeVoid', 'Void the payments before voiding the charge', { paidCents: paid });
    }
    const nextStatus: ChargeStatus = status ?? deriveChargeStatus(charge.status, nextAmount, paid);
    await tx.clubCharge.update({
      where: { id: charge.id },
      data: {
        amountCents: nextAmount,
        status: nextStatus,
        ...(description !== undefined ? { description } : {}),
      },
    });
    return { from: charge.amountCents, to: nextAmount, status: nextStatus, previous: charge.status };
  });
  await logClubActivity(ctx.clubId, actorId, 'CHARGE_UPDATED', {
    chargeId,
    amountCents: result.to,
    previousAmountCents: result.from,
    status: result.status,
    previousStatus: result.previous,
  });
  await invalidateClubReports(ctx.clubId);
  return getCharge(ctx.clubId, chargeId);
}

/** `POST /charges/:id/payments`. */
export async function recordPayment(ctx: BillingCtx, actorId: string, chargeId: string, raw: unknown): Promise<ClubCharge> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const amountCents = parseAmount(body.amountCents, 'amountCents', { min: 1 });
  if (typeof body.method !== 'string' || !PAYMENT_METHODS.includes(body.method)) {
    throw clubAdminValidation('method', `must be one of ${PAYMENT_METHODS.join(', ')}`);
  }
  const method = body.method as ClubPaymentMethod;
  const now = new Date();
  const paidAt = body.paidAt === undefined || body.paidAt === null ? now : parseInstant(body.paidAt, 'paidAt');
  if (paidAt.getTime() > now.getTime() + PAID_AT_SKEW_MS) throw clubAdminValidation('paidAt', 'cannot be in the future');
  if (paidAt.getUTCFullYear() < 2000) throw clubAdminValidation('paidAt', 'is too far in the past');
  const payerName = parseOptionalText(body.payerName, 'payerName', 100) ?? null;
  const note = parseOptionalText(body.note, 'note', 500) ?? null;
  let payerUserId: string | null = null;
  if (body.payerUserId != null && body.payerUserId !== '') {
    if (typeof body.payerUserId !== 'string') throw clubAdminValidation('payerUserId', 'must be a user id');
    const payer = await prisma.user.findUnique({ where: { id: body.payerUserId }, select: { id: true } });
    if (!payer) throw clubAdminValidation('payerUserId', 'unknown user');
    payerUserId = payer.id;
  }

  const result = await prisma.$transaction(async (tx) => {
    const charge = await lockCharge(tx, ctx.clubId, chargeId);
    if (charge.status === 'VOID') throw clubAdminError(409, 'clubAdmin.chargeVoid', 'The charge is void');
    const paid = livePaid(charge.payments);
    const balance = chargeBalanceCents(charge.status, charge.amountCents, paid);
    if (amountCents > balance) {
      throw clubAdminError(409, 'clubAdmin.paymentExceedsBalance', 'Payment exceeds the balance', { balanceCents: balance });
    }
    const payment = await tx.clubPayment.create({
      data: { chargeId: charge.id, clubId: ctx.clubId, amountCents, method, paidAt, payerName, payerUserId, note, recordedById: actorId },
      select: { id: true },
    });
    const status = deriveChargeStatus(charge.status, charge.amountCents, paid + amountCents);
    if (status !== charge.status) await tx.clubCharge.update({ where: { id: charge.id }, data: { status } });
    return { paymentId: payment.id, status };
  });
  await logClubActivity(ctx.clubId, actorId, 'PAYMENT_RECORDED', {
    chargeId,
    paymentId: result.paymentId,
    amountCents,
    method,
    status: result.status,
  });
  await invalidateClubReports(ctx.clubId);
  return getCharge(ctx.clubId, chargeId);
}

/** `DELETE /charges/:id/payments/:paymentId` — voids (keeps the row). Idempotent. */
export async function voidPayment(ctx: BillingCtx, actorId: string, chargeId: string, paymentId: string): Promise<ClubCharge> {
  const result = await prisma.$transaction(async (tx) => {
    const charge = await lockCharge(tx, ctx.clubId, chargeId);
    const payment = charge.payments.find((p) => p.id === paymentId);
    if (!payment) throw clubAdminNotFound('Payment');
    if (payment.voidedAt) return null;
    await tx.clubPayment.update({ where: { id: payment.id }, data: { voidedAt: new Date(), voidedById: actorId } });
    const paid = livePaid(charge.payments) - payment.amountCents;
    const status = deriveChargeStatus(charge.status, charge.amountCents, paid);
    if (status !== charge.status) await tx.clubCharge.update({ where: { id: charge.id }, data: { status } });
    return { amountCents: payment.amountCents, status };
  });
  if (result) {
    await logClubActivity(ctx.clubId, actorId, 'PAYMENT_VOIDED', {
      chargeId,
      paymentId,
      amountCents: result.amountCents,
      status: result.status,
    });
    await invalidateClubReports(ctx.clubId);
  }
  return getCharge(ctx.clubId, chargeId);
}

/* ---------------------------------------------------------------------------------------------
 * Payments ledger — GET /payments?from&to&method&cursor&limit
 * ------------------------------------------------------------------------------------------- */

interface LedgerCursor {
  t: string;
  id: string;
}

function encodeLedgerCursor(c: LedgerCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

function decodeLedgerCursor(raw: string): LedgerCursor {
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<LedgerCursor>;
    if (typeof c.t === 'string' && typeof c.id === 'string' && !Number.isNaN(new Date(c.t).getTime())) return { t: c.t, id: c.id };
  } catch {
    // fall through
  }
  throw clubAdminValidation('cursor', 'is invalid');
}

export async function listPayments(ctx: BillingCtx, query: Record<string, unknown>): Promise<PaymentLedgerResponse> {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const from = str(query.from);
  const to = str(query.to);
  if (from !== undefined && !isClubDate(from)) throw clubAdminValidation('from', 'must be yyyy-MM-dd');
  if (to !== undefined && !isClubDate(to)) throw clubAdminValidation('to', 'must be yyyy-MM-dd');
  if (from && to && to < from) throw clubAdminValidation('to', 'must not be before from');
  if (from && to && Date.parse(to) - Date.parse(from) > LEDGER_MAX_RANGE_DAYS * 86_400_000) {
    throw clubAdminError(400, 'clubAdmin.rangeTooLarge', `Range is limited to ${LEDGER_MAX_RANGE_DAYS} days`);
  }
  const method = str(query.method);
  if (method !== undefined && !PAYMENT_METHODS.includes(method)) throw clubAdminValidation('method', 'unknown payment method');
  const limit = parseIntParam(query.limit, 'limit', { fallback: 50, min: 1, max: 100 });
  const cursorRaw = str(query.cursor);
  const cursor = cursorRaw ? decodeLedgerCursor(cursorRaw) : undefined;

  const paidAt: Prisma.DateTimeFilter = {
    ...(from ? { gte: clubDayWindowUtc(from, ctx.timezone).start } : {}),
    ...(to ? { lt: clubDayWindowUtc(to, ctx.timezone).end } : {}),
  };
  const base: Prisma.ClubPaymentWhereInput = {
    clubId: ctx.clubId,
    ...(from || to ? { paidAt } : {}),
    ...(method ? { method: method as ClubPaymentMethod } : {}),
  };
  const keyset: Prisma.ClubPaymentWhereInput = cursor
    ? { OR: [{ paidAt: { lt: new Date(cursor.t) } }, { paidAt: new Date(cursor.t), id: { lt: cursor.id } }] }
    : {};

  const [rows, totals] = await Promise.all([
    prisma.clubPayment.findMany({
      where: { AND: [base, keyset] },
      include: {
        recordedBy: { select: USER_REF_SELECT },
        charge: { select: { description: true, startTime: true, court: { select: { name: true } } } },
      },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    }),
    prisma.clubPayment.groupBy({
      by: ['method'],
      where: { ...base, voidedAt: null },
      _sum: { amountCents: true },
    }),
  ]);
  const page = rows.slice(0, limit);
  const items: PaymentLedgerItem[] = page.map((p) => ({
    ...paymentToContract(p),
    chargeId: p.chargeId,
    chargeDescription: p.charge.description,
    courtName: p.charge.court?.name ?? null,
    bookingStartTime: p.charge.startTime ? p.charge.startTime.toISOString() : null,
  }));
  const byMethod: PaymentLedgerResponse['totals']['byMethod'] = {};
  let collectedCents = 0;
  for (const t of totals) {
    const sum = t._sum.amountCents ?? 0;
    byMethod[t.method] = sum;
    collectedCents += sum;
  }
  const last = page[page.length - 1];
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeLedgerCursor({ t: last.paidAt.toISOString(), id: last.id }) : null,
    totals: { collectedCents, byMethod, currency: ctx.currency },
  };
}

/* ---------------------------------------------------------------------------------------------
 * Providers for schedule / bookings (quotes) and the dashboard (KPIs, unpaid_past)
 * ------------------------------------------------------------------------------------------- */

/** Quotes for schedule/bookings items. Five small queries per call, whatever the page size. */
export async function quoteBookingRequests(clubId: string, requests: BookingQuoteRequest[]): Promise<Map<string, BookingQuote>> {
  const out = new Map<string, BookingQuote>();
  if (requests.length === 0) return out;
  const gameIds = requests.flatMap((r) => (r.key.startsWith('game:') ? [r.key.slice(5)] : []));
  const holdIds = requests.flatMap((r) => (r.key.startsWith('hold:') ? [r.key.slice(5)] : []));
  const [pricing, gameCourts, holds] = await Promise.all([
    loadPricingContext(clubId),
    gameCourtsAtClub(clubId, gameIds),
    holdIds.length
      ? prisma.courtSlotHold.findMany({ where: { id: { in: holdIds }, clubId }, select: { id: true, label: true } })
      : Promise.resolve([]),
  ]);
  const holdLabel = new Map(holds.map((h) => [h.id, h.label as string]));
  for (const r of requests) {
    if (r.key.startsWith('game:')) {
      const courtIds = gameCourts.get(r.key.slice(5)) ?? (r.courtId ? [r.courtId] : []);
      out.set(r.key, { quoteCents: quoteGameWithContext(pricing, courtIds, r.startTime, r.endTime), billable: true });
    } else if (r.key.startsWith('hold:')) {
      const label = holdLabel.get(r.key.slice(5));
      const billable = label !== undefined && isBillableHoldLabel(label, pricing.billableHoldLabels);
      out.set(r.key, {
        quoteCents: billable ? quoteWithContext(pricing, r.courtId, r.startTime, r.endTime).amountCents : null,
        billable,
      });
    }
  }
  return out;
}

/** True when the club has any price at all (rules or a court's legacy rate). */
export function hasAnyPrice(pricing: PricingContext): boolean {
  return pricing.rules.length > 0 || [...pricing.courtPriceCents.values()].some((v) => v != null);
}

export interface BillableBooking {
  key: string;
  kind: 'game' | 'hold';
  id: string;
  courtIds: string[];
  start: Date;
  end: Date;
  quoteCents: number | null;
}

/** Billable bookings overlapping `[from, to)` with their quotes (games always; holds by label). */
export async function loadBillableBookings(clubId: string, pricing: PricingContext, from: Date, to: Date): Promise<BillableBooking[]> {
  const [games, holds] = await Promise.all([loadGameCourtTime(clubId, from, to), loadHoldRows(clubId, from, to)]);
  return [
    ...games.map((g) => ({
      key: `game:${g.gameId}`,
      kind: 'game' as const,
      id: g.gameId,
      courtIds: g.courtIds,
      start: g.start,
      end: g.end,
      quoteCents: quoteGameWithContext(pricing, g.courtIds, g.start, g.end),
    })),
    ...holds
      .filter((h) => isBillableHoldLabel(h.label, pricing.billableHoldLabels))
      .map((h) => ({
        key: `hold:${h.holdId}`,
        kind: 'hold' as const,
        id: h.holdId,
        courtIds: [h.courtId],
        start: h.start,
        end: h.end,
        quoteCents: quoteWithContext(pricing, h.courtId, h.start, h.end).amountCents,
      })),
  ];
}

/** Live (non-VOID) charges of bookings, with non-voided paid sums, keyed `game:<id>` / `hold:<id>`. */
export async function loadLiveChargesFor(
  clubId: string,
  bookings: Array<{ kind: 'game' | 'hold'; id: string }>
): Promise<Map<string, { id: string; status: ChargeStatus; amountCents: number; paidCents: number }>> {
  const out = new Map<string, { id: string; status: ChargeStatus; amountCents: number; paidCents: number }>();
  const gameIds = bookings.filter((b) => b.kind === 'game').map((b) => b.id);
  const holdIds = bookings.filter((b) => b.kind === 'hold').map((b) => b.id);
  if (gameIds.length === 0 && holdIds.length === 0) return out;
  const charges = await prisma.clubCharge.findMany({
    where: {
      clubId,
      status: { not: 'VOID' },
      OR: [...(gameIds.length ? [{ gameId: { in: gameIds } }] : []), ...(holdIds.length ? [{ holdId: { in: holdIds } }] : [])],
    },
    select: {
      id: true,
      gameId: true,
      holdId: true,
      status: true,
      amountCents: true,
      payments: { where: { voidedAt: null }, select: { amountCents: true } },
    },
  });
  for (const c of charges) {
    const key = c.gameId ? `game:${c.gameId}` : `hold:${c.holdId}`;
    out.set(key, {
      id: c.id,
      status: c.status,
      amountCents: c.amountCents,
      paidCents: c.payments.reduce((s, p) => s + p.amountCents, 0),
    });
  }
  return out;
}

/** Sum of non-voided payments with `paidAt` in `[from, to)`. */
export async function collectedBetween(clubId: string, from: Date, to: Date): Promise<number> {
  const agg = await prisma.clubPayment.aggregate({
    where: { clubId, voidedAt: null, paidAt: { gte: from, lt: to } },
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents ?? 0;
}

/**
 * Dashboard billing: expected revenue (quotes of today's billable bookings by start), collected
 * today (club-local), and `unpaid_past` — bookings that started in the last 30 days and have
 * ended, whose live charge is UNPAID/PARTIAL or that have a quote but no live charge.
 */
export async function dashboardBilling(ctx: ClubAdminRequestContext, date: string, now: Date = new Date()): Promise<DashboardBillingExtras> {
  const { clubId, timezone, currency } = ctx;
  const pricing = await loadPricingContext(clubId);
  const today = clubDayWindowUtc(date, timezone);
  const since = new Date(now.getTime() - UNPAID_PAST_DAYS * 86_400_000);
  const rangeStart = new Date(Math.min(since.getTime(), today.start.getTime()));
  const rangeEnd = new Date(Math.max(now.getTime(), today.end.getTime()));
  const [bookings, collectedCents] = await Promise.all([
    loadBillableBookings(clubId, pricing, rangeStart, rangeEnd),
    collectedBetween(clubId, today.start, today.end),
  ]);
  const todays = bookings.filter((b) => b.start >= today.start && b.start < today.end);
  const past = bookings.filter((b) => b.start >= since && b.end <= now);
  const charges = await loadLiveChargesFor(clubId, past);

  let count = 0;
  let amountCents = 0;
  for (const b of past) {
    const charge = charges.get(b.key);
    if (charge) {
      if (charge.status === 'UNPAID' || charge.status === 'PARTIAL') {
        count += 1;
        amountCents += chargeBalanceCents(charge.status, charge.amountCents, charge.paidCents);
      }
    } else if (b.quoteCents != null && b.quoteCents > 0) {
      count += 1;
      amountCents += b.quoteCents;
    }
  }
  const attention: AttentionItem[] = count > 0 ? [{ kind: 'unpaid_past', count, amountCents, currency }] : [];
  const priced = hasAnyPrice(pricing);
  return {
    attention,
    expectedRevenueCents: priced ? todays.reduce((s, b) => s + (b.quoteCents ?? 0), 0) : null,
    collectedCents,
  };
}

setBookingQuoteProvider(quoteBookingRequests);
setDashboardBillingProvider((ctx, date) => dashboardBilling(ctx, date));
