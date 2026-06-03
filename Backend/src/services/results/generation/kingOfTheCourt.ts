import { randomUUID } from 'crypto';
import type { GenGame as Game, GenMatch as Match, GenRound as Round } from './types';
import {
  cloneSets,
  getEligibleParticipants,
  getNumMatches,
  hasPlayers,
  type InitialSets,
  playersPerMatchOf,
} from './matchUtils';

interface CourtResult {
  winners: string[];
  losers: string[];
}

function isRoundComplete(round: Round): boolean {
  const matchesWithPlayers = round.matches.filter(hasPlayers);
  if (matchesWithPlayers.length === 0) return false;
  return matchesWithPlayers.every((match) =>
    match.sets.some((s) => s.teamA > 0 || s.teamB > 0),
  );
}

function getCourtResults(previousRound: Round): CourtResult[] {
  const results: CourtResult[] = [];

  for (const match of previousRound.matches) {
    if (!hasPlayers(match)) continue;

    const validSets = match.sets.filter((s) => s.teamA > 0 || s.teamB > 0);
    if (validSets.length === 0) continue;

    const teamAScore = validSets.reduce((sum, s) => sum + s.teamA, 0);
    const teamBScore = validSets.reduce((sum, s) => sum + s.teamB, 0);

    let winners: string[];
    let losers: string[];

    if (teamAScore === teamBScore) {
      if (Math.random() < 0.5) {
        winners = [...match.teamA];
        losers = [...match.teamB];
      } else {
        winners = [...match.teamB];
        losers = [...match.teamA];
      }
    } else if (teamAScore > teamBScore) {
      winners = [...match.teamA];
      losers = [...match.teamB];
    } else {
      winners = [...match.teamB];
      losers = [...match.teamA];
    }

    results.push({ winners, losers });
  }

  return results;
}

function crossTeams(four: string[]): { teamA: string[]; teamB: string[] } {
  if (four.length < 4) {
    const half = Math.ceil(four.length / 2);
    return { teamA: four.slice(0, half), teamB: four.slice(half) };
  }
  return { teamA: [four[0], four[2]], teamB: [four[1], four[3]] };
}

function dequeue(pool: string[], n: number): string[] {
  if (n <= 0) return [];
  return pool.splice(0, Math.min(n, pool.length));
}

function sortByLevelDesc(participants: ReturnType<typeof getEligibleParticipants>): string[] {
  return [...participants]
    .sort((a, b) => (b.user.level ?? 0) - (a.user.level ?? 0))
    .map((p) => p.userId);
}

function playersInRound(round: Round): Set<string> {
  const ids = new Set<string>();
  for (const match of round.matches) {
    if (!hasPlayers(match)) continue;
    for (const id of [...match.teamA, ...match.teamB]) ids.add(id);
  }
  return ids;
}

function buildFirstRound(
  game: Game,
  participants: ReturnType<typeof getEligibleParticipants>,
  numMatches: number,
  sortedCourts: Array<{ courtId?: string; order: number }>,
  initialSets: InitialSets,
  ppm: 2 | 4,
): Match[] {
  const ordered = sortByLevelDesc(participants);
  const matches: Match[] = [];
  const slotsPerCourt = ppm;

  for (let i = 0; i < numMatches; i++) {
    const slice = ordered.slice(i * slotsPerCourt, (i + 1) * slotsPerCourt);
    if (slice.length < slotsPerCourt) break;

    let teamA: string[];
    let teamB: string[];

    if (ppm === 2) {
      teamA = [slice[0]];
      teamB = [slice[1]];
    } else {
      const teams = crossTeams(slice);
      teamA = teams.teamA;
      teamB = teams.teamB;
    }

    matches.push({
      id: randomUUID(),
      teamA,
      teamB,
      sets: cloneSets(initialSets),
      courtId: sortedCourts[i]?.courtId,
    });
  }

  return matches;
}

function buildChallengerPoolRound(
  game: Game,
  previousRounds: Round[],
  numMatches: number,
  sortedCourts: Array<{ courtId?: string; order: number }>,
  initialSets: InitialSets,
  ppm: 2 | 4,
  allPlayerIds: string[],
): Match[] {
  const lastRound = [...previousRounds].reverse().find(isRoundComplete);
  if (!lastRound) {
    return [];
  }

  const courtResults = getCourtResults(lastRound);
  if (courtResults.length === 0) return [];

  const playedLast = playersInRound(lastRound);
  const pool: string[] = [];

  for (const id of allPlayerIds) {
    if (!playedLast.has(id)) pool.push(id);
  }

  for (let i = 0; i < courtResults.length; i++) {
    if (i === 0) continue;
    pool.push(...courtResults[i].losers);
  }
  if (courtResults[0]) {
    pool.push(...courtResults[0].losers);
  }

  const matches: Match[] = [];
  const challengersNeeded = ppm === 2 ? 1 : 2;

  for (let i = 0; i < numMatches; i++) {
    let teamA: string[] = [];
    let teamB: string[] = [];

    if (i === 0 && courtResults[0]) {
      const kings = courtResults[0].winners.filter(Boolean);
      const challengers = dequeue(pool, challengersNeeded);
      if (ppm === 2) {
        teamA = kings.slice(0, 1);
        teamB = challengers.length > 0 ? [challengers[0]] : dequeue(pool, 1);
      } else if (kings.length >= 2 && challengers.length >= 2) {
        teamA = [kings[0], kings[1]];
        teamB = [challengers[0], challengers[1]];
      } else {
        const courtFour = [...kings, ...challengers, ...dequeue(pool, Math.max(0, 4 - kings.length - challengers.length))].slice(
          0,
          4,
        );
        if (courtFour.length < 4) continue;
        const teams = crossTeams(courtFour);
        teamA = teams.teamA;
        teamB = teams.teamB;
      }
    } else {
      const courtFour = dequeue(pool, ppm);
      if (courtFour.length < ppm) continue;
      if (ppm === 2) {
        teamA = [courtFour[0]];
        teamB = [courtFour[1]];
      } else {
        const teams = crossTeams(courtFour);
        teamA = teams.teamA;
        teamB = teams.teamB;
      }
    }

    if (teamA.length === 0 || teamB.length === 0) continue;

    matches.push({
      id: randomUUID(),
      teamA,
      teamB,
      sets: cloneSets(initialSets),
      courtId: sortedCourts[i]?.courtId,
    });
  }

  return matches;
}

/** Challenger-pool King of the Court: court 0 kings stay; losers re-queue; overflow sits out. */
export function generateKingOfTheCourtRound(
  game: Game,
  previousRounds: Round[],
  initialSets: InitialSets,
): Match[] {
  const participants = getEligibleParticipants(game);
  const ppm = playersPerMatchOf(game);
  if (participants.length < ppm) return [];

  const numMatches = getNumMatches(game, participants);
  if (numMatches === 0) return [];

  const sortedCourts = game.gameCourts
    ? [...game.gameCourts].sort((a, b) => a.order - b.order)
    : [];

  const allPlayerIds = participants.map((p) => p.userId);
  const hasComplete = previousRounds.some(isRoundComplete);

  if (!hasComplete) {
    return buildFirstRound(game, participants, numMatches, sortedCourts, initialSets, ppm);
  }

  return buildChallengerPoolRound(
    game,
    previousRounds,
    numMatches,
    sortedCourts,
    initialSets,
    ppm,
    allPlayerIds,
  );
}
