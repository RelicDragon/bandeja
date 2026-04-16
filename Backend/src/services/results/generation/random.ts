import { randomUUID } from 'crypto';
import type { GenMatch as Match, GenRound as Round, GenGame as Game } from './types';

const createId = () => randomUUID();
import {
  shuffle,
  hasPlayers,
  buildMatchesPlayed,
  buildLastRoundPlayed,
  buildPartnerCounts,
  buildOpponentCounts,
  getEligibleParticipants,
  getNumMatches,
  getFilteredFixedTeams,
  cloneSets,
  pairKey,
  InitialSets,
} from './matchUtils';
import { solveMixOptimalPairs, solveStandardOptimalPairs } from './teammateOptimalPairs';

// ── Recency-based history ──────────────────────────────────────────────

function buildLastTeamRound(rounds: Round[]): Map<string, number> {
  const last = new Map<string, number>();
  for (let r = 0; r < rounds.length; r++) {
    for (const match of rounds[r].matches) {
      if (!hasPlayers(match)) continue;
      for (const team of [match.teamA, match.teamB]) {
        if (team.length >= 2) last.set(pairKey(team[0], team[1]), r);
      }
    }
  }
  return last;
}

function buildLastOpponentRound(rounds: Round[]): Map<string, number> {
  const last = new Map<string, number>();
  for (let r = 0; r < rounds.length; r++) {
    for (const match of rounds[r].matches) {
      if (!hasPlayers(match)) continue;
      for (const a of match.teamA) {
        for (const b of match.teamB) {
          last.set(pairKey(a, b), r);
        }
      }
    }
  }
  return last;
}

// ── Fair benching ──────────────────────────────────────────────────────

function selectByFairBench<T extends { userId: string }>(
  players: T[],
  matchesPlayed: Map<string, number>,
  lastRoundPlayed: Map<string, number>,
  needed: number
): T[] {
  if (players.length <= needed) return players;

  const shuffled = shuffle([...players]);
  shuffled.sort((a, b) => {
    const matchesDiff = (matchesPlayed.get(a.userId) || 0) - (matchesPlayed.get(b.userId) || 0);
    if (matchesDiff !== 0) return matchesDiff;
    // Among players with equal match count, the one who played most recently sits out
    // so the one who sat out most recently (lower lastRound) plays
    return (lastRoundPlayed.get(a.userId) ?? -1) - (lastRoundPlayed.get(b.userId) ?? -1);
  });

  return shuffled.slice(0, needed);
}

function selectPlayersForRound(
  participants: any[],
  matchesPlayed: Map<string, number>,
  lastRoundPlayed: Map<string, number>,
  neededPlayers: number,
  genderTeams?: string
): any[] {
  if (participants.length <= neededPlayers) return participants;

  if (genderTeams === 'MIX_PAIRS') {
    const males = participants.filter((p: any) => p.user.gender === 'MALE');
    const females = participants.filter((p: any) => p.user.gender === 'FEMALE');
    const neededPerGender = neededPlayers / 2;
    return [
      ...selectByFairBench(males, matchesPlayed, lastRoundPlayed, neededPerGender),
      ...selectByFairBench(females, matchesPlayed, lastRoundPlayed, neededPerGender),
    ];
  }

  return selectByFairBench(participants, matchesPlayed, lastRoundPlayed, neededPlayers);
}

// ── Scoring ────────────────────────────────────────────────────────────

interface ConfigScore {
  minTeamStaleness: number;
  minOpponentStaleness: number;
  totalTeamStaleness: number;
  totalOpponentStaleness: number;
  maxTeamFrequency: number;
  totalTeamFrequency: number;
  maxOpponentFrequency: number;
  totalOpponentFrequency: number;
}

type MatchConfig = { teamA: [string, string]; teamB: [string, string] };

function pairStaleness(a: string, b: string, lastRound: Map<string, number>, currentRound: number): number {
  const key = pairKey(a, b);
  return lastRound.has(key) ? currentRound - lastRound.get(key)! : currentRound + 1;
}

type GenBudget = { remaining: number };

function consumeGenOp(budget: GenBudget): boolean {
  if (budget.remaining <= 0) return false;
  budget.remaining--;
  return true;
}

