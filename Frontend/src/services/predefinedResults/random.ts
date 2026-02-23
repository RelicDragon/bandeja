import { createId } from '@paralleldrive/cuid2';
import { Match, Round } from '@/types/gameResults';
import { Game } from '@/types';
import {
  shuffle,
  hasPlayers,
  buildMatchesPlayed,
  getEligibleParticipants,
  getNumMatches,
  getFilteredFixedTeams,
  cloneSets,
  InitialSets,
} from './matchUtils';

function pairKey(a: string, b: string): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function buildTeammateHistory(rounds: Round[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const round of rounds) {
    for (const match of round.matches) {
      if (!hasPlayers(match)) continue;
      for (const team of [match.teamA, match.teamB]) {
        if (team.length >= 2) {
          const key = pairKey(team[0], team[1]);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
  }
  return counts;
}

function buildOpponentHistory(rounds: Round[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const round of rounds) {
    for (const match of round.matches) {
      if (!hasPlayers(match)) continue;
      for (const a of match.teamA) {
        for (const b of match.teamB) {
          const key = pairKey(a, b);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
  }
  return counts;
}

function getLastRoundTeamKeys(rounds: Round[]): Set<string> {
  const keys = new Set<string>();
  if (rounds.length === 0) return keys;
  const last = rounds[rounds.length - 1];
  for (const match of last.matches) {
    if (!hasPlayers(match)) continue;
    for (const team of [match.teamA, match.teamB]) {
      if (team.length >= 2) keys.add(pairKey(team[0], team[1]));
    }
  }
  return keys;
}

interface PairCandidate {
  pair: [string, string];
  key: string;
}

function generateAllPossiblePairs(
  participants: any[],
  genderTeams?: string
): PairCandidate[] {
  const pairs: PairCandidate[] = [];

  if (genderTeams === 'MIX_PAIRS') {
    const males = participants.filter((p: any) => p.user.gender === 'MALE');
    const females = participants.filter((p: any) => p.user.gender === 'FEMALE');
    for (const m of males) {
      for (const f of females) {
        pairs.push({ pair: [m.userId, f.userId], key: pairKey(m.userId, f.userId) });
      }
    }
  } else {
    for (let i = 0; i < participants.length - 1; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        const a = participants[i].userId;
        const b = participants[j].userId;
        pairs.push({ pair: [a, b], key: pairKey(a, b) });
      }
    }
  }

  return pairs;
}

function buildPairPool(
  allPairs: PairCandidate[],
  teammateHistory: Map<string, number>,
  lastRoundKeys: Set<string>
): PairCandidate[] {
  if (allPairs.length === 0) return [];

  let minCount = Infinity;
  for (const { key } of allPairs) {
    const count = teammateHistory.get(key) || 0;
    if (count < minCount) minCount = count;
  }

  const minPool = allPairs.filter(p => (teammateHistory.get(p.key) || 0) === minCount);

  if (lastRoundKeys.size === 0) return minPool;

  const filtered = minPool.filter(p => !lastRoundKeys.has(p.key));
  return filtered.length > 0 ? filtered : minPool;
}

function selectFromPool(
  pool: PairCandidate[],
  matchesPlayed: Map<string, number>,
  neededPairs: number,
  teammateHistory?: Map<string, number>
): [string, string][] {
  const selected: [string, string][] = [];
  const usedPlayers = new Set<string>();

  const playerSet = new Set<string>();
  for (const { pair } of pool) {
    playerSet.add(pair[0]);
    playerSet.add(pair[1]);
  }

  const sortedPlayers = shuffle([...playerSet]).sort(
    (a, b) => (matchesPlayed.get(a) || 0) - (matchesPlayed.get(b) || 0)
  );

  const playerPairsMap = new Map<string, PairCandidate[]>();
  for (const p of pool) {
    for (const id of p.pair) {
      if (!playerPairsMap.has(id)) playerPairsMap.set(id, []);
      playerPairsMap.get(id)!.push(p);
    }
  }

  for (const player of sortedPlayers) {
    if (selected.length >= neededPairs) break;
    if (usedPlayers.has(player)) continue;

    const candidates = (playerPairsMap.get(player) || [])
      .filter(p => !usedPlayers.has(p.pair[0]) && !usedPlayers.has(p.pair[1]));

    if (candidates.length === 0) continue;

    const sorted = shuffle(candidates).sort((a, b) => {
      const partnerA = a.pair[0] === player ? a.pair[1] : a.pair[0];
      const partnerB = b.pair[0] === player ? b.pair[1] : b.pair[0];
      const matchDiff = (matchesPlayed.get(partnerA) || 0) - (matchesPlayed.get(partnerB) || 0);
      if (matchDiff !== 0) return matchDiff;
      if (teammateHistory) {
        return (teammateHistory.get(a.key) || 0) - (teammateHistory.get(b.key) || 0);
      }
      return 0;
    });

    selected.push(sorted[0].pair);
    usedPlayers.add(sorted[0].pair[0]);
    usedPlayers.add(sorted[0].pair[1]);
  }

  return selected;
}

const SELECTION_RETRIES = 20;

function fallbackPairsByPlayCount(
  allPairs: PairCandidate[],
  matchesPlayed: Map<string, number>,
  neededPairs: number,
  genderTeams?: string
): [string, string][] {
  const playerSet = new Set<string>();
  for (const { pair } of allPairs) {
    playerSet.add(pair[0]);
    playerSet.add(pair[1]);
  }

  const sortedPlayers = shuffle([...playerSet]).sort(
    (a, b) => (matchesPlayed.get(a) || 0) - (matchesPlayed.get(b) || 0)
  );

  const neededPlayers = neededPairs * 2;
  const selected = sortedPlayers.slice(0, neededPlayers);
  const pairs: [string, string][] = [];

  if (genderTeams === 'MIX_PAIRS') {
    const pairLookup = new Set(allPairs.map(p => p.key));
    const used = new Set<string>();
    for (const a of selected) {
      if (used.has(a)) continue;
      for (const b of selected) {
        if (a === b || used.has(b)) continue;
        if (pairLookup.has(pairKey(a, b))) {
          pairs.push([a, b]);
          used.add(a);
          used.add(b);
          break;
        }
      }
      if (pairs.length >= neededPairs) break;
    }
  } else {
    for (let i = 0; i + 1 < selected.length && pairs.length < neededPairs; i += 2) {
      pairs.push([selected[i], selected[i + 1]]);
    }
  }

  return pairs;
}

function selectTeamPairs(
  pool: PairCandidate[],
  allPairs: PairCandidate[],
  matchesPlayed: Map<string, number>,
  neededPairs: number,
  teammateHistory: Map<string, number>,
  genderTeams?: string
): [string, string][] {
  let best: [string, string][] = [];

  for (let i = 0; i < SELECTION_RETRIES; i++) {
    const result = selectFromPool(pool, matchesPlayed, neededPairs, teammateHistory);
    if (result.length === neededPairs) return result;
    if (result.length > best.length) best = result;
  }

  const minCount = allPairs.reduce(
    (min, p) => Math.min(min, teammateHistory.get(p.key) || 0), Infinity
  );
  const fullMinPool = allPairs.filter(p => (teammateHistory.get(p.key) || 0) === minCount);

  if (fullMinPool.length > pool.length) {
    for (let i = 0; i < SELECTION_RETRIES; i++) {
      const result = selectFromPool(fullMinPool, matchesPlayed, neededPairs, teammateHistory);
      if (result.length === neededPairs) return result;
      if (result.length > best.length) best = result;
    }
  }

  const levels = [...new Set(allPairs.map(p => teammateHistory.get(p.key) || 0))].sort((a, b) => a - b);

  for (const level of levels) {
    if (level <= minCount) continue;
    const expanded = allPairs.filter(p => (teammateHistory.get(p.key) || 0) <= level);
    for (let i = 0; i < SELECTION_RETRIES; i++) {
      const result = selectFromPool(expanded, matchesPlayed, neededPairs, teammateHistory);
      if (result.length === neededPairs) return result;
      if (result.length > best.length) best = result;
    }
  }

  if (best.length < neededPairs) {
    const fallback = fallbackPairsByPlayCount(allPairs, matchesPlayed, neededPairs, genderTeams);
    if (fallback.length > best.length) best = fallback;
  }

  return best;
}

const MATCHUP_ATTEMPTS = 10;

function formMatchupsOnce(
  pairs: [string, string][],
  opponentHistory: Map<string, number>
): { matches: { teamA: [string, string]; teamB: [string, string] }[]; totalScore: number } {
  const matches: { teamA: [string, string]; teamB: [string, string] }[] = [];
  const shuffledPairs = shuffle([...pairs]);
  const used = new Set<number>();
  let totalScore = 0;

  for (let i = 0; i < shuffledPairs.length; i++) {
    if (used.has(i)) continue;

    const team1 = shuffledPairs[i];
    let bestScore = Infinity;
    const candidates: number[] = [];

    for (let j = i + 1; j < shuffledPairs.length; j++) {
      if (used.has(j)) continue;

      let score = 0;
      for (const a of team1) {
        for (const b of shuffledPairs[j]) {
          score += opponentHistory.get(pairKey(a, b)) || 0;
        }
      }

      if (score < bestScore) {
        bestScore = score;
        candidates.length = 0;
        candidates.push(j);
      } else if (score === bestScore) {
        candidates.push(j);
      }
    }

    if (candidates.length > 0) {
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      used.add(i);
      used.add(chosen);
      matches.push({ teamA: team1, teamB: shuffledPairs[chosen] });
      totalScore += bestScore;
    }
  }

  return { matches, totalScore };
}

function formMatchups(
  pairs: [string, string][],
  opponentHistory: Map<string, number>
): { teamA: [string, string]; teamB: [string, string] }[] {
  let bestResult = formMatchupsOnce(pairs, opponentHistory);

  for (let i = 1; i < MATCHUP_ATTEMPTS; i++) {
    const attempt = formMatchupsOnce(pairs, opponentHistory);
    if (
      attempt.matches.length > bestResult.matches.length ||
      (attempt.matches.length === bestResult.matches.length && attempt.totalScore < bestResult.totalScore)
    ) {
      bestResult = attempt;
    }
  }

  return bestResult.matches;
}

function generateFixedTeamMatchups(
  fixedTeams: string[][],
  matchesPlayed: Map<string, number>,
  opponentHistory: Map<string, number>,
  numMatches: number
): { teamA: string[]; teamB: string[] }[] {
  const allMatchups: {
    teamAIdx: number;
    teamBIdx: number;
    balanceScore: number;
    opponentScore: number;
  }[] = [];

  for (let i = 0; i < fixedTeams.length - 1; i++) {
    for (let j = i + 1; j < fixedTeams.length; j++) {
      const tA = fixedTeams[i];
      const tB = fixedTeams[j];

      const balanceScore = [...tA, ...tB].reduce(
        (sum, id) => sum + (matchesPlayed.get(id) || 0), 0
      );

      let opponentScore = 0;
      for (const a of tA) {
        for (const b of tB) {
          opponentScore += opponentHistory.get(pairKey(a, b)) || 0;
        }
      }

      allMatchups.push({ teamAIdx: i, teamBIdx: j, balanceScore, opponentScore });
    }
  }

  const sorted = shuffle(allMatchups).sort((a, b) => {
    if (a.balanceScore !== b.balanceScore) return a.balanceScore - b.balanceScore;
    return a.opponentScore - b.opponentScore;
  });

  const selected: { teamA: string[]; teamB: string[] }[] = [];
  const usedTeams = new Set<number>();

  for (const m of sorted) {
    if (selected.length >= numMatches) break;
    if (usedTeams.has(m.teamAIdx) || usedTeams.has(m.teamBIdx)) continue;
    selected.push({ teamA: fixedTeams[m.teamAIdx], teamB: fixedTeams[m.teamBIdx] });
    usedTeams.add(m.teamAIdx);
    usedTeams.add(m.teamBIdx);
  }

  return selected;
}

function selectByLeastPlayed<T extends { userId: string }>(
  players: T[],
  matchesPlayed: Map<string, number>,
  needed: number
): T[] {
  if (players.length <= needed) return players;

  const shuffled = shuffle([...players]);
  shuffled.sort(
    (a, b) => (matchesPlayed.get(a.userId) || 0) - (matchesPlayed.get(b.userId) || 0)
  );

  return shuffled.slice(0, needed);
}

function selectPlayersForRound(
  participants: any[],
  matchesPlayed: Map<string, number>,
  neededPlayers: number,
  genderTeams?: string
): any[] {
  if (participants.length <= neededPlayers) return participants;

  if (genderTeams === 'MIX_PAIRS') {
    const males = participants.filter((p: any) => p.user.gender === 'MALE');
    const females = participants.filter((p: any) => p.user.gender === 'FEMALE');
    const neededPerGender = neededPlayers / 2;
    return [
      ...selectByLeastPlayed(males, matchesPlayed, neededPerGender),
      ...selectByLeastPlayed(females, matchesPlayed, neededPerGender),
    ];
  }

  return selectByLeastPlayed(participants, matchesPlayed, neededPlayers);
}

function selectTeamsForRound(
  teams: string[][],
  matchesPlayed: Map<string, number>,
  neededTeams: number
): string[][] {
  if (teams.length <= neededTeams) return teams;

  const withPlayCount = teams.map(team => ({
    team,
    totalPlayed: team.reduce((sum, id) => sum + (matchesPlayed.get(id) || 0), 0),
  }));

  const shuffled = shuffle(withPlayCount);
  shuffled.sort((a, b) => a.totalPlayed - b.totalPlayed);

  return shuffled.slice(0, neededTeams).map(t => t.team);
}

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

  const allPlayerIds = participants.map(p => p.userId);
  const matchesPlayed = buildMatchesPlayed(allPlayerIds, previousRounds);
  const opponentHistory = buildOpponentHistory(previousRounds);

  if (game.hasFixedTeams && game.fixedTeams && game.fixedTeams.length > 0) {
    const fixedTeamPairs = getFilteredFixedTeams(game);
    const neededTeams = numMatches * 2;
    const selectedTeams = selectTeamsForRound(fixedTeamPairs, matchesPlayed, neededTeams);
    const matchups = generateFixedTeamMatchups(selectedTeams, matchesPlayed, opponentHistory, numMatches);

    return matchups.map((m, idx) => ({
      id: createId(),
      teamA: m.teamA,
      teamB: m.teamB,
      sets: cloneSets(initialSets),
      courtId: sortedCourts[idx]?.courtId,
    }));
  }

  const neededPlayers = numMatches * 4;
  const selectedParticipants = selectPlayersForRound(
    participants, matchesPlayed, neededPlayers, game.genderTeams
  );

  const teammateHistory = buildTeammateHistory(previousRounds);
  const lastRoundKeys = getLastRoundTeamKeys(previousRounds);
  const allPairs = generateAllPossiblePairs(selectedParticipants, game.genderTeams);

  if (allPairs.length === 0) return [];

  const pool = buildPairPool(allPairs, teammateHistory, lastRoundKeys);
  const neededPairs = numMatches * 2;
  const teamPairs = selectTeamPairs(pool, allPairs, matchesPlayed, neededPairs, teammateHistory, game.genderTeams);

  if (teamPairs.length < 2) return [];

  let pairsToMatch: [string, string][];
  if (teamPairs.length % 2 === 0) {
    pairsToMatch = teamPairs;
  } else {
    const byPlayCount = [...teamPairs].sort(
      (a, b) =>
        (matchesPlayed.get(b[0]) || 0) + (matchesPlayed.get(b[1]) || 0) -
        ((matchesPlayed.get(a[0]) || 0) + (matchesPlayed.get(a[1]) || 0))
    );
    pairsToMatch = byPlayCount.slice(1);
  }
  const matchups = formMatchups(pairsToMatch, opponentHistory);

  return matchups.map((m, idx) => ({
    id: createId(),
    teamA: m.teamA,
    teamB: m.teamB,
    sets: cloneSets(initialSets),
    courtId: sortedCourts[idx]?.courtId,
  }));
}
