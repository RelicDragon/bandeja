import { Match, Round } from '@/types/gameResults';
import { Game } from '@/types';
import { createId } from '@paralleldrive/cuid2';
import {
  getEligibleParticipants,
  getNumMatches,
  getFilteredFixedTeams,
  buildMatchesPlayed,
  hasPlayers,
  cloneSets,
  type InitialSets,
} from './matchUtils';

interface CourtResult {
  winners: string[];
  losers: string[];
}

export function generateEscaleraRound(
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
    return generateFixedTeamEscaleraRound(game, previousRounds, initialSets, sortedCourts, numMatches);
  }

  if (game.genderTeams === 'MIX_PAIRS') {
    return generateMixPairsEscaleraRound(previousRounds, initialSets, sortedCourts, numMatches, participants);
  }

  return generateStandardEscaleraRound(previousRounds, initialSets, sortedCourts, numMatches, participants);
}

function isRoundComplete(round: Round): boolean {
  const matchesWithPlayers = round.matches.filter(hasPlayers);
  if (matchesWithPlayers.length === 0) return false;
  return matchesWithPlayers.every(match =>
    match.sets.some(s => s.teamA > 0 || s.teamB > 0)
  );
}

function getCourtResults(previousRound: Round): CourtResult[] {
  const results: CourtResult[] = [];

  for (let i = 0; i < previousRound.matches.length; i++) {
    const match = previousRound.matches[i];
    if (!hasPlayers(match)) continue;

    const validSets = match.sets.filter(s => s.teamA > 0 || s.teamB > 0);
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

    if (Math.random() < 0.5) winners.reverse();
    if (Math.random() < 0.5) losers.reverse();

    results.push({ winners, losers });
  }

  return results;
}

/**
 * In Escalera, after each round individual players move between courts:
 * - From each court, one winner moves UP and one loser moves DOWN.
 * - On the top court (index 0): both winners stay (no court above).
 * - On the bottom court (last index): both losers stay (no court below).
 * - Which player in each pair moves vs stays is randomly selected.
 *
 * After movement, the 4 players on each court form two new cross-teams
 * (1&4 vs 2&3 by arrival order, mixing movers with stayers).
 */
function distributePlayersAcrossCourts(courtResults: CourtResult[]): string[][] {
  const numCourts = courtResults.length;
  if (numCourts === 0) return [];

  if (numCourts === 1) {
    const cr = courtResults[0];
    return [[cr.winners[0], cr.losers[0], cr.winners[1], cr.losers[1]]];
  }

  const stayingWinner: string[] = new Array(numCourts);
  const movingUpWinner: string[] = new Array(numCourts);
  const stayingLoser: string[] = new Array(numCourts);
  const movingDownLoser: string[] = new Array(numCourts);

  for (let i = 0; i < numCourts; i++) {
    const cr = courtResults[i];
    stayingWinner[i] = cr.winners[0];
    movingUpWinner[i] = cr.winners[1];
    stayingLoser[i] = cr.losers[0];
    movingDownLoser[i] = cr.losers[1];
  }

  const courts: string[][] = [];

  for (let i = 0; i < numCourts; i++) {
    const players: string[] = [];

    if (i === 0) {
      players.push(stayingWinner[0]);
      players.push(movingUpWinner[0]);
      players.push(movingUpWinner[1]);
      players.push(stayingLoser[0]);
    } else if (i === numCourts - 1) {
      players.push(movingDownLoser[i - 1]);
      players.push(stayingWinner[i]);
      players.push(stayingLoser[i]);
      players.push(movingDownLoser[i]);
    } else {
      players.push(movingDownLoser[i - 1]);
      players.push(stayingWinner[i]);
      players.push(stayingLoser[i]);
      players.push(movingUpWinner[i + 1]);
    }

    courts.push(players);
  }

  return courts;
}