function scoreConfig(
  matches: MatchConfig[],
  partnerCounts: Map<string, number>,
  opponentCounts: Map<string, number>,
  lastTeamRound: Map<string, number>,
  lastOpponentRound: Map<string, number>,
  currentRound: number
): ConfigScore {
  let minTeam = Infinity;
  let minOpp = Infinity;
  let totalTeamStaleness = 0;
  let totalOpponentStaleness = 0;
  let maxTeamFrequency = 0;
  let totalTeamFrequency = 0;
  let maxOpponentFrequency = 0;
  let totalOpponentFrequency = 0;

  for (const match of matches) {
    for (const team of [match.teamA, match.teamB]) {
      const frequency = partnerCounts.get(pairKey(team[0], team[1])) || 0;
      const s = pairStaleness(team[0], team[1], lastTeamRound, currentRound);
      if (s < minTeam) minTeam = s;
      totalTeamStaleness += s;
      if (frequency > maxTeamFrequency) maxTeamFrequency = frequency;
      totalTeamFrequency += frequency;
    }
    for (const a of match.teamA) {
      for (const b of match.teamB) {
        const frequency = opponentCounts.get(pairKey(a, b)) || 0;
        const s = pairStaleness(a, b, lastOpponentRound, currentRound);
        if (s < minOpp) minOpp = s;
        totalOpponentStaleness += s;
        if (frequency > maxOpponentFrequency) maxOpponentFrequency = frequency;
        totalOpponentFrequency += frequency;
      }
    }
  }

  return {
    minTeamStaleness: minTeam,
    minOpponentStaleness: minOpp,
    totalTeamStaleness,
    totalOpponentStaleness,
    maxTeamFrequency,
    totalTeamFrequency,
    maxOpponentFrequency,
    totalOpponentFrequency,
  };
}

function isBetterScore(a: ConfigScore, b: ConfigScore): boolean {
  if (a.minTeamStaleness !== b.minTeamStaleness) return a.minTeamStaleness > b.minTeamStaleness;
  if (a.minOpponentStaleness !== b.minOpponentStaleness) return a.minOpponentStaleness > b.minOpponentStaleness;
  if (a.maxTeamFrequency !== b.maxTeamFrequency) return a.maxTeamFrequency < b.maxTeamFrequency;
  if (a.maxOpponentFrequency !== b.maxOpponentFrequency) return a.maxOpponentFrequency < b.maxOpponentFrequency;
  if (a.totalTeamFrequency !== b.totalTeamFrequency) return a.totalTeamFrequency < b.totalTeamFrequency;
  if (a.totalOpponentFrequency !== b.totalOpponentFrequency) return a.totalOpponentFrequency < b.totalOpponentFrequency;
  if (a.totalTeamStaleness !== b.totalTeamStaleness) return a.totalTeamStaleness > b.totalTeamStaleness;
  return a.totalOpponentStaleness > b.totalOpponentStaleness;
}

// ── Exhaustive search ──────────────────────────────────────────────────

const MAX_GEN_BUDGET = 3_500_000;

