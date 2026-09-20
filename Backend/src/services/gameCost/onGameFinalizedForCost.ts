/**
 * PRD 348 — freeze the cost ledger at the FINAL transition itself.
 *
 * `Game.costFrozenAt` is the clock the automatic settle reminder counts 24 h
 * from. Before this hook existed the column was only written by whichever
 * hourly `CostShareReminderScheduler` pass first *noticed* the game was FINAL,
 * so a game that went FINAL at 20:05 froze at 21:00 and was nudged at 21:00 the
 * next day — and a game whose `updatedAt` fell outside the sweep's 7-day window
 * (a long outage, or a backlog deeper than `AUTO_REMIND_BATCH_SIZE`) was never
 * frozen and never reminded at all.
 *
 * Called post-commit from `recalculateGameOutcomes`, next to the attendance,
 * pair-stat and referral hooks, and for the same reason: it is a derived write
 * that must never be able to roll back a result. `syncGameCostShares` is
 * idempotent, flag-guarded and a no-op for a game with no splittable price, so
 * a recalculation of an already-final result changes nothing.
 */
import { syncGameCostShares } from './gameCost.service';

export async function onGameFinalizedForCost(gameId: string): Promise<void> {
  try {
    await syncGameCostShares(gameId);
  } catch (error) {
    console.error('[GameCost] freeze on finalization failed', gameId, error);
  }
}