function buildMatchesFromCourts(
  courts: string[][],
  sortedCourts: Array<{ courtId?: string; order: number }>,
  initialSets: InitialSets,
  numMatches: number
): Match[] {
  const matches: Match[] = [];

  for (let i = 0; i < Math.min(courts.length, numMatches); i++) {
    const players = courts[i];
    if (players.length < 4) continue;

    matches.push({
      id: createId(),
      teamA: [players[0], players[3]],
      teamB: [players[1], players[2]],
      sets: cloneSets(initialSets),
      courtId: sortedCourts[i]?.courtId,
    });
  }

  return matches;
}

function selectPlayersWithRotation(
  rankedIds: string[],
  needed: number,
  previousRounds: Round[]
): string[] {
  const matchesPlayed = buildMatchesPlayed(rankedIds, previousRounds);
  const indexed = rankedIds.map((id, rank) => ({
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

function removeDepartedPlayers(
  courts: string[][],
  eligibleIds: Set<string>
): { courtIdx: number; posIdx: number }[] {
  const departed: { courtIdx: number; posIdx: number }[] = [];
  for (let c = 0; c < courts.length; c++) {
    for (let p = 0; p < courts[c].length; p++) {
      if (!eligibleIds.has(courts[c][p])) {
        departed.push({ courtIdx: c, posIdx: p });
        courts[c][p] = '';
      }
    }
  }
  return departed;
}

function cleanEmptySlots(courts: string[][]): void {
  for (const court of courts) {
    for (let i = court.length - 1; i >= 0; i--) {
      if (court[i] === '') court.splice(i, 1);
    }
  }
}

// ── Standard (no fixed teams, no MIX_PAIRS) ──────────────────────────

function generateStandardEscaleraRound(
  previousRounds: Round[],
  initialSets: InitialSets,
  sortedCourts: Array<{ courtId?: string; order: number }>,
  numMatches: number,
  participants: any[]
): Match[] {
  const neededPlayers = numMatches * 4;

  if (previousRounds.length === 0) {
    const sorted = [...participants].sort((a, b) => b.user.level - a.user.level);
    let playerIds = sorted.map((p: any) => p.userId);

    if (playerIds.length > neededPlayers) {
      playerIds = selectPlayersWithRotation(playerIds, neededPlayers, previousRounds);
    }

    return buildFirstRound(playerIds, sortedCourts, initialSets, numMatches);
  }

  const previousRound = previousRounds[previousRounds.length - 1];
  if (!previousRound.matches || previousRound.matches.length === 0) return [];
  if (!isRoundComplete(previousRound)) return [];

  const courtResults = getCourtResults(previousRound);
  if (courtResults.length === 0) return [];

  const courts = distributePlayersAcrossCourts(courtResults);
  const eligibleIds = new Set(participants.map((p: any) => p.userId));
  const departedSlots = removeDepartedPlayers(courts, eligibleIds);

  const activePlayers = new Set(courts.flat().filter(id => id !== ''));
  const benchPlayers = participants
    .filter((p: any) => !activePlayers.has(p.userId))
    .map((p: any) => p.userId);

  if (departedSlots.length > 0 || benchPlayers.length > 0) {
    return handleBenchRotation(
      courts, benchPlayers, departedSlots, previousRounds,
      sortedCourts, initialSets, numMatches
    );
  }

  return buildMatchesFromCourts(courts, sortedCourts, initialSets, numMatches);
}

function buildFirstRound(
  playerIds: string[],
  sortedCourts: Array<{ courtId?: string; order: number }>,
  initialSets: InitialSets,
  numMatches: number
): Match[] {
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
        sets: cloneSets(initialSets),
        courtId: sortedCourts[i]?.courtId,
      });
    }
  }

  return matches;
}

