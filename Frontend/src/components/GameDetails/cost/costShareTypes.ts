import type { PriceCurrency } from '@/types';

/**
 * PRD 348 — local re-exports so the cost components import one module instead
 * of reaching into `@/api` and `@/types` separately.
 */
export type { CostShare, CostShareState, CostShareMethod, GameCostSummary } from '@/api/gameCost';

/** The game's own currency. Never converted, never defaulted. */
export type PriceCurrencyLike = PriceCurrency;
