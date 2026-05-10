import type { GenGame as Game, GenMatch as Match, GenRound as Round, GenFixedTeam } from './types';

export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function hasPlayers(match: Match): boolean {
  return match.teamA.length > 0 && match.teamB.length > 0;
}

export function buildMatchesPlayed(playerIds: string[], rounds: Round[]): Map<string, number> {
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

export function getEligibleParticipants(game: Game) {
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

export function getNumMatches(game: Game, participants: any[]): number {
  const numCourts = game.gameCourts?.length || 1;

  if (game.genderTeams === 'MIX_PAIRS') {
    const males = participants.filter((p: any) => p.user.gender === 'MALE').length;
    const females = participants.filter((p: any) => p.user.gender === 'FEMALE').length;
    return Math.min(numCourts, Math.floor(Math.min(males, females) / 2));
  }

  return Math.min(numCourts, Math.floor(participants.length / 4));
}

export type InitialSets = Array<{ teamA: number; teamB: number; isTieBreak?: boolean }>;

export function cloneSets(sets: InitialSets): InitialSets {
  return sets.map(s => ({ ...s }));
}

export function buildLastRoundPlayed(playerIds: string[], rounds: Round[]): Map<string, number> {
  const lastPlayed = new Map<string, number>();
  for (const id of playerIds) lastPlayed.set(id, -1);
  for (let r = 0; r < rounds.length; r++) {
    for (const match of rounds[r].matches) {
      if (!hasPlayers(match)) continue;
      for (const id of [...match.teamA, ...match.teamB]) {
        if (lastPlayed.has(id)) lastPlayed.set(id, r);
      }
    }
  }
  return lastPlayed;
}

export function pairKey(id1: string, id2: string): string {
  return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
}

export function rosterMultisetKey(ids: string[]): string {
  return [...ids].sort().join('\x01');
}

export function resolveMatchSideToFixedTeamRoster(matchSide: string[], candidates: string[][]): string[] {
  if (matchSide.length === 0 || candidates.length === 0) return [...matchSide];
  const key = rosterMultisetKey(matchSide);
  const found = candidates.find(t => rosterMultisetKey(t) === key);
  return found ? [...found] : [...matchSide];
}

export function fixedTeamIdsForRosterPair(
  teamA: string[],
  teamB: string[],
  fixedTeams: GenFixedTeam[] | undefined
): Pick<Match, 'fixedTeamIdA' | 'fixedTeamIdB'> {
  if (!fixedTeams?.length) return {};
  const idForRoster = (roster: string[]): string | undefined => {
    if (roster.length === 0) return undefined;
    const k = rosterMultisetKey(roster);
    const hits = fixedTeams.filter(
      ft => rosterMultisetKey(ft.players.map(p => p.userId)) === k
    );
    if (hits.length === 0) return undefined;
    if (hits.length === 1) return hits[0].id;
    return [...hits].sort((a, b) => a.teamNumber - b.teamNumber)[0].id;
  };
  return {
    fixedTeamIdA: idForRoster(teamA),
    fixedTeamIdB: idForRoster(teamB),
  };
}

export function attachFixedTeamIdsToMatch(match: Match, game: Game): Match {
  if (!game.hasFixedTeams || !game.fixedTeams?.length) return match;
  return { ...match, ...fixedTeamIdsForRosterPair(match.teamA, match.teamB, game.fixedTeams) };
}

export function resolveFixedTeamRosterFromGame(
  matchSide: string[],
  fixedTeams: GenFixedTeam[] | undefined,
  hintFixedTeamId?: string | null,
  stringCandidatesFallback?: string[][]
): string[] {
  if (matchSide.length === 0) return [];
  if (fixedTeams?.length) {
    if (hintFixedTeamId) {
      const ft = fixedTeams.find(t => t.id === hintFixedTeamId);
      if (ft) {
        const sideK = rosterMultisetKey(matchSide);
        const ftK = rosterMultisetKey(ft.players.map(p => p.userId));
        if (sideK === ftK) {
          return ft.players.map(p => p.userId);
        }
      }
    }
    const sideK = rosterMultisetKey(matchSide);
    const hits = fixedTeams.filter(
      ft => rosterMultisetKey(ft.players.map(p => p.userId)) === sideK
    );
    if (hits.length >= 1) {
      const chosen =
        hits.length === 1 ? hits[0] : [...hits].sort((a, b) => a.teamNumber - b.teamNumber)[0];
      return chosen.players.map(p => p.userId);
    }
  }
  if (stringCandidatesFallback?.length) {
    return resolveMatchSideToFixedTeamRoster(matchSide, stringCandidatesFallback);
  }
  return [...matchSide];
}

export function opponentPairFrequency(map: Map<string, number>, a: string, b: string): number {
  if (a === b) return 0;
  return map.get(pairKey(a, b)) || 0;
}

export function buildPartnerCounts(rounds: Round[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const round of rounds) {
    for (const match of round.matches) {
      if (!hasPlayers(match)) continue;
      for (const team of [match.teamA, match.teamB]) {
        for (let i = 0; i < team.length; i++) {
          for (let j = i + 1; j < team.length; j++) {
            const key = pairKey(team[i], team[j]);
            counts.set(key, (counts.get(key) || 0) + 1);
          }
        }
      }
    }
  }
  return counts;
}

export function buildOpponentCounts(rounds: Round[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const round of rounds) {
    for (const match of round.matches) {
      if (!hasPlayers(match)) continue;
      for (const a of match.teamA) {
        for (const b of match.teamB) {
          if (a === b) continue;
          const key = pairKey(a, b);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
  }
  return counts;
}

export function getFilteredFixedTeams(game: Game): string[][] {
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