function handleBenchRotation(
  courts: string[][],
  benchPlayers: string[],
  departedSlots: { courtIdx: number; posIdx: number }[],
  previousRounds: Round[],
  sortedCourts: Array<{ courtId?: string; order: number }>,
  initialSets: InitialSets,
  numMatches: number
): Match[] {
  const allActive = courts.flat().filter(id => id !== '');
  const matchesPlayed = buildMatchesPlayed(
    [...allActive, ...benchPlayers],
    previousRounds
  );

  const benchSorted = [...benchPlayers].sort(
    (a, b) => (matchesPlayed.get(a) || 0) - (matchesPlayed.get(b) || 0)
  );

  let benchIdx = 0;

  for (const slot of departedSlots) {
    if (benchIdx < benchSorted.length) {
      courts[slot.courtIdx][slot.posIdx] = benchSorted[benchIdx++];
    }
  }

  const remainingBench = benchSorted.slice(benchIdx);
  if (remainingBench.length > 0) {
    const swapCandidates: { id: string; courtIdx: number; posIdx: number; played: number }[] = [];
    for (let c = courts.length - 1; c >= 0; c--) {
      for (let p = courts[c].length - 1; p >= 0; p--) {
        const id = courts[c][p];
        if (id === '') continue;
        swapCandidates.push({
          id,
          courtIdx: c,
          posIdx: p,
          played: matchesPlayed.get(id) || 0,
        });
      }
    }
    swapCandidates.sort((a, b) => {
      const courtDiff = b.courtIdx - a.courtIdx;
      if (courtDiff !== 0) return courtDiff;
      return b.played - a.played;
    });

    const numToSwap = Math.min(remainingBench.length, swapCandidates.length);
    for (let i = 0; i < numToSwap; i++) {
      const benchPlayer = remainingBench[i];
      const target = swapCandidates[i];
      const benchPlayed = matchesPlayed.get(benchPlayer) || 0;
      if (benchPlayed >= target.played) continue;
      courts[target.courtIdx][target.posIdx] = benchPlayer;
    }
  }

  cleanEmptySlots(courts);
  return buildMatchesFromCourts(courts, sortedCourts, initialSets, numMatches);
}

// ── MIX_PAIRS ─────────────────────────────────────────────────────────

function generateMixPairsEscaleraRound(
  previousRounds: Round[],
  initialSets: InitialSets,
  sortedCourts: Array<{ courtId?: string; order: number }>,
  numMatches: number,
  participants: any[]
): Match[] {
  const males = participants.filter((p: any) => p.user.gender === 'MALE');
  const females = participants.filter((p: any) => p.user.gender === 'FEMALE');

  if (previousRounds.length === 0) {
    const sortedMales = [...males].sort((a, b) => b.user.level - a.user.level);
    const sortedFemales = [...females].sort((a, b) => b.user.level - a.user.level);

    let maleIds = sortedMales.map((p: any) => p.userId);
    let femaleIds = sortedFemales.map((p: any) => p.userId);

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
          sets: cloneSets(initialSets),
          courtId: sortedCourts[i]?.courtId,
        });
      }
    }

    return matches;
  }

  const previousRound = previousRounds[previousRounds.length - 1];
  if (!previousRound.matches || previousRound.matches.length === 0) return [];
  if (!isRoundComplete(previousRound)) return [];

  const courtResults = getCourtResults(previousRound);
  if (courtResults.length === 0) return [];

  const genderMap = new Map<string, string>();
  for (const p of participants) {
    genderMap.set(p.userId, p.user.gender);
  }

  const courts = distributePlayersForMixPairs(courtResults, genderMap);
  const eligibleIds = new Set(participants.map((p: any) => p.userId));
  removeDepartedPlayers(courts, eligibleIds);

  const activePlayers = new Set(courts.flat().filter(id => id !== ''));
  const benchPlayers = participants
    .filter((p: any) => !activePlayers.has(p.userId))
    .map((p: any) => p.userId);

  if (benchPlayers.length > 0 || courts.some(c => c.some(id => id === ''))) {
    const matchesPlayed = buildMatchesPlayed(
      [...courts.flat().filter(id => id !== ''), ...benchPlayers],
      previousRounds
    );
    const benchMales = benchPlayers
      .filter(id => genderMap.get(id) === 'MALE')
      .sort((a, b) => (matchesPlayed.get(a) || 0) - (matchesPlayed.get(b) || 0));
    const benchFemales = benchPlayers
      .filter(id => genderMap.get(id) === 'FEMALE')
      .sort((a, b) => (matchesPlayed.get(a) || 0) - (matchesPlayed.get(b) || 0));
    fillEmptySlotsByGender(courts, benchMales, benchFemales, genderMap);
    const remainingBench = [...benchMales, ...benchFemales];
    if (remainingBench.length > 0) {
      swapBenchPlayersMixPairs(courts, remainingBench, previousRounds, genderMap);
    }
  }

  cleanEmptySlots(courts);
  return buildMixPairsMatchesFromCourts(courts, sortedCourts, initialSets, numMatches, genderMap);
}

