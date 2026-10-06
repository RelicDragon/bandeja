import { CourtSlotHoldLabel, PriceCurrency } from '@prisma/client';
import type { ClubPriceRule, ClubPricing, HoldLabel, IsoWeekday, PriceQuote } from '@bandeja/shared/clubAdmin/contract';
import prisma from '../../config/database';
import { clubAdminNotFound, clubAdminValidation } from './clubAdminErrors';
import { logClubActivity } from './clubAdminActivity.service';
import { parseInstant } from './clubAdminHold.service';
import { quoteCourtTime, sumQuotes, type QuoteResult, type QuoteRule } from './clubAdminQuote';
import { invalidateClubReports } from './clubAdminReportsCache';

/**
 * Club console pricing (docs/domains/club-admin.md "Pricing"): weekly price rules per court or
 * club-wide, the court's legacy `pricePerHour` as fallback rate, billable hold labels. Quotes are
 * computed by the pure engine in `clubAdminQuote.ts`; this module loads what it needs once per
 * request and answers for many bookings at a time (schedule, bookings, dashboard, reports).
 */

export const MAX_PRICE_RULES = 200;
const MAX_PRICE_PER_HOUR_CENTS = 100_000_000;
const MAX_RULE_LABEL = 60;
const HOLD_LABELS = Object.values(CourtSlotHoldLabel) as string[];

/** MAINTENANCE is never billable, whatever the club stored. */
export function isBillableHoldLabel(label: string, billable: ReadonlySet<string>): boolean {
  return label !== CourtSlotHoldLabel.MAINTENANCE && billable.has(label);
}

function ruleToContract(r: {
  id: string;
  courtId: string | null;
  label: string | null;
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  pricePerHourCents: number;
}): ClubPriceRule {
  return {
    id: r.id,
    courtId: r.courtId,
    label: r.label,
    weekdays: [...r.weekdays].sort((a, b) => a - b) as IsoWeekday[],
    startMinute: r.startMinute,
    endMinute: r.endMinute,
    pricePerHourCents: r.pricePerHourCents,
  };
}

export async function getClubPricing(clubId: string): Promise<ClubPricing> {
  const [club, rules] = await Promise.all([
    prisma.club.findUnique({ where: { id: clubId }, select: { currency: true, billableHoldLabels: true } }),
    prisma.clubPriceRule.findMany({
      where: { clubId },
      orderBy: [{ courtId: { sort: 'asc', nulls: 'first' } }, { startMinute: 'asc' }, { id: 'asc' }],
    }),
  ]);
  if (!club) throw clubAdminNotFound('Club');
  return {
    currency: club.currency,
    rules: rules.map(ruleToContract),
    billableHoldLabels: club.billableHoldLabels.filter((l) => l !== CourtSlotHoldLabel.MAINTENANCE) as HoldLabel[],
  };
}

