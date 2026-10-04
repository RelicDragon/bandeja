/**
 * Agent-facing cost split shapes (Phase 10).
 *
 * Built only from what the `gameCost` services return (already projected per viewer by
 * `projectCostSummary`). Amounts stay integer minor units plus a server-formatted string;
 * currencies are never added together or converted. Payment methods are reduced to their
 * ids (`BIZUM`, `CASH`, …): no handles (IBAN, phone, tag), no `paymentHint` (§10.7 Q1).
 */
import type { EntityType, PriceCurrency, PriceType } from '@prisma/client';
import type { BasicUser } from '../../../types/user.types';
import { resolveIntlLocale } from '../../../utils/intlLocale';
import { formatCostAmount } from '../../gameCost/costReminderCopy';
import { applySeasonCostPricing } from '../../gameCost/gameCost.service';
import type { CostShareDto, OwedCostShareDto } from '../../gameCost/gameCost.types';
import { agentUserDisplayName, roundLevel, type AgentUserCard } from './user.dto';

export type AgentMoney = { amountMinor: number; currency: PriceCurrency; amount: string };

export function agentMoney(amountMinor: number, currency: PriceCurrency, locale: string): AgentMoney {
  return { amountMinor, currency, amount: formatCostAmount(amountMinor, currency, resolveIntlLocale(locale)) };
}

/** A user embedded in a cost DTO, as the agent's public card (no wallet, no contact data). */
export function agentCostUserCard(user: BasicUser | null, userId: string | null): AgentUserCard | null {
  if (!userId) return null;
  if (!user) return { userId, name: 'Player', isTrainer: false, level: null };
  return { userId, name: agentUserDisplayName(user), isTrainer: user.isTrainer, level: roundLevel(user.level) };
}

export function agentCostShare(share: CostShareDto, locale: string) {
  return {
    player: agentCostUserCard(share.user, share.userId),
    ...agentMoney(share.amountMinor, share.currency, locale),
    state: share.state,
    method: share.method,
    isPayer: share.isPayer,
    isOverridden: share.isOverridden,
  };
}

export function agentOwedRow(row: OwedCostShareDto, locale: string) {
  return {
    gameId: row.gameId,
    title: (row.gameName ?? '').trim() || null,
    startTime: row.startTime,
    ...agentMoney(row.amountMinor, row.currency, locale),
    state: row.state,
    counterparty: agentCostUserCard(row.counterparty, row.counterpartyUserId),
  };
}

/** Server-summed totals per currency (never across currencies). */
export function agentTotalsByCurrency(rows: readonly { amountMinor: number; currency: PriceCurrency }[], locale: string): AgentMoney[] {
  const sums = new Map<PriceCurrency, number>();
  for (const row of rows) sums.set(row.currency, (sums.get(row.currency) ?? 0) + row.amountMinor);
  return [...sums.entries()].map(([currency, amountMinor]) => agentMoney(amountMinor, currency, locale));
}

type PriceFields = { priceType: PriceType; priceTotal: number | null; priceCurrency: PriceCurrency | null };

export type AgentPriceGame = PriceFields & {
  entityType: EntityType;
  parent: (PriceFields & { entityType: EntityType }) | null;
};

/**
 * The price the ledger splits by: a LEAGUE fixture created `NOT_KNOWN` takes its season's
 * price (`applySeasonCostPricing`, the same function the ledger uses). `priceSource` says
 * which row it came from.
 */
export function agentEffectivePrice(game: AgentPriceGame): PriceFields & { priceSource: 'season' | 'game' } {
  const priced = applySeasonCostPricing({
    entityType: game.entityType,
    priceType: game.priceType,
    priceTotal: game.priceTotal,
    priceCurrency: game.priceCurrency,
    paymentHint: null,
    paymentMethods: null,
    parent: game.parent
      ? { ...game.parent, paymentHint: null, paymentMethods: null, participants: [] }
      : null,
  });
  const fromSeason =
    game.entityType === 'LEAGUE' && game.parent?.entityType === 'LEAGUE_SEASON' && game.priceType === 'NOT_KNOWN';
  return {
    priceType: priced.priceType,
    priceTotal: priced.priceTotal,
    priceCurrency: priced.priceCurrency,
    priceSource: fromSeason ? 'season' : 'game',
  };
}