function fillEmptySlotsByGender(
  courts: string[][],
  benchMales: string[],
  benchFemales: string[],
  genderMap: Map<string, string>
): void {
  let mIdx = 0;
  let fIdx = 0;

  for (const court of courts) {
    for (let p = 0; p < court.length; p++) {
      if (court[p] !== '') continue;

      const valid = court.filter(id => id !== '');
      const mCount = valid.filter(id => genderMap.get(id) === 'MALE').length;
      const fCount = valid.filter(id => genderMap.get(id) === 'FEMALE').length;

      if (mCount < fCount && mIdx < benchMales.length) {
        court[p] = benchMales[mIdx++];
      } else if (fIdx < benchFemales.length) {
        court[p] = benchFemales[fIdx++];
      } else if (mIdx < benchMales.length) {
        court[p] = benchMales[mIdx++];
      }
    }
  }

  benchMales.splice(0, mIdx);
  benchFemales.splice(0, fIdx);
}

function distributePlayersForMixPairs(
  courtResults: CourtResult[],
  genderMap: Map<string, string>
): string[][] {
  const courts = distributePlayersAcrossCourts(courtResults);

  for (const court of courts) {
    const maleCount = court.filter(id => genderMap.get(id) === 'MALE').length;
    const femaleCount = court.filter(id => genderMap.get(id) === 'FEMALE').length;

    if (maleCount !== 2 || femaleCount !== 2) {
      rebalanceGendersAcrossCourts(courts, genderMap);
      break;
    }
  }

  return courts;
}

function rebalanceGendersAcrossCourts(
  courts: string[][],
  genderMap: Map<string, string>
): void {
  let maxIter = courts.length * courts.length;

  while (maxIter-- > 0) {
    let imbalancedCourt = -1;
    let excessGender: string | null = null;

    for (let c = 0; c < courts.length; c++) {
      const valid = courts[c].filter(id => id !== '');
      const maleCount = valid.filter(id => genderMap.get(id) === 'MALE').length;
      const femaleCount = valid.filter(id => genderMap.get(id) === 'FEMALE').length;
      if (maleCount > 2) { imbalancedCourt = c; excessGender = 'MALE'; break; }
      if (femaleCount > 2) { imbalancedCourt = c; excessGender = 'FEMALE'; break; }
    }

    if (imbalancedCourt === -1 || !excessGender) break;

    const neededGender = excessGender === 'MALE' ? 'FEMALE' : 'MALE';
    let bestSwapCourt = -1;
    let bestDist = Infinity;

    for (let other = 0; other < courts.length; other++) {
      if (other === imbalancedCourt) continue;
      const valid = courts[other].filter(id => id !== '');
      const count = valid.filter(id => genderMap.get(id) === neededGender).length;
      if (count > 2) {
        const dist = Math.abs(other - imbalancedCourt);
        if (dist < bestDist) { bestDist = dist; bestSwapCourt = other; }
      }
    }

    if (bestSwapCourt === -1) break;

    const excessIndices = courts[imbalancedCourt]
      .map((id, idx) => ({ id, idx }))
      .filter(p => p.id !== '' && genderMap.get(p.id) === excessGender);
    const swapIndices = courts[bestSwapCourt]
      .map((id, idx) => ({ id, idx }))
      .filter(p => p.id !== '' && genderMap.get(p.id) === neededGender);

    if (excessIndices.length === 0 || swapIndices.length === 0) break;

    const eTarget = excessIndices[excessIndices.length - 1];
    const sTarget = swapIndices[swapIndices.length - 1];

    const temp = courts[imbalancedCourt][eTarget.idx];
    courts[imbalancedCourt][eTarget.idx] = courts[bestSwapCourt][sTarget.idx];
    courts[bestSwapCourt][sTarget.idx] = temp;
  }
}

