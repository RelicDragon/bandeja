import { Match, Round } from '@/types/gameResults';
import { Game } from '@/types';
import { createId } from '@paralleldrive/cuid2';
import { calculateGameStandings } from '../gameStandings';
import {
  getEligibleParticipants,
  getNumMatches,
  getFilteredFixedTeams,
  buildMatchesPlayed,
  buildPartnerCounts,
  buildOpponentCounts,
  pairKey,
  cloneSets,
  shuffle,
  InitialSets,
} from './matchUtils';

export function generateRatingRound(
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
    random: Math.random(),
  }));

  indexed.sort((a, b) => {
    const playedDiff = a.played - b.played;
    if (playedDiff !== 0) return playedDiff;
    return a.random - b.random;
  });

  const selected = indexed.slice(0, needed);
  selected.sort((a, b) => a.rank - b.rank);
  return selected.map(s => s.id);
}

function shuffleWithinTiedStandings(
  standings: Array<{ user: { id: string }; place: number }>
): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < standings.length) {
    const place = standings[i].place;
    let j = i + 1;
    while (j < standings.length && standings[j].place === place) {
      j++;
    }
    const block = standings.slice(i, j).map(s => s.user.id);
    result.push(...shuffle(block));
    i = j;
  }
  return result;
}

function levelOf(p: { user?: { level?: number }; userId: string }): number {
  return p.user?.level ?? 0;
}

function shuffleByLevelDesc(participants: any[]): string[] {
  const sorted = [...participants].sort((a: any, b: any) => levelOf(b) - levelOf(a));
  const result: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    const level = levelOf(sorted[i]);
    let j = i + 1;
    while (j < sorted.length && levelOf(sorted[j]) === level) {
      j++;
    }
    const block = sorted.slice(i, j).map((p: any) => p.userId);
    result.push(...shuffle(block));
    i = j;
  }
  return result;
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
  const eligibleStandings = standings.filter(s => eligibleIds.has(s.user.id));
  let fromStandings = shuffleWithinTiedStandings(eligibleStandings);

  if (fromStandings.length === 0) {
    fromStandings = shuffleByLevelDesc(participants);
  } else {
    for (const p of participants) {
      if (!fromStandings.includes(p.userId)) {
        fromStandings.push(p.userId);
      }
    }
  }
  return fromStandings;
}

