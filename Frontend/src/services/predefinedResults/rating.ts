import { Match, Round } from '@/types/gameResults';
import { Game } from '@/types';
import { createId } from '@paralleldrive/cuid2';
import { calculateGameStandings } from '../gameStandings';
import {
  getEligibleParticipants,
  getNumMatches,
  getFilteredFixedTeams,
  buildMatchesPlayed,
  shuffle,
} from './matchUtils';

export function generateRatingRound(
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

  if (game.hasFixedTeams && game.fixedTeams && game.fixedTeams.length > 0) {
    return generateFixedTeamRatingRound(game, previousRounds, initialSets, sortedCourts, numMatches);
  }

  if (game.genderTeams === 'MIX_PAIRS') {
    return generateMixPairsRatingRound(game, previousRounds, initialSets, sortedCourts, numMatches, participants);
  }

  return generateStandardRatingRound(game, previousRounds, initialSets, sortedCourts, numMatches, participants);
}

function selectPlayersWithRotation(
  standingsSortedIds: string[],
  needed: number,
  previousRounds: Round[]
): string[] {
  const matchesPlayed = buildMatchesPlayed(standingsSortedIds, previousRounds);
  const indexed = standingsSortedIds.map((id, rank) => ({
    id,
    rank,
    played: matchesPlayed.get(id) || 0,
  }));

  indexed.sort((a, b) => {
    const playedDiff = a.played - b.played;
    if (playedDiff !== 0) return playedDiff;
    return a.rank - b.rank;
  });

  const selected = indexed.slice(0, needed);
  selected.sort((a, b) => a.rank - b.rank);
  return selected.map(s => s.id);
}

function getStandingsPlayerIds(
  game: Game,
  previousRounds: Round[],
  participants: any[]
): string[] {
  const standings = calculateGameStandings(
    game,
    previousRounds,
    game.winnerOfGame || 'BY_SCORES_DELTA'
  );
  const eligibleIds = new Set(participants.map((p: any) => p.userId));
  const fromStandings = standings
    .filter(s => eligibleIds.has(s.user.id))
    .map(s => s.user.id);

  // Append any eligible players missing from standings (e.g. joined mid-game)
  for (const p of participants) {
    if (!fromStandings.includes(p.userId)) {
      fromStandings.push(p.userId);
    }
  }
  return fromStandings;
}

function generateStandardRatingRound(
  game: Game,
  previousRounds: Round[],
  initialSets: Array<{ teamA: number; teamB: number }>,
  sortedCourts: Array<{ courtId?: string; order: number }>,
  numMatches: number,
  participants: any[]
): Match[] {
  const neededPlayers = numMatches * 4;

  let playerIds: string[];
  if (previousRounds.length === 0) {
    playerIds = shuffle(participants.map((p: any) => p.userId));
  } else {
    playerIds = getStandingsPlayerIds(game, previousRounds, participants);
  }

  if (playerIds.length > neededPlayers) {
    playerIds = selectPlayersWithRotation(playerIds, neededPlayers, previousRounds);
  }

  const matches: Match[] = [];
  for (let i = 0; i < numMatches; i++) {
    const base = i * 4;
    const p1 = playerIds[base];
    const p2 = playerIds[base + 1];
    const p3 = playerIds[base + 2];
    const p4 = playerIds[base + 3];

    if (p1 && p2 && p3 && p4) {
      matches.push({
        id: createId(),
        teamA: [p1, p4],
        teamB: [p2, p3],
        sets: initialSets,
        courtId: sortedCourts[i]?.courtId,
      });
    }
  }

  return matches;
}