function swapBenchPlayersMixPairs(
  courts: string[][],
  benchPlayers: string[],
  previousRounds: Round[],
  genderMap: Map<string, string>
): void {
  const allActive = courts.flat().filter(id => id !== '');
  const matchesPlayed = buildMatchesPlayed(
    [...allActive, ...benchPlayers],
    previousRounds
  );

  const benchMales = benchPlayers
    .filter(id => genderMap.get(id) === 'MALE')
    .sort((a, b) => (matchesPlayed.get(a) || 0) - (matchesPlayed.get(b) || 0));
  const benchFemales = benchPlayers
    .filter(id => genderMap.get(id) === 'FEMALE')
    .sort((a, b) => (matchesPlayed.get(a) || 0) - (matchesPlayed.get(b) || 0));

  for (const gender of ['MALE', 'FEMALE'] as const) {
    const bench = gender === 'MALE' ? benchMales : benchFemales;
    if (bench.length === 0) continue;

    const activeSameGender: { id: string; courtIdx: number; posIdx: number; played: number }[] = [];
    for (let c = courts.length - 1; c >= 0; c--) {
      for (let p = 0; p < courts[c].length; p++) {
        const id = courts[c][p];
        if (id === '' || genderMap.get(id) !== gender) continue;
        activeSameGender.push({
          id,
          courtIdx: c,
          posIdx: p,
          played: matchesPlayed.get(id) || 0,
        });
      }
    }
    activeSameGender.sort((a, b) => {
      const courtDiff = b.courtIdx - a.courtIdx;
      if (courtDiff !== 0) return courtDiff;
      return b.played - a.played;
    });

    const numToSwap = Math.min(bench.length, activeSameGender.length);
    for (let i = 0; i < numToSwap; i++) {
      const benchPlayer = bench[i];
      const target = activeSameGender[i];
      const benchPlayed = matchesPlayed.get(benchPlayer) || 0;
      if (benchPlayed >= target.played) continue;
      courts[target.courtIdx][target.posIdx] = benchPlayer;
    }
  }
}

function buildMixPairsMatchesFromCourts(
  courts: string[][],
  sortedCourts: Array<{ courtId?: string; order: number }>,
  initialSets: InitialSets,
  numMatches: number,
  genderMap: Map<string, string>
): Match[] {
  const matches: Match[] = [];

  for (let i = 0; i < Math.min(courts.length, numMatches); i++) {
    const players = courts[i];
    if (players.length < 4) continue;

    const malesOnCourt = players.filter(id => genderMap.get(id) === 'MALE');
    const femalesOnCourt = players.filter(id => genderMap.get(id) === 'FEMALE');

    if (malesOnCourt.length >= 2 && femalesOnCourt.length >= 2) {
      matches.push({
        id: createId(),
        teamA: [malesOnCourt[0], femalesOnCourt[1]],
        teamB: [malesOnCourt[1], femalesOnCourt[0]],
        sets: cloneSets(initialSets),
        courtId: sortedCourts[i]?.courtId,
      });
    } else {
      matches.push({
        id: createId(),
        teamA: [players[0], players[3]],
        teamB: [players[1], players[2]],
        sets: cloneSets(initialSets),
        courtId: sortedCourts[i]?.courtId,
      });
    }
  }

  return matches;
}

// ── Fixed Teams ───────────────────────────────────────────────────────

function teamKey(team: string[]): string {
  return [...team].sort().join(',');
}