// Enumerates all perfect matchings of pairs into 2-team games.
// Optimizations:
//   1. Sorts opponent candidates by cross-staleness DESC → freshest matchups first
//   2. Prunes branches where running min opponent staleness cannot beat best found
//   3. Early-terminates when a perfect score (all pairs never used) is found
function tryAllMatchings(
  pairs: [string, string][],
  partnerCounts: Map<string, number>,
  opponentCounts: Map<string, number>,
  lastTeamRound: Map<string, number>,
  lastOpponentRound: Map<string, number>,
  currentRound: number,
  bestScore: { value: ConfigScore | null },
  bestConfig: { value: MatchConfig[] | null },
  genBudget: GenBudget
): void {
  const current: MatchConfig[] = [];

  function recurse(remaining: [string, string][], runningMinOpp: number) {
    if (!consumeGenOp(genBudget)) return;

    if (remaining.length === 0) {
      const score = scoreConfig(current, partnerCounts, opponentCounts, lastTeamRound, lastOpponentRound, currentRound);
      if (bestScore.value === null || isBetterScore(score, bestScore.value)) {
        bestScore.value = score;
        bestConfig.value = [...current];
      }
      return;
    }

    // Perfect score already found — no config can be better
    if (
      bestScore.value !== null &&
      bestScore.value.minTeamStaleness === currentRound + 1 &&
      bestScore.value.minOpponentStaleness === currentRound + 1 &&
      bestScore.value.maxTeamFrequency === 0 &&
      bestScore.value.maxOpponentFrequency === 0
    ) return;
    // All matchings here share same team pairs; if min opponent staleness already worse, branch cannot improve best
    if (bestScore.value !== null && runningMinOpp < bestScore.value.minOpponentStaleness) return;

    const first = remaining[0];

    // Sort candidates by minimum cross-staleness DESC → try freshest opponent pairings first
    const candidates: { originalIdx: number; minCross: number }[] = [];
    for (let i = 1; i < remaining.length; i++) {
      const opp = remaining[i];
      let minCross = Infinity;
      for (const a of first) {
        for (const b of opp) {
          const s = pairStaleness(a, b, lastOpponentRound, currentRound);
          if (s < minCross) minCross = s;
        }
      }
      candidates.push({ originalIdx: i, minCross });
    }
    candidates.sort((a, b) => b.minCross - a.minCross);

    for (const { originalIdx, minCross } of candidates) {
      const newMinOpp = Math.min(runningMinOpp, minCross);
      if (bestScore.value !== null && newMinOpp < bestScore.value.minOpponentStaleness) break;
      current.push({ teamA: first, teamB: remaining[originalIdx] });
      const next = remaining.filter((_, idx) => idx !== 0 && idx !== originalIdx);
      recurse(next, newMinOpp);
      current.pop();
    }
  }

  recurse(pairs, Infinity);
}

function optimizeOpponentsForPairs(
  pairs: [string, string][],
  partnerCounts: Map<string, number>,
  opponentCounts: Map<string, number>,
  lastTeamRound: Map<string, number>,
  lastOpponentRound: Map<string, number>,
  currentRound: number,
  genBudget: GenBudget
): MatchConfig[] {
  const bestScore: { value: ConfigScore | null } = { value: null };
  const bestConfig: { value: MatchConfig[] | null } = { value: null };
  tryAllMatchings(
    pairs,
    partnerCounts,
    opponentCounts,
    lastTeamRound,
    lastOpponentRound,
    currentRound,
    bestScore,
    bestConfig,
    genBudget
  );
  return bestConfig.value ?? [];
}

// ── Fixed teams ────────────────────────────────────────────────────────

function selectTeamsForRound(
  teams: string[][],
  matchesPlayed: Map<string, number>,
  lastRoundPlayed: Map<string, number>,
  neededTeams: number
): string[][] {
  if (teams.length <= neededTeams) return teams;

  const scored = shuffle(
    teams.map(team => ({
      team,
      totalPlayed: team.reduce((sum, id) => sum + (matchesPlayed.get(id) || 0), 0),
      lastPlayed: team.reduce((max, id) => Math.max(max, lastRoundPlayed.get(id) ?? -1), -1),
    }))
  );

  scored.sort((a, b) => {
    if (a.totalPlayed !== b.totalPlayed) return a.totalPlayed - b.totalPlayed;
    return a.lastPlayed - b.lastPlayed;
  });

  return scored.slice(0, neededTeams).map(s => s.team);
}

function generateFixedTeamMatchups(
  fixedTeams: string[][],
  lastOpponentRound: Map<string, number>,
  currentRound: number,
  numMatches: number
): { teamA: string[]; teamB: string[] }[] {
  interface Candidate {
    teamAIdx: number;
    teamBIdx: number;
    minOppStaleness: number;
    totalOppStaleness: number;
  }

  const candidates: Candidate[] = [];

  for (let i = 0; i < fixedTeams.length - 1; i++) {
    for (let j = i + 1; j < fixedTeams.length; j++) {
      const tA = fixedTeams[i];
      const tB = fixedTeams[j];
      let minOpp = Infinity;
      let totalOpp = 0;
      for (const a of tA) {
        for (const b of tB) {
          const s = pairStaleness(a, b, lastOpponentRound, currentRound);
          if (s < minOpp) minOpp = s;
          totalOpp += s;
        }
      }
      candidates.push({ teamAIdx: i, teamBIdx: j, minOppStaleness: minOpp, totalOppStaleness: totalOpp });
    }
  }

  // Highest minOppStaleness first (freshest opponents), totalOppStaleness as tiebreaker
  const sorted = shuffle(candidates).sort((a, b) => {
    if (a.minOppStaleness !== b.minOppStaleness) return b.minOppStaleness - a.minOppStaleness;
    return b.totalOppStaleness - a.totalOppStaleness;
  });

  const selected: { teamA: string[]; teamB: string[] }[] = [];
  const usedTeams = new Set<number>();

  for (const c of sorted) {
    if (selected.length >= numMatches) break;
    if (usedTeams.has(c.teamAIdx) || usedTeams.has(c.teamBIdx)) continue;
    selected.push({ teamA: fixedTeams[c.teamAIdx], teamB: fixedTeams[c.teamBIdx] });
    usedTeams.add(c.teamAIdx);
    usedTeams.add(c.teamBIdx);
  }

  return selected;
}