function generateMixPairsRatingRound(
  game: Game,
  previousRounds: Round[],
  initialSets: Array<{ teamA: number; teamB: number }>,
  sortedCourts: Array<{ courtId?: string; order: number }>,
  numMatches: number,
  participants: any[]
): Match[] {
  const males = participants.filter((p: any) => p.user.gender === 'MALE');
  const females = participants.filter((p: any) => p.user.gender === 'FEMALE');

  let maleIds: string[];
  let femaleIds: string[];

  if (previousRounds.length === 0) {
    maleIds = shuffle(males.map((p: any) => p.userId));
    femaleIds = shuffle(females.map((p: any) => p.userId));
  } else {
    const standings = calculateGameStandings(
      game,
      previousRounds,
      game.winnerOfGame || 'BY_SCORES_DELTA'
    );
    const maleSet = new Set(males.map((p: any) => p.userId));
    const femaleSet = new Set(females.map((p: any) => p.userId));
    maleIds = standings.filter(s => maleSet.has(s.user.id)).map(s => s.user.id);
    femaleIds = standings.filter(s => femaleSet.has(s.user.id)).map(s => s.user.id);

    for (const p of males) {
      if (!maleIds.includes(p.userId)) maleIds.push(p.userId);
    }
    for (const p of females) {
      if (!femaleIds.includes(p.userId)) femaleIds.push(p.userId);
    }
  }

  const neededPerGender = numMatches * 2;
  if (maleIds.length > neededPerGender) {
    maleIds = selectPlayersWithRotation(maleIds, neededPerGender, previousRounds);
  }
  if (femaleIds.length > neededPerGender) {
    femaleIds = selectPlayersWithRotation(femaleIds, neededPerGender, previousRounds);
  }

  const actualMatches = Math.min(
    numMatches,
    Math.floor(maleIds.length / 2),
    Math.floor(femaleIds.length / 2)
  );
  const matches: Match[] = [];

  for (let i = 0; i < actualMatches; i++) {
    const m1 = maleIds[i * 2];
    const m2 = maleIds[i * 2 + 1];
    const f1 = femaleIds[i * 2];
    const f2 = femaleIds[i * 2 + 1];

    if (m1 && m2 && f1 && f2) {
      matches.push({
        id: createId(),
        teamA: [m1, f2],
        teamB: [m2, f1],
        sets: initialSets,
        courtId: sortedCourts[i]?.courtId,
      });
    }
  }

  return matches;
}

function generateFixedTeamRatingRound(
  game: Game,
  previousRounds: Round[],
  initialSets: Array<{ teamA: number; teamB: number }>,
  sortedCourts: Array<{ courtId?: string; order: number }>,
  numMatches: number
): Match[] {
  const fixedTeamPairs = getFilteredFixedTeams(game);
  if (fixedTeamPairs.length < 2) return [];

  let rankedTeams: string[][];

  if (previousRounds.length === 0) {
    rankedTeams = shuffle([...fixedTeamPairs]);
  } else {
    const standings = calculateGameStandings(
      game,
      previousRounds,
      game.winnerOfGame || 'BY_SCORES_DELTA'
    );
    const teamScores = fixedTeamPairs.map(team => {
      let totalDelta = 0;
      for (const playerId of team) {
        const standing = standings.find(s => s.user.id === playerId);
        if (standing) totalDelta += standing.scoresDelta;
      }
      return { team, totalDelta };
    });
    teamScores.sort((a, b) => b.totalDelta - a.totalDelta);
    rankedTeams = teamScores.map(ts => ts.team);
  }

  const neededTeams = numMatches * 2;
  if (rankedTeams.length > neededTeams) {
    const allPlayerIds = rankedTeams.flat();
    const matchesPlayed = buildMatchesPlayed(allPlayerIds, previousRounds);
    const teamPlayed = rankedTeams.map((team, rank) => ({
      team,
      rank,
      played: Math.max(...team.map(id => matchesPlayed.get(id) || 0)),
    }));
    teamPlayed.sort((a, b) => {
      const playedDiff = a.played - b.played;
      if (playedDiff !== 0) return playedDiff;
      return a.rank - b.rank;
    });
    const selected = teamPlayed.slice(0, neededTeams);
    selected.sort((a, b) => a.rank - b.rank);
    rankedTeams = selected.map(s => s.team);
  }

  const matches: Match[] = [];
  const numTeamMatches = Math.min(numMatches, Math.floor(rankedTeams.length / 2));

  for (let i = 0; i < numTeamMatches; i++) {
    const teamA = rankedTeams[i * 2];
    const teamB = rankedTeams[i * 2 + 1];

    if (teamA && teamB) {
      matches.push({
        id: createId(),
        teamA,
        teamB,
        sets: initialSets,
        courtId: sortedCourts[i]?.courtId,
      });
    }
  }

  return matches;
}
