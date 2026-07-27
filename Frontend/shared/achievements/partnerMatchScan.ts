import {
  GIANT_KILLER_MIN_LEVEL_GAP,
  GIANT_KILLER_MIN_RELIABILITY,
} from './partnerEligibility';

export type PartnerPlayerSnap = {
  userId: string;
  level: number;
  reliability: number;
};

export type PartnerScannedMatch = {
  winnerId: string | null;
  teams: Array<{ id: string; teamNumber: number; playerIds: string[] }>;
  /** True when the match was actually played (valid sets). Open Court uses this; wins need winnerId. */
  played?: boolean;
};

export type PartnerHabitCounters = {
  giantKillerWins: number;
  dynamicDuoMaxWins: number;
  openCourtPartners: number;
};

function avgLevel(
  playerIds: string[],
  byId: Map<string, PartnerPlayerSnap>,
  levelDelta: Record<string, number>,
): number {
  if (playerIds.length === 0) return 0;
  let sum = 0;
  for (const id of playerIds) {
    const p = byId.get(id);
    sum += (p?.level ?? 1) + (levelDelta[id] ?? 0);
  }
  return sum / playerIds.length;
}

function isCompletedDoublesMatch(match: PartnerScannedMatch): boolean {
  if (match.teams.length !== 2) return false;
  const teamA = match.teams.find((t) => t.teamNumber === 1) ?? match.teams[0];
  const teamB = match.teams.find((t) => t.teamNumber === 2) ?? match.teams[1];
  if (!teamA || !teamB) return false;
  if (teamA.playerIds.length !== 2 || teamB.playerIds.length !== 2) return false;
  if (match.played === true) return true;
  if (match.winnerId) return true;
  return false;
}

/**
 * Count partner habits from completed 2v2 matches.
 * Open Court: any completed doubles (played sets or winner), including ties.
 * Dynamic Duo / Giant Killer: require a winning team (winnerId).
 */
export function accumulatePartnerCountersForUser(
  games: ReadonlyArray<{
    players: readonly PartnerPlayerSnap[];
    matches: readonly PartnerScannedMatch[];
    /** Per-match cumulative level deltas AFTER that match (for next match start). */
    levelDeltaAfterMatch?: ReadonlyArray<Readonly<Record<string, number>>>;
  }>,
  userId: string,
): PartnerHabitCounters {
  let giantKillerWins = 0;
  const partnerWins = new Map<string, number>();
  const partners = new Set<string>();

  for (const game of games) {
    const byId = new Map(game.players.map((p) => [p.userId, p]));
    let levelDelta: Record<string, number> = {};
    for (const p of game.players) levelDelta[p.userId] = 0;

    for (let i = 0; i < game.matches.length; i += 1) {
      const match = game.matches[i]!;
      if (!isCompletedDoublesMatch(match)) {
        const afterSkip = game.levelDeltaAfterMatch?.[i];
        if (afterSkip) levelDelta = { ...afterSkip };
        continue;
      }

      const teamA = match.teams.find((t) => t.teamNumber === 1) ?? match.teams[0]!;
      const teamB = match.teams.find((t) => t.teamNumber === 2) ?? match.teams[1]!;

      const userTeam =
        teamA.playerIds.includes(userId) ? teamA : teamB.playerIds.includes(userId) ? teamB : null;
      if (userTeam) {
        const partnerId = userTeam.playerIds.find((id) => id !== userId);
        if (partnerId) partners.add(partnerId);

        const won = Boolean(match.winnerId && match.winnerId === userTeam.id);
        if (won && partnerId) {
          partnerWins.set(partnerId, (partnerWins.get(partnerId) ?? 0) + 1);
        }

        if (won) {
          const opp = userTeam.id === teamA.id ? teamB : teamA;
          const ownAvg = avgLevel(userTeam.playerIds, byId, levelDelta);
          const oppAvg = avgLevel(opp.playerIds, byId, levelDelta);
          const allIds = [...teamA.playerIds, ...teamB.playerIds];
          const allReliable = allIds.every(
            (id) => (byId.get(id)?.reliability ?? 0) > GIANT_KILLER_MIN_RELIABILITY,
          );
          if (allReliable && oppAvg - ownAvg >= GIANT_KILLER_MIN_LEVEL_GAP) {
            giantKillerWins += 1;
          }
        }
      }

      const after = game.levelDeltaAfterMatch?.[i];
      if (after) {
        levelDelta = { ...after };
      }
    }
  }

  let dynamicDuoMaxWins = 0;
  for (const n of partnerWins.values()) {
    if (n > dynamicDuoMaxWins) dynamicDuoMaxWins = n;
  }

  return {
    giantKillerWins,
    dynamicDuoMaxWins,
    openCourtPartners: partners.size,
  };
}

/** Counters for games excluding a game id (in-memory; one DB load). */
export function partnerCountersBeforeAfter(params: {
  games: ReadonlyArray<{
    id: string;
    players: readonly PartnerPlayerSnap[];
    matches: readonly PartnerScannedMatch[];
    levelDeltaAfterMatch?: ReadonlyArray<Readonly<Record<string, number>>>;
  }>;
  userId: string;
  excludeGameId: string;
}): { before: PartnerHabitCounters; after: PartnerHabitCounters } {
  const after = accumulatePartnerCountersForUser(params.games, params.userId);
  const before = accumulatePartnerCountersForUser(
    params.games.filter((g) => g.id !== params.excludeGameId),
    params.userId,
  );
  return { before, after };
}
