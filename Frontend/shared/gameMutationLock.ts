/**
 * Roster / settings / format mutability for a game.
 *
 * `Game.status` is derived from the clock by `calculateGameStatus`: `STARTED` also
 * means "now is inside the booked slot" and `FINISHED` also means "the slot ended
 * while `resultsStatus` was still `NONE`". Gating mutations on it froze games that
 * nobody had scored. `resultsStatus` is the only field recording that humans began
 * recording the game, so it is the lock. See `docs/product/constraints.md`.
 */

export type GameMutationLockStatus = 'ANNOUNCED' | 'STARTED' | 'FINISHED' | 'ARCHIVED';
export type GameMutationLockResultsStatus = 'NONE' | 'IN_PROGRESS' | 'FINAL';

export type GameMutationLockShape = {
  status: GameMutationLockStatus;
  resultsStatus: GameMutationLockResultsStatus;
};

/** Results entry has begun, so the roster, settings and format are frozen. */
export function isGameResultsLocked(game: GameMutationLockShape): boolean {
  return game.resultsStatus !== 'NONE';
}

/** Retention boundary: an archived game is immutable even with no results. */
export function isGameArchived(game: GameMutationLockShape): boolean {
  return game.status === 'ARCHIVED';
}

/**
 * Whether participants may be invited, joined, removed or re-teamed, and whether
 * game settings / info / format may still be edited.
 */
export function canMutateGameRoster(game: GameMutationLockShape): boolean {
  return !isGameArchived(game) && !isGameResultsLocked(game);
}
