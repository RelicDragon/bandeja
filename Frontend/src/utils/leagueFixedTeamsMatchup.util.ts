import type { BasicUser, GameOutcome } from '@/types';
import type { Sport } from '@shared/sport';
import { getDisplayLevelForSport } from '@/utils/profileSports';

export function teamAverageLevel(players: BasicUser[], sport: Sport): number | null {
  if (players.length === 0) return null;
  const sum = players.reduce((acc, p) => acc + getDisplayLevelForSport(p, sport), 0);
  return sum / players.length;
}

/** Below this gap in average level the two sides read as an even match. */
export const EVEN_MATCH_LEVEL_GAP = 0.25;

export type LevelBalance = {
  /** Team A's share of the bar, 0..1 (clamped so neither side ever vanishes). */
  shareA: number;
  favored: 'teamA' | 'teamB' | null;
};

/** Logistic split of the average-level gap: a visual edge, not a prediction. */
export function levelBalance(avgA: number | null, avgB: number | null): LevelBalance | null {
  if (avgA === null || avgB === null) return null;
  const diff = avgA - avgB;
  const raw = 1 / (1 + Math.exp(-diff * 1.6));
  const shareA = Math.min(0.88, Math.max(0.12, raw));
  const favored = Math.abs(diff) < EVEN_MATCH_LEVEL_GAP ? null : diff > 0 ? 'teamA' : 'teamB';
  return { shareA, favored };
}

export function levelChangeByUserId(outcomes: GameOutcome[] | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of outcomes ?? []) {
    const id = o.user?.id ?? o.userId;
    if (id && Number.isFinite(o.levelChange)) out.set(id, o.levelChange);
  }
  return out;
}

export function formatLevelChange(change: number): string | null {
  const rounded = Math.round(change * 100) / 100;
  if (rounded === 0) return null;
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(2)}`;
}
