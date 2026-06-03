import { randomUUID } from 'crypto';
import {
  pairIndicesForRoundRobinSlot,
  roundsInSingleRoundRobinCycle,
} from '../../league/generation/fixedTeamsRoundRobin';
import type { GenGame, GenMatch, GenRound } from './types';
import {
  attachFixedTeamIdsToMatch,
  cloneSets,
  getEligibleParticipants,
  getFilteredFixedTeams,
  getNumMatches,
  InitialSets,
  playersPerMatchOf,
} from './matchUtils';

const createId = () => randomUUID();

function fourPlayerDoublesSchedule(
  playerIds: string[]
): Array<{ teamA: string[]; teamB: string[] }> {
  if (playerIds.length !== 4) return [];
  const [a, b, c, d] = playerIds;
  return [
    { teamA: [a, b], teamB: [c, d] },
    { teamA: [a, c], teamB: [b, d] },
    { teamA: [a, d], teamB: [b, c] },
  ];
}

/** Circle partner draw: each round pairs players so partners rotate (even n). */
function partnerPairsForRound(playerIds: string[], roundIndex: number): Array<[string, string]> {
  const n = playerIds.length;
  if (n < 2 || n % 2 !== 0) return [];
  const anchor = playerIds[0]!;
  const rest = playerIds.slice(1);
  const rot = roundIndex % Math.max(1, n - 1);
  const rotated = [...rest.slice(rot), ...rest.slice(0, rot)];
  const order = [anchor, ...rotated];
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < n / 2; i++) {
    pairs.push([order[i]!, order[n - 1 - i]!]);
  }
  return pairs;
}

export function generateRoundRobinRound(
  game: GenGame,
  previousRounds: GenRound[],
  initialSets: InitialSets
): GenMatch[] {
  const participants = getEligibleParticipants(game);
  const ppm = playersPerMatchOf(game);
  const roundIndex = previousRounds.length;
  const sortedCourts = game.gameCourts
    ? [...game.gameCourts].sort((a, b) => a.order - b.order)
    : [];

  if (game.hasFixedTeams && game.fixedTeams && game.fixedTeams.length >= 2) {
    const fixedTeamPairs = getFilteredFixedTeams(game);
    const teamCount = fixedTeamPairs.length;
    const cycle = roundsInSingleRoundRobinCycle(teamCount);
    if (roundIndex >= cycle) return [];

    const pairIndices = pairIndicesForRoundRobinSlot(teamCount, roundIndex);
    const numMatches = getNumMatches(game, participants);
    const matches: GenMatch[] = [];

    for (let i = 0; i < pairIndices.length && matches.length < numMatches; i++) {
      const [ai, bi] = pairIndices[i]!;
      const teamA = fixedTeamPairs[ai]!;
      const teamB = fixedTeamPairs[bi]!;
      matches.push(
        attachFixedTeamIdsToMatch(
          {
            id: createId(),
            teamA: [...teamA],
            teamB: [...teamB],
            sets: cloneSets(initialSets),
            courtId: sortedCourts[matches.length]?.courtId,
          },
          game
        )
      );
    }
    return matches;
  }

  const playerIds = [...participants.map((p) => p.userId)].sort();

  if (ppm === 2) {
    const n = playerIds.length;
    if (n < 2) return [];
    const cycle = roundsInSingleRoundRobinCycle(n);
    if (roundIndex >= cycle) return [];

    const pairings = pairIndicesForRoundRobinSlot(n, roundIndex);
    const numMatches = Math.min(getNumMatches(game, participants), pairings.length);
    const matches: GenMatch[] = [];
    for (let i = 0; i < numMatches; i++) {
      const [ai, bi] = pairings[i]!;
      matches.push({
        id: createId(),
        teamA: [playerIds[ai]!],
        teamB: [playerIds[bi]!],
        sets: cloneSets(initialSets),
        courtId: sortedCourts[i]?.courtId,
      });
    }
    return matches;
  }

  if (ppm === 4 && playerIds.length === 4) {
    const schedule = fourPlayerDoublesSchedule(playerIds);
    if (roundIndex >= schedule.length) return [];
    const setup = schedule[roundIndex]!;
    return [
      {
        id: createId(),
        teamA: setup.teamA,
        teamB: setup.teamB,
        sets: cloneSets(initialSets),
        courtId: sortedCourts[0]?.courtId,
      },
    ];
  }

  if (ppm === 4 && playerIds.length >= 4 && playerIds.length % 2 === 0) {
    const partnerCycle = Math.max(1, playerIds.length - 1);
    if (roundIndex >= partnerCycle) return [];

    const pairs = partnerPairsForRound(playerIds, roundIndex);
    const teamCount = pairs.length;
    if (teamCount < 2) return [];

    const teamMatchups = pairIndicesForRoundRobinSlot(
      teamCount,
      roundIndex % roundsInSingleRoundRobinCycle(teamCount)
    );
    const limit = getNumMatches(game, participants);
    const matches: GenMatch[] = [];

    for (let i = 0; i < Math.min(limit, teamMatchups.length); i++) {
      const [ai, bi] = teamMatchups[i]!;
      const sideA = pairs[ai]!;
      const sideB = pairs[bi]!;
      matches.push({
        id: createId(),
        teamA: [sideA[0], sideA[1]],
        teamB: [sideB[0], sideB[1]],
        sets: cloneSets(initialSets),
        courtId: sortedCourts[i]?.courtId,
      });
    }
    return matches;
  }

  return [];
}
