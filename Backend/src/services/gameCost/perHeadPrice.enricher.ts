import type { PriceCurrency, PriceType } from '@prisma/client';
import prisma from '../../config/database';
import { config } from '../../config/env';
import {
  registerAvailableGamesEnricher,
  type AvailableGamesEnricher,
} from '../game/availableGamesEnrichment';
import type { PerHeadPrice } from '../game/availableGamesEnrichmentTypes';
import {
  perHeadAmountMinor,
  resolveGameTotalMinor,
  resolvePerHeadPayerCount,
} from './costShareMath';

/**
 * PRD 348 — the "10 € per player" figure on a Find / My-games card.
 *
 * Derived, never stored: one batched query per card page, and `null` for every
 * game without a splittable price so the card falls back to the raw total.
 */

export const PER_HEAD_PRICE_ENRICHER_NAME = 'perHeadPrice';

type PerHeadGameRow = {
  id: string;
  priceType: PriceType;
  priceTotal: number | null;
  priceCurrency: PriceCurrency | null;
  maxParticipants: number;
  costFrozenAt: Date | null;
  participants: { userId: string }[];
  costShares: { amountCents: number }[];
};

export function buildPerHeadPrice(row: PerHeadGameRow): PerHeadPrice | null {
  if (row.priceCurrency == null) return null;

  const frozen = row.costFrozenAt != null;
  const payerCount = resolvePerHeadPayerCount({
    playingCount: row.participants.length,
    maxParticipants: row.maxParticipants,
    shareCount: row.costShares.length,
    frozen,
  });

  const totalMinor =
    frozen && row.costShares.length > 0
      ? row.costShares.reduce((sum, share) => sum + share.amountCents, 0)
      : resolveGameTotalMinor({
          priceType: row.priceType,
          priceTotal: row.priceTotal,
          currency: row.priceCurrency,
          payerCount,
        });

  if (totalMinor == null || totalMinor <= 0) return null;

  const amountCents = perHeadAmountMinor(totalMinor, payerCount);
  if (amountCents == null) return null;

  return {
    amountCents,
    currency: row.priceCurrency,
    totalCents: totalMinor,
    payerCount,
    estimated: !frozen,
  };
}

const enrichPerHeadPrice: AvailableGamesEnricher = async (_userId, games) => {
  if (!config.costSplitEnabled) return {};
  const ids = games.map((game) => game.id).filter(Boolean);
  if (ids.length === 0) return {};

  const rows = await prisma.game.findMany({
    where: { id: { in: ids }, priceType: { in: ['TOTAL', 'PER_PERSON'] } },
    select: {
      id: true,
      priceType: true,
      priceTotal: true,
      priceCurrency: true,
      maxParticipants: true,
      costFrozenAt: true,
      participants: { where: { status: 'PLAYING' }, select: { userId: true } },
      costShares: { select: { amountCents: true } },
    },
  });

  const out: Record<string, { perHeadPrice: PerHeadPrice | null }> = {};
  for (const row of rows) {
    const perHeadPrice = buildPerHeadPrice(row as unknown as PerHeadGameRow);
    if (perHeadPrice) out[row.id] = { perHeadPrice };
  }
  return out;
};

let registered = false;

/** Idempotent — a doubly imported route file must not register twice. */
export function registerPerHeadPriceEnricher(): void {
  if (registered) return;
  registered = true;
  registerAvailableGamesEnricher(PER_HEAD_PRICE_ENRICHER_NAME, enrichPerHeadPrice);
}
