import type { BookingBillingSummary, ChargeStatus } from '@bandeja/shared/clubAdmin/contract';
import prisma from '../../config/database';

/**
 * Billing summaries for bookings shown in the console (schedule, bookings, dashboard).
 * The live charge (non-VOID) of a game at this club / of a hold, with its non-voided payments.
 *
 * `quoteCents` comes from {@link setBookingQuoteProvider}; until pricing is wired it is null.
 */
export interface BookingQuoteRequest {
  key: string;
  courtId: string | null;
  startTime: Date;
  endTime: Date;
}

export type BookingQuoteProvider = (
  clubId: string,
  requests: BookingQuoteRequest[]
) => Promise<Map<string, number | null>>;

let quoteProvider: BookingQuoteProvider | null = null;

/** The pricing module registers itself here (keeps this file free of pricing imports). */
export function setBookingQuoteProvider(provider: BookingQuoteProvider | null): void {
  quoteProvider = provider;
}

export interface BillingSummaryTargets {
  games?: Array<{ gameId: string; courtId: string | null; startTime: Date; endTime: Date }>;
  holds?: Array<{ holdId: string; courtId: string | null; startTime: Date; endTime: Date }>;
}

export interface BillingSummaries {
  game: Map<string, BookingBillingSummary>;
  hold: Map<string, BookingBillingSummary>;
}

export async function loadBillingSummaries(
  clubId: string,
  currency: string,
  targets: BillingSummaryTargets
): Promise<BillingSummaries> {
  const games = targets.games ?? [];
  const holds = targets.holds ?? [];
  const out: BillingSummaries = { game: new Map(), hold: new Map() };
  if (games.length === 0 && holds.length === 0) return out;

  const charges = await prisma.clubCharge.findMany({
    where: {
      clubId,
      status: { not: 'VOID' },
      OR: [
        ...(games.length ? [{ gameId: { in: games.map((g) => g.gameId) } }] : []),
        ...(holds.length ? [{ holdId: { in: holds.map((h) => h.holdId) } }] : []),
      ],
    },
    select: {
      id: true,
      gameId: true,
      holdId: true,
      status: true,
      amountCents: true,
      currency: true,
      payments: { where: { voidedAt: null }, select: { amountCents: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const quoteRequests: BookingQuoteRequest[] = [
    ...games.map((g) => ({ key: `game:${g.gameId}`, courtId: g.courtId, startTime: g.startTime, endTime: g.endTime })),
    ...holds.map((h) => ({ key: `hold:${h.holdId}`, courtId: h.courtId, startTime: h.startTime, endTime: h.endTime })),
  ];
  const quotes = quoteProvider ? await quoteProvider(clubId, quoteRequests) : new Map<string, number | null>();

  const chargeByGame = new Map<string, (typeof charges)[number]>();
  const chargeByHold = new Map<string, (typeof charges)[number]>();
  for (const c of charges) {
    if (c.gameId && !chargeByGame.has(c.gameId)) chargeByGame.set(c.gameId, c);
    if (c.holdId && !chargeByHold.has(c.holdId)) chargeByHold.set(c.holdId, c);
  }
  const summarize = (key: string, charge: (typeof charges)[number] | undefined): BookingBillingSummary => ({
    quoteCents: quotes.get(key) ?? null,
    chargeId: charge?.id ?? null,
    status: (charge?.status as ChargeStatus | undefined) ?? null,
    amountCents: charge?.amountCents ?? null,
    paidCents: charge ? charge.payments.reduce((sum, p) => sum + p.amountCents, 0) : 0,
    currency: charge?.currency ?? currency,
  });
  for (const g of games) out.game.set(g.gameId, summarize(`game:${g.gameId}`, chargeByGame.get(g.gameId)));
  for (const h of holds) out.hold.set(h.holdId, summarize(`hold:${h.holdId}`, chargeByHold.get(h.holdId)));
  return out;
}
