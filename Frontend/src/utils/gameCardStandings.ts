import type { GameOutcome, GameParticipant } from '@/types';

/** Minimal outcome fields needed for GameCard standings. */
export type GameCardStandingOutcome = {
  userId: string;
  position?: number | null;
};

export type GameCardStandingOrder = {
  participants: GameParticipant[];
  placeByUserId: Record<string, number>;
};

function isStandingOutcome(row: unknown): row is GameCardStandingOutcome {
  if (!row || typeof row !== 'object') return false;
  const userId = (row as GameCardStandingOutcome).userId;
  return typeof userId === 'string' && userId.length > 0;
}

function hasNumericPosition(outcome: GameCardStandingOutcome): boolean {
  return typeof outcome.position === 'number' && Number.isFinite(outcome.position);
}

/** True when FINAL and at least one outcome has a real standing position (not training-only rows). */
export function hasOutcomeStandings(
  resultsStatus: string | null | undefined,
  outcomes: readonly GameCardStandingOutcome[] | GameOutcome[] | null | undefined
): boolean {
  if (resultsStatus !== 'FINAL') return false;
  return (outcomes ?? []).some((row) => isStandingOutcome(row) && hasNumericPosition(row));
}

function sortByPosition(outcomes: readonly GameCardStandingOutcome[]): GameCardStandingOutcome[] {
  return [...outcomes].sort((a, b) => {
    const placeDiff = (a.position as number) - (b.position as number);
    if (placeDiff !== 0) return placeDiff;
    return a.userId.localeCompare(b.userId);
  });
}

/** Sort playing participants by FINAL outcome standings; map userId → place. */
export function orderPlayingParticipantsByStandings(
  participants: readonly GameParticipant[],
  outcomes: readonly GameCardStandingOutcome[] | null | undefined
): GameCardStandingOrder {
  const positioned = (outcomes ?? []).filter(
    (row): row is GameCardStandingOutcome & { position: number } =>
      isStandingOutcome(row) && hasNumericPosition(row)
  );
  if (positioned.length === 0) {
    return { participants: [...participants], placeByUserId: {} };
  }

  const sortedOutcomes = sortByPosition(positioned);
  const outcomePlaceByUserId = new Map<string, number>();
  for (const outcome of sortedOutcomes) {
    // Ascending sort → first write keeps the best place on duplicate userId rows.
    if (!outcomePlaceByUserId.has(outcome.userId)) {
      outcomePlaceByUserId.set(outcome.userId, outcome.position);
    }
  }

  const ranked: GameParticipant[] = [];
  const unranked: GameParticipant[] = [];
  for (const participant of participants) {
    if (outcomePlaceByUserId.has(participant.userId)) {
      ranked.push(participant);
    } else {
      unranked.push(participant);
    }
  }

  ranked.sort((a, b) => {
    const placeDiff =
      outcomePlaceByUserId.get(a.userId)! - outcomePlaceByUserId.get(b.userId)!;
    if (placeDiff !== 0) return placeDiff;
    return a.userId.localeCompare(b.userId);
  });

  const placeByUserId: Record<string, number> = {};
  for (const participant of ranked) {
    placeByUserId[participant.userId] = outcomePlaceByUserId.get(participant.userId)!;
  }

  return { participants: [...ranked, ...unranked], placeByUserId };
}

/** Stable memo key — only positioned standings matter for GameCard places. */
export function gameCardOutcomesKey(
  outcomes: readonly GameCardStandingOutcome[] | GameOutcome[] | null | undefined
): string {
  const positioned = (outcomes ?? []).filter(
    (row): row is GameCardStandingOutcome & { position: number } =>
      isStandingOutcome(row) && hasNumericPosition(row)
  );
  if (positioned.length === 0) return '';
  return positioned
    .map((o) => `${o.userId}:${o.position}`)
    .sort()
    .join('|');
}

export function placeMapsEqual(
  a: Record<string, number> | null | undefined,
  b: Record<string, number> | null | undefined
): boolean {
  const left = a ?? {};
  const right = b ?? {};
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}