// ── Entry point ────────────────────────────────────────────────────────

export function generateRandomRound(
  game: Game,
  previousRounds: Round[],
  initialSets: InitialSets
): Match[] {
  const participants = getEligibleParticipants(game);
  if (participants.length < 4) return [];

  const numMatches = getNumMatches(game, participants);
  if (numMatches === 0) return [];

  const sortedCourts = game.gameCourts
    ? [...game.gameCourts].sort((a, b) => a.order - b.order)
    : [];

  const currentRound = previousRounds.length;
  const allPlayerIds = participants.map(p => p.userId);
  const matchesPlayed = buildMatchesPlayed(allPlayerIds, previousRounds);
  const lastRoundPlayed = buildLastRoundPlayed(allPlayerIds, previousRounds);
  const partnerCounts = buildPartnerCounts(previousRounds);
  const opponentCounts = buildOpponentCounts(previousRounds);
  const lastTeamRound = buildLastTeamRound(previousRounds);
  const lastOpponentRound = buildLastOpponentRound(previousRounds);

  // ── Fixed teams path ──
  if (game.hasFixedTeams && game.fixedTeams && game.fixedTeams.length > 0) {
    const fixedTeamPairs = getFilteredFixedTeams(game);
    const neededTeams = numMatches * 2;
    const selectedTeams = selectTeamsForRound(fixedTeamPairs, matchesPlayed, lastRoundPlayed, neededTeams);
    const matchups = generateFixedTeamMatchups(selectedTeams, lastOpponentRound, currentRound, numMatches);

    return matchups.map((m, idx) => ({
      id: createId(),
      teamA: m.teamA,
      teamB: m.teamB,
      sets: cloneSets(initialSets),
      courtId: sortedCourts[idx]?.courtId,
    }));
  }

  // ── Dynamic teams path ──
  const neededPlayers = numMatches * 4;
  const selectedParticipants = selectPlayersForRound(
    participants, matchesPlayed, lastRoundPlayed, neededPlayers, game.genderTeams
  );

  let matchups: MatchConfig[];

  const genBudget: GenBudget = { remaining: MAX_GEN_BUDGET };

  if (game.genderTeams === 'MIX_PAIRS') {
    const maleIds = selectedParticipants
      .filter((p: any) => p.user.gender === 'MALE')
      .map((p: any) => p.userId);
    const femaleIds = selectedParticipants
      .filter((p: any) => p.user.gender === 'FEMALE')
      .map((p: any) => p.userId);
    const nMix = Math.min(maleIds.length, femaleIds.length);
    const teamPairs = solveMixOptimalPairs(
      maleIds.slice(0, nMix),
      femaleIds.slice(0, nMix),
      partnerCounts
    );
    matchups = teamPairs
      ? optimizeOpponentsForPairs(
          teamPairs,
          partnerCounts,
          opponentCounts,
          lastTeamRound,
          lastOpponentRound,
          currentRound,
          genBudget
        )
      : [];
  } else {
    const playerIds = shuffle(selectedParticipants.map((p: any) => p.userId));
    const teamPairs = solveStandardOptimalPairs(playerIds, partnerCounts);
    matchups = teamPairs
      ? optimizeOpponentsForPairs(
          teamPairs,
          partnerCounts,
          opponentCounts,
          lastTeamRound,
          lastOpponentRound,
          currentRound,
          genBudget
        )
      : [];
  }

  if (matchups.length === 0) return [];

  return matchups.map((m, idx) => ({
    id: createId(),
    teamA: m.teamA,
    teamB: m.teamB,
    sets: cloneSets(initialSets),
    courtId: sortedCourts[idx]?.courtId,
  }));
}