function countTeamRoundsPlayed(
  allTeams: string[][],
  previousRounds: Round[]
): Map<string, number> {
  const playerToTeam = new Map<string, string>();
  for (const team of allTeams) {
    const key = teamKey(team);
    for (const playerId of team) {
      playerToTeam.set(playerId, key);
    }
  }

  const counts = new Map<string, number>();
  for (const team of allTeams) {
    counts.set(teamKey(team), 0);
  }

  for (const round of previousRounds) {
    const counted = new Set<string>();
    for (const match of round.matches) {
      if (!hasPlayers(match)) continue;
      for (const playerId of [...match.teamA, ...match.teamB]) {
        const key = playerToTeam.get(playerId);
        if (key && !counted.has(key)) {
          counted.add(key);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
  }

  return counts;
}

function selectTeamsWithRotation(
  rankedTeams: string[][],
  needed: number,
  previousRounds: Round[]
): string[][] {
  const roundsPlayed = countTeamRoundsPlayed(rankedTeams, previousRounds);

  const indexed = rankedTeams.map((team, rank) => ({
    team,
    rank,
    played: roundsPlayed.get(teamKey(team)) || 0,
  }));

  indexed.sort((a, b) => {
    const playedDiff = a.played - b.played;
    if (playedDiff !== 0) return playedDiff;
    return a.rank - b.rank;
  });

  const selected = indexed.slice(0, needed);
  selected.sort((a, b) => a.rank - b.rank);
  return selected.map(s => s.team);
}

function generateFixedTeamEscaleraRound(
  game: Game,
  previousRounds: Round[],
  initialSets: InitialSets,
  sortedCourts: Array<{ courtId?: string; order: number }>,
  numMatches: number
): Match[] {
  const eligibleIds = new Set(
    game.participants.filter(p => p.status === 'PLAYING').map(p => p.userId)
  );
  const fixedTeamPairs = getFilteredFixedTeams(game)
    .filter(team => team.every(id => eligibleIds.has(id)));
  if (fixedTeamPairs.length < 2) return [];

  const neededTeams = numMatches * 2;

  if (previousRounds.length === 0) {
    const teamLevels = fixedTeamPairs.map(team => {
      const participants = game.participants.filter(p => team.includes(p.userId));
      const avgLevel = participants.reduce((sum, p) => sum + p.user.level, 0) / (participants.length || 1);
      return { team, avgLevel };
    });
    teamLevels.sort((a, b) => b.avgLevel - a.avgLevel);

    let rankedTeams = teamLevels.map(t => t.team);
    if (rankedTeams.length > neededTeams) {
      rankedTeams = selectTeamsWithRotation(rankedTeams, neededTeams, previousRounds);
    }

    return buildFixedTeamMatches(rankedTeams, sortedCourts, initialSets, numMatches);
  }

  const previousRound = previousRounds[previousRounds.length - 1];
  if (!previousRound.matches || previousRound.matches.length === 0) return [];
  if (!isRoundComplete(previousRound)) return [];

  const teamMap = new Map<string, string[]>();
  for (const team of fixedTeamPairs) {
    for (const playerId of team) {
      teamMap.set(playerId, team);
    }
  }

  const courtTeamResults: Array<{
    winnerTeam: string[];
    loserTeam: string[];
  }> = [];

  for (let i = 0; i < previousRound.matches.length; i++) {
    const match = previousRound.matches[i];
    if (!hasPlayers(match)) continue;

    const validSets = match.sets.filter(s => s.teamA > 0 || s.teamB > 0);
    const teamAScore = validSets.reduce((sum, s) => sum + s.teamA, 0);
    const teamBScore = validSets.reduce((sum, s) => sum + s.teamB, 0);

    let winnerPlayers: string[];
    let loserPlayers: string[];

    if (teamAScore === teamBScore) {
      if (Math.random() < 0.5) {
        winnerPlayers = match.teamA;
        loserPlayers = match.teamB;
      } else {
        winnerPlayers = match.teamB;
        loserPlayers = match.teamA;
      }
    } else if (teamAScore > teamBScore) {
      winnerPlayers = match.teamA;
      loserPlayers = match.teamB;
    } else {
      winnerPlayers = match.teamB;
      loserPlayers = match.teamA;
    }

    const winnerTeam = teamMap.get(winnerPlayers[0]) || [...winnerPlayers];
    const loserTeam = teamMap.get(loserPlayers[0]) || [...loserPlayers];

    if (!winnerTeam.every(id => eligibleIds.has(id))) continue;
    if (!loserTeam.every(id => eligibleIds.has(id))) continue;

    courtTeamResults.push({ winnerTeam, loserTeam });
  }

  if (courtTeamResults.length === 0) return [];

  const numCourts = courtTeamResults.length;
  const courtPairings: Array<{ teamA: string[]; teamB: string[] }> = [];

  if (numCourts === 1) {
    courtPairings.push({
      teamA: courtTeamResults[0].winnerTeam,
      teamB: courtTeamResults[0].loserTeam,
    });
  } else {
    for (let i = 0; i < numCourts; i++) {
      if (i === 0) {
        courtPairings.push({
          teamA: courtTeamResults[0].winnerTeam,
          teamB: courtTeamResults[1].winnerTeam,
        });
      } else if (i === numCourts - 1) {
        courtPairings.push({
          teamA: courtTeamResults[i - 1].loserTeam,
          teamB: courtTeamResults[i].loserTeam,
        });
      } else {
        courtPairings.push({
          teamA: courtTeamResults[i - 1].loserTeam,
          teamB: courtTeamResults[i + 1].winnerTeam,
        });
      }
    }
  }

  const activeTeamKeys = new Set<string>();
  for (const ctr of courtTeamResults) {
    activeTeamKeys.add(teamKey(ctr.winnerTeam));
    activeTeamKeys.add(teamKey(ctr.loserTeam));
  }

  const benchTeams = fixedTeamPairs.filter(t => !activeTeamKeys.has(teamKey(t)));

  if (benchTeams.length > 0) {
    const teamRoundsPlayed = countTeamRoundsPlayed(fixedTeamPairs, previousRounds);

    const benchSorted = [...benchTeams].sort(
      (a, b) => (teamRoundsPlayed.get(teamKey(a)) || 0) - (teamRoundsPlayed.get(teamKey(b)) || 0)
    );

    const pairingSlots: { key: string; pairingIdx: number; side: 'teamA' | 'teamB'; played: number }[] = [];
    for (let i = courtPairings.length - 1; i >= 0; i--) {
      pairingSlots.push({
        key: teamKey(courtPairings[i].teamB),
        pairingIdx: i,
        side: 'teamB',
        played: teamRoundsPlayed.get(teamKey(courtPairings[i].teamB)) || 0,
      });
      pairingSlots.push({
        key: teamKey(courtPairings[i].teamA),
        pairingIdx: i,
        side: 'teamA',
        played: teamRoundsPlayed.get(teamKey(courtPairings[i].teamA)) || 0,
      });
    }
    pairingSlots.sort((a, b) => {
      const idxDiff = b.pairingIdx - a.pairingIdx;
      if (idxDiff !== 0) return idxDiff;
      return b.played - a.played;
    });

    const numToSwap = Math.min(benchSorted.length, pairingSlots.length);
    for (let i = 0; i < numToSwap; i++) {
      const benchTeam = benchSorted[i];
      const slot = pairingSlots[i];
      const benchPlayed = teamRoundsPlayed.get(teamKey(benchTeam)) || 0;
      if (benchPlayed >= slot.played) continue;
      courtPairings[slot.pairingIdx][slot.side] = benchTeam;
    }
  }

  const matches: Match[] = [];
  for (let i = 0; i < Math.min(courtPairings.length, numMatches); i++) {
    matches.push({
      id: createId(),
      teamA: courtPairings[i].teamA,
      teamB: courtPairings[i].teamB,
      sets: cloneSets(initialSets),
      courtId: sortedCourts[i]?.courtId,
    });
  }

  return matches;
}

function buildFixedTeamMatches(
  rankedTeams: string[][],
  sortedCourts: Array<{ courtId?: string; order: number }>,
  initialSets: InitialSets,
  numMatches: number
): Match[] {
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
