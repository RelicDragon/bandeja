import { createId } from '@paralleldrive/cuid2';
import { Match, Round } from '@/types/gameResults';
import { Game } from '@/types';

function pairKey(a: string, b: string): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function hasPlayers(match: Match): boolean {
  return match.teamA.length > 0 && match.teamB.length > 0;
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

function buildMatchesPlayed(playerIds: string[], rounds: Round[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of playerIds) counts.set(id, 0);
  for (const round of rounds) {
    for (const match of round.matches) {
      if (!hasPlayers(match)) continue;
      for (const id of [...match.teamA, ...match.teamB]) {
        if (counts.has(id)) counts.set(id, counts.get(id)! + 1);
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

function selectTeamPairs(
  pool: PairCandidate[],
  allPairs: PairCandidate[],
  matchesPlayed: Map<string, number>,
  neededPairs: number,
  teammateHistory: Map<string, number>
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

  return best;
}

function formMatchups(
  pairs: [string, string][],
  opponentHistory: Map<string, number>
): { teamA: [string, string]; teamB: [string, string] }[] {
  const matches: { teamA: [string, string]; teamB: [string, string] }[] = [];
  const shuffledPairs = shuffle([...pairs]);
  const used = new Set<number>();

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
    }
  }

  return matches;
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

function getEligibleParticipants(game: Game) {
  let participants = game.participants.filter(p => p.status === 'PLAYING');

  if (game.genderTeams === 'MEN') {
    participants = participants.filter(p => p.user.gender === 'MALE');
  } else if (game.genderTeams === 'WOMEN') {
    participants = participants.filter(p => p.user.gender === 'FEMALE');
  } else if (game.genderTeams === 'MIX_PAIRS') {
    participants = participants.filter(p =>
      p.user.gender === 'MALE' || p.user.gender === 'FEMALE'
    );
  } else if (game.genderTeams && game.genderTeams !== 'ANY') {
    participants = participants.filter(p => p.user.gender !== 'PREFER_NOT_TO_SAY');
  }

  return participants;
}

function getNumMatches(game: Game, participants: any[]): number {
  const numCourts = game.gameCourts?.length || 1;

  if (game.genderTeams === 'MIX_PAIRS') {
    const males = participants.filter((p: any) => p.user.gender === 'MALE').length;
    const females = participants.filter((p: any) => p.user.gender === 'FEMALE').length;
    return Math.min(numCourts, Math.floor(Math.min(males, females) / 2));
  }

  return Math.min(numCourts, Math.floor(participants.length / 4));
}

function getFilteredFixedTeams(game: Game): string[][] {
  const teams = (game.fixedTeams || []).filter(t => t.players.length >= 2);

  if (game.genderTeams === 'MEN') {
    return teams
      .filter(t => t.players.every(p => p.user.gender === 'MALE'))
      .map(t => t.players.map(p => p.userId));
  }
  if (game.genderTeams === 'WOMEN') {
    return teams
      .filter(t => t.players.every(p => p.user.gender === 'FEMALE'))
      .map(t => t.players.map(p => p.userId));
  }
  if (game.genderTeams === 'MIX_PAIRS') {
    return teams
      .filter(t => {
        const g = t.players.map(p => p.user.gender);
        return g.includes('MALE') && g.includes('FEMALE');
      })
      .map(t => t.players.map(p => p.userId));
  }
  if (game.genderTeams && game.genderTeams !== 'ANY') {
    return teams
      .filter(t => t.players.every(p => p.user.gender !== 'PREFER_NOT_TO_SAY'))
      .map(t => t.players.map(p => p.userId));
  }

  return teams.map(t => t.players.map(p => p.userId));
}

export function generateRandomRound(
  game: Game,
  previousRounds: Round[],
  initialSets: Array<{ teamA: number; teamB: number }>
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
    const matchups = generateFixedTeamMatchups(fixedTeamPairs, matchesPlayed, opponentHistory, numMatches);

    return matchups.map((m, idx) => ({
      id: createId(),
      teamA: m.teamA,
      teamB: m.teamB,
      sets: initialSets,
      courtId: sortedCourts[idx]?.courtId,
    }));
  }

  const teammateHistory = buildTeammateHistory(previousRounds);
  const lastRoundKeys = getLastRoundTeamKeys(previousRounds);
  const allPairs = generateAllPossiblePairs(participants, game.genderTeams);

  if (allPairs.length === 0) return [];

  const pool = buildPairPool(allPairs, teammateHistory, lastRoundKeys);
  const neededPairs = numMatches * 2;
  const teamPairs = selectTeamPairs(pool, allPairs, matchesPlayed, neededPairs, teammateHistory);

  if (teamPairs.length < 2) return [];

  const pairsToMatch = teamPairs.length % 2 === 0 ? teamPairs : teamPairs.slice(0, -1);
  const matchups = formMatchups(pairsToMatch, opponentHistory);

  return matchups.map((m, idx) => ({
    id: createId(),
    teamA: m.teamA,
    teamB: m.teamB,
    sets: initialSets,
    courtId: sortedCourts[idx]?.courtId,
  }));
}