export interface ParsedPricing {
  currency: PriceCurrency;
  rules: Array<Omit<ClubPriceRule, 'id'> & { id?: string }>;
  billableHoldLabels: CourtSlotHoldLabel[];
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** Validates `PUT /pricing`. Pure apart from `clubCourtIds`. */
export function parsePricingBody(raw: unknown, clubCourtIds: ReadonlySet<string>): ParsedPricing {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof body.currency !== 'string' || !(Object.values(PriceCurrency) as string[]).includes(body.currency)) {
    throw clubAdminValidation('currency', 'unknown currency');
  }
  if (!Array.isArray(body.rules)) throw clubAdminValidation('rules', 'must be a list');
  if (body.rules.length > MAX_PRICE_RULES) throw clubAdminValidation('rules', `at most ${MAX_PRICE_RULES} rules`);
  const rules = body.rules.map((r: unknown, i: number) => {
    const field = `rules[${i}]`;
    if (!r || typeof r !== 'object') throw clubAdminValidation(field, 'must be an object');
    const rule = r as Record<string, unknown>;
    const courtId = rule.courtId ?? null;
    if (courtId !== null && (typeof courtId !== 'string' || !clubCourtIds.has(courtId))) {
      throw clubAdminValidation(`${field}.courtId`, 'is not a court of this club');
    }
    const weekdays = rule.weekdays;
    if (!Array.isArray(weekdays) || weekdays.length === 0 || !weekdays.every((d) => isInt(d) && d >= 1 && d <= 7)) {
      throw clubAdminValidation(`${field}.weekdays`, 'must be a non-empty list of ISO weekdays 1..7');
    }
    const { startMinute, endMinute, pricePerHourCents } = rule;
    if (!isInt(startMinute) || !isInt(endMinute) || startMinute < 0 || endMinute > 1440 || startMinute >= endMinute) {
      throw clubAdminValidation(`${field}.startMinute`, 'must satisfy 0 <= startMinute < endMinute <= 1440');
    }
    if (!isInt(pricePerHourCents) || pricePerHourCents < 0 || pricePerHourCents > MAX_PRICE_PER_HOUR_CENTS) {
      throw clubAdminValidation(`${field}.pricePerHourCents`, 'must be a non-negative integer');
    }
    const label = rule.label ?? null;
    if (label !== null && typeof label !== 'string') throw clubAdminValidation(`${field}.label`, 'must be a string');
    const id = typeof rule.id === 'string' && rule.id ? rule.id : undefined;
    return {
      ...(id ? { id } : {}),
      courtId: courtId as string | null,
      label: label ? label.trim().slice(0, MAX_RULE_LABEL) || null : null,
      weekdays: [...new Set(weekdays as number[])].sort((a, b) => a - b) as IsoWeekday[],
      startMinute,
      endMinute,
      pricePerHourCents,
    };
  });
  const labelsRaw = body.billableHoldLabels;
  if (!Array.isArray(labelsRaw) || !labelsRaw.every((l) => typeof l === 'string' && HOLD_LABELS.includes(l))) {
    throw clubAdminValidation('billableHoldLabels', 'must be a list of hold labels');
  }
  const billableHoldLabels = [...new Set(labelsRaw as string[])].filter(
    (l) => l !== CourtSlotHoldLabel.MAINTENANCE
  ) as CourtSlotHoldLabel[];
  return { currency: body.currency as PriceCurrency, rules, billableHoldLabels };
}

/** Replace-all: rules, currency and billable labels change together in one transaction. */
export async function putClubPricing(clubId: string, actorId: string, raw: unknown): Promise<ClubPricing> {
  const courts = await prisma.court.findMany({ where: { clubId }, select: { id: true } });
  const parsed = parsePricingBody(raw, new Set(courts.map((c) => c.id)));
  await prisma.$transaction(async (tx) => {
    const existing = new Set(
      (await tx.clubPriceRule.findMany({ where: { clubId }, select: { id: true } })).map((r) => r.id)
    );
    await tx.clubPriceRule.deleteMany({ where: { clubId } });
    if (parsed.rules.length > 0) {
      const seenIds = new Set<string>();
      await tx.clubPriceRule.createMany({
        data: parsed.rules.map((r) => {
          // Keep a rule's id when the client sends one of this club's ids (stable breakdown refs).
          const keepId = r.id && existing.has(r.id) && !seenIds.has(r.id) ? r.id : undefined;
          if (keepId) seenIds.add(keepId);
          return {
            ...(keepId ? { id: keepId } : {}),
            clubId,
            courtId: r.courtId,
            label: r.label,
            weekdays: r.weekdays,
            startMinute: r.startMinute,
            endMinute: r.endMinute,
            pricePerHourCents: r.pricePerHourCents,
          };
        }),
      });
    }
    await tx.club.update({
      where: { id: clubId },
      data: { currency: parsed.currency, billableHoldLabels: parsed.billableHoldLabels },
    });
  });
  await logClubActivity(clubId, actorId, 'PRICING_UPDATED', {
    rules: parsed.rules.length,
    currency: parsed.currency,
    billableHoldLabels: parsed.billableHoldLabels.join(','),
  });
  await invalidateClubReports(clubId);
  return getClubPricing(clubId);
}