function chooseBestPairing(
  players: string[],
  partnerCounts: Map<string, number>,
  opponentCounts: Map<string, number>
): { teamA: string[]; teamB: string[] } {
  const [p1, p2, p3, p4] = players;
  const options = [
    { teamA: [p1, p4], teamB: [p2, p3] },
    { teamA: [p1, p3], teamB: [p2, p4] },
    { teamA: [p1, p2], teamB: [p3, p4] },
  ];

  let bestScore = Infinity;
  let bestIdx = 0;

  for (let i = 0; i < options.length; i++) {
    const { teamA, teamB } = options[i];
    const partnerScore =
      (partnerCounts.get(pairKey(teamA[0], teamA[1])) || 0) +
      (partnerCounts.get(pairKey(teamB[0], teamB[1])) || 0);
    const opponentScore =
      (opponentCounts.get(pairKey(teamA[0], teamB[0])) || 0) +
      (opponentCounts.get(pairKey(teamA[0], teamB[1])) || 0) +
      (opponentCounts.get(pairKey(teamA[1], teamB[0])) || 0) +
      (opponentCounts.get(pairKey(teamA[1], teamB[1])) || 0);

    const score = partnerScore * 3 + opponentScore + i * 0.1;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return options[bestIdx];
}

function chooseBestMixPairing(
  males: string[],
  females: string[],
  partnerCounts: Map<string, number>,
  opponentCounts: Map<string, number>
): { teamA: string[]; teamB: string[] } {
  const [m1, m2] = males;
  const [f1, f2] = females;
  const options = [
    { teamA: [m1, f2], teamB: [m2, f1] },
    { teamA: [m1, f1], teamB: [m2, f2] },
  ];

  let bestScore = Infinity;
  let bestIdx = 0;

  for (let i = 0; i < options.length; i++) {
    const { teamA, teamB } = options[i];
    const partnerScore =
      (partnerCounts.get(pairKey(teamA[0], teamA[1])) || 0) +
      (partnerCounts.get(pairKey(teamB[0], teamB[1])) || 0);
    const opponentScore =
      (opponentCounts.get(pairKey(teamA[0], teamB[0])) || 0) +
      (opponentCounts.get(pairKey(teamA[0], teamB[1])) || 0) +
      (opponentCounts.get(pairKey(teamA[1], teamB[0])) || 0) +
      (opponentCounts.get(pairKey(teamA[1], teamB[1])) || 0);

    const score = partnerScore * 3 + opponentScore + i * 0.1;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return options[bestIdx];
}

// ── Standard (no fixed teams, no MIX_PAIRS) ──────────────────────────

function generateStandardRatingRound(
  game: Game,
  previousRounds: Round[],
  initialSets: InitialSets,
  sortedCourts: Array<{ courtId?: string; order: number }>,
  numMatches: number,
  participants: any[]
): Match[] {
  const neededPlayers = numMatches * 4;

  let playerIds: string[];
  if (previousRounds.length === 0) {
    playerIds = shuffleByLevelDesc(participants);
  } else {
    playerIds = getStandingsPlayerIds(game, previousRounds, participants);
  }

  if (playerIds.length > neededPlayers) {
    playerIds = selectPlayersWithRotation(playerIds, neededPlayers, previousRounds);
  }

  const partnerCounts = buildPartnerCounts(previousRounds);
  const opponentCounts = buildOpponentCounts(previousRounds);

  const matches: Match[] = [];
  for (let i = 0; i < numMatches; i++) {
    const base = i * 4;
    const group = playerIds.slice(base, base + 4);

    if (group.length === 4) {
      const { teamA, teamB } = chooseBestPairing(group, partnerCounts, opponentCounts);
      matches.push({
        id: createId(),
        teamA,
        teamB,
        sets: cloneSets(initialSets),
        courtId: sortedCourts[i]?.courtId,
      });
    }
  }

  return matches;
}

// ── MIX_PAIRS ─────────────────────────────────────────────────────────

function generateMixPairsRatingRound(
  game: Game,
  previousRounds: Round[],
  initialSets: InitialSets,
  sortedCourts: Array<{ courtId?: string; order: number }>,
  numMatches: number,
  participants: any[]
): Match[] {
  const males = participants.filter((p: any) => p.user.gender === 'MALE');
  const females = participants.filter((p: any) => p.user.gender === 'FEMALE');

  let maleIds: string[];
  let femaleIds: string[];

  if (previousRounds.length === 0) {
    maleIds = shuffleByLevelDesc(males);
    femaleIds = shuffleByLevelDesc(females);
  } else {
    const standings = calculateGameStandings(
      game,
      previousRounds,
      game.winnerOfGame || 'BY_SCORES_DELTA'
    );
    const maleSet = new Set(males.map((p: any) => p.userId));
    const femaleSet = new Set(females.map((p: any) => p.userId));
    const maleStandings = standings.filter(s => maleSet.has(s.user.id));
    const femaleStandings = standings.filter(s => femaleSet.has(s.user.id));

    maleIds = shuffleWithinTiedStandings(maleStandings);
    femaleIds = shuffleWithinTiedStandings(femaleStandings);

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

  const partnerCounts = buildPartnerCounts(previousRounds);
  const opponentCounts = buildOpponentCounts(previousRounds);

  const actualMatches = Math.min(
    numMatches,
    Math.floor(maleIds.length / 2),
    Math.floor(femaleIds.length / 2)
  );
  const matches: Match[] = [];

  for (let i = 0; i < actualMatches; i++) {
    const courtMales = [maleIds[i * 2], maleIds[i * 2 + 1]];
    const courtFemales = [femaleIds[i * 2], femaleIds[i * 2 + 1]];

    if (courtMales[0] && courtMales[1] && courtFemales[0] && courtFemales[1]) {
      const { teamA, teamB } = chooseBestMixPairing(
        courtMales, courtFemales, partnerCounts, opponentCounts
      );
      matches.push({
        id: createId(),
        teamA,
        teamB,
        sets: cloneSets(initialSets),
        courtId: sortedCourts[i]?.courtId,
      });
    }
  }

  return matches;
}

// ── Fixed Teams ───────────────────────────────────────────────────────

function generateFixedTeamRatingRound(
  game: Game,
  previousRounds: Round[],
  initialSets: InitialSets,
  sortedCourts: Array<{ courtId?: string; order: number }>,
  numMatches: number
): Match[] {
  const fixedTeamPairs = getFilteredFixedTeams(game);
  if (fixedTeamPairs.length < 2) return [];

  let rankedTeams: string[][];

  if (previousRounds.length === 0) {
    const participantMap = new Map(
      game.participants
        .filter(p => p.status === 'PLAYING')
        .map(p => [p.userId, p.user?.level ?? 0])
    );
    const teamLevels = fixedTeamPairs.map(team => {
      const avgLevel = team.reduce((sum, id) => sum + (participantMap.get(id) || 0), 0) / team.length;
      return { team, avgLevel };
    });
    teamLevels.sort((a, b) => b.avgLevel - a.avgLevel);
    rankedTeams = teamLevels.map(t => t.team);
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
      random: Math.random(),
    }));
    teamPlayed.sort((a, b) => {
      const playedDiff = a.played - b.played;
      if (playedDiff !== 0) return playedDiff;
      return a.random - b.random;
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
        sets: cloneSets(initialSets),
        courtId: sortedCourts[i]?.courtId,
      });
    }
  }

  return matches;
}
