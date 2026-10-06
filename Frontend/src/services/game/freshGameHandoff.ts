import type { Game } from '@/types';

/**
 * One-shot handoff of a game the details page has just fetched to the embedded side
 * chat, which otherwise refetches the same game ~1 s later on open. Taken at most
 * once and only while fresh; forced reloads (after join etc.) never use it.
 */
const HANDOFF_MAX_AGE_MS = 5000;
const handoff = new Map<string, { game: Game; at: number }>();

export function offerFreshGame(game: Game): void {
  handoff.set(game.id, { game, at: Date.now() });
}

export function takeFreshGame(gameId: string): Game | null {
  const entry = handoff.get(gameId);
  handoff.delete(gameId);
  if (!entry || Date.now() - entry.at > HANDOFF_MAX_AGE_MS) return null;
  return entry.game;
}