/* ---------------------------------------------------------------------------------------------
 * Quoting many bookings at once
 * ------------------------------------------------------------------------------------------- */

export interface PricingContext {
  clubId: string;
  timezone: string;
  currency: PriceCurrency;
  rules: QuoteRule[];
  courtPriceCents: Map<string, number | null>;
  billableHoldLabels: Set<string>;
}

/** Three small queries; reuse the context for every booking in the request. */
export async function loadPricingContext(clubId: string): Promise<PricingContext> {
  const [club, rules, courts] = await Promise.all([
    prisma.club.findUnique({
      where: { id: clubId },
      select: { currency: true, billableHoldLabels: true, city: { select: { timezone: true } } },
    }),
    prisma.clubPriceRule.findMany({ where: { clubId } }),
    prisma.court.findMany({ where: { clubId }, select: { id: true, pricePerHour: true } }),
  ]);
  if (!club) throw clubAdminNotFound('Club');
  return {
    clubId,
    timezone: club.city.timezone,
    currency: club.currency,
    rules: rules.map((r) => ({
      id: r.id,
      courtId: r.courtId,
      weekdays: r.weekdays,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
      pricePerHourCents: r.pricePerHourCents,
    })),
    courtPriceCents: new Map(courts.map((c) => [c.id, c.pricePerHour == null ? null : Math.round(c.pricePerHour * 100)])),
    billableHoldLabels: new Set(club.billableHoldLabels),
  };
}

/** Quote one court's time. A court that is not this club's has no price. */
export function quoteWithContext(ctx: PricingContext, courtId: string | null, start: Date, end: Date): QuoteResult {
  if (courtId !== null && !ctx.courtPriceCents.has(courtId)) return { amountCents: null, breakdown: [] };
  return quoteCourtTime({
    courtId,
    start,
    end,
    timezone: ctx.timezone,
    rules: ctx.rules,
    fallbackPricePerHourCents: courtId !== null ? (ctx.courtPriceCents.get(courtId) ?? null) : null,
  });
}

/** A game pays for every court it uses at this club; no court here → no quote. */
export function quoteGameWithContext(ctx: PricingContext, courtIds: readonly string[], start: Date, end: Date): number | null {
  return sumQuotes(courtIds.map((courtId) => quoteWithContext(ctx, courtId, start, end).amountCents));
}

/** Courts of each game at this club: its `GameCourt` slots here, else its primary court if here. */
export async function gameCourtsAtClub(clubId: string, gameIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (gameIds.length === 0) return out;
  const games = await prisma.game.findMany({
    where: { id: { in: [...new Set(gameIds)] } },
    select: {
      id: true,
      courtId: true,
      court: { select: { clubId: true } },
      gameCourts: { orderBy: { order: 'asc' }, select: { courtId: true, court: { select: { clubId: true } } } },
    },
  });
  for (const g of games) {
    const here = g.gameCourts.length
      ? g.gameCourts.filter((gc) => gc.court.clubId === clubId).map((gc) => gc.courtId)
      : g.courtId && g.court?.clubId === clubId
        ? [g.courtId]
        : [];
    out.set(g.id, here);
  }
  return out;
}

/** `GET /pricing/quote?courtId&startTime&endTime`. */
export async function getPriceQuote(clubId: string, query: Record<string, unknown>): Promise<PriceQuote> {
  const courtId = typeof query.courtId === 'string' && query.courtId ? query.courtId : null;
  const start = parseInstant(query.startTime, 'startTime');
  const end = parseInstant(query.endTime, 'endTime');
  if (end <= start) throw clubAdminValidation('endTime', 'must be after startTime');
  if (end.getTime() - start.getTime() > 7 * 24 * 3_600_000) throw clubAdminValidation('endTime', 'at most 7 days');
  const ctx = await loadPricingContext(clubId);
  if (courtId !== null && !ctx.courtPriceCents.has(courtId)) throw clubAdminNotFound('Court');
  const q = quoteWithContext(ctx, courtId, start, end);
  return { amountCents: q.amountCents, currency: ctx.currency, breakdown: q.breakdown };
}
