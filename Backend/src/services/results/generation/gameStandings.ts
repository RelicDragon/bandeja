import type {
  GenGame as Game,
  GenBasicUser as BasicUser,
  WinnerOfGame,
  GenRound as Round,
  GenMatch as Match,
  GenSetResult as SetResult,
} from './types';
import { getRules } from '../liveScoringEngine/rulebook';
import { getStandingsMatchOutcome } from '../liveScoringEngine/matchWinnerLive';

/** `user.level` on participants is sport-projected for `game.sport` (mapPrismaForGeneration → projectUserForSportContext), not global User.level. */

function isOfficialGenSet(set: SetResult): boolean {
  return !set.role || set.role === 'OFFICIAL';
}

function getSetScoreForDelta(set: SetResult, side: 'A' | 'B'): number {
  if (set.isTieBreak) {
    const aWon = set.teamA > set.teamB;
    return side === 'A' ? (aWon ? 1 : 0) : (aWon ? 0 : 1);
  }
  return side === 'A' ? set.teamA : set.teamB;
}

function getMatchScoresForDelta(sets: SetResult[]): { scoreA: number; scoreB: number } {
  return sets.reduce(
    (acc, set) => ({
      scoreA: acc.scoreA + getSetScoreForDelta(set, 'A'),
      scoreB: acc.scoreB + getSetScoreForDelta(set, 'B'),
    }),
    { scoreA: 0, scoreB: 0 }
  );
}

export interface PlayerStanding {
  user: BasicUser;
  place: number;
  wins: number;
  ties: number;
  losses: number;
  scoresMade: number;
  scoresLost: number;
  points: number;
  roundsWon: number;
  matchesWon: number;
  scoresDelta: number;
}

interface PlayerStats {
  userId: string;
  wins: number;
  ties: number;
  losses: number;
  scoresMade: number;
  scoresLost: number;
  roundsWon: number;
  matchesWon: number;
  scoresDelta: number;
}

/**
 * Match outcome for standings: legal completed sets + timed rules; no winner until finished by rules.
 */
function calculateMatchWinner(match: Match, game: Game): 'teamA' | 'teamB' | 'tie' | null {
  if (!match.sets || match.sets.length === 0) {
    return null;
  }

  const rules = getRules(game);
  const o = getStandingsMatchOutcome(match.sets, rules);
  if (o === 'A') return 'teamA';
  if (o === 'B') return 'teamB';
  if (o === 'tie') return 'tie';
  return null;
}

function calculatePlayerStats(
  playerId: string,
  rounds: Round[],
  game: Game
): PlayerStats {
  const stats: PlayerStats = {
    userId: playerId,
    wins: 0,
    ties: 0,
    losses: 0,
    scoresMade: 0,
    scoresLost: 0,
    roundsWon: 0,
    matchesWon: 0,
    scoresDelta: 0,
  };

  for (const round of rounds) {
    if (!round.matches || round.matches.length === 0) continue;

    for (const match of round.matches) {
      const validSets = match.sets.filter(
        set => (set.teamA > 0 || set.teamB > 0) && isOfficialGenSet(set)
      );
      if (validSets.length === 0) continue;

      const isInTeamA = match.teamA.includes(playerId);
      const isInTeamB = match.teamB.includes(playerId);

      if (!isInTeamA && !isInTeamB) continue;

      if (isInTeamA && isInTeamB) {
        continue;
      }

      const matchWinner = calculateMatchWinner(match, game);
      const { scoreA: totalScoreA, scoreB: totalScoreB } = getMatchScoresForDelta(validSets);

      if (isInTeamA) {
        stats.scoresMade += totalScoreA;
        stats.scoresLost += totalScoreB;
        stats.scoresDelta += totalScoreA - totalScoreB;

        if (matchWinner === 'teamA') {
          stats.wins++;
          stats.matchesWon++;
        } else if (matchWinner === 'teamB') {
          stats.losses++;
        } else if (matchWinner === 'tie') {
          stats.ties++;
        }
      } else if (isInTeamB) {
        stats.scoresMade += totalScoreB;
        stats.scoresLost += totalScoreA;
        stats.scoresDelta += totalScoreB - totalScoreA;

        if (matchWinner === 'teamB') {
          stats.wins++;
          stats.matchesWon++;
        } else if (matchWinner === 'teamA') {
          stats.losses++;
        } else if (matchWinner === 'tie') {
          stats.ties++;
        }
      }
    }
  }

  return stats;
}

function getSortValue(
  stats: PlayerStats,
  winnerOfGame: WinnerOfGame,
  pointsPerWin: number = 0,
  pointsPerTie: number = 0,
  pointsPerLoose: number = 0
): number {
  switch (winnerOfGame) {
    case 'BY_MATCHES_WON':
      return stats.matchesWon;
    case 'BY_POINTS':
      return stats.wins * pointsPerWin + stats.ties * pointsPerTie + stats.losses * pointsPerLoose;
    case 'BY_SCORES_DELTA':
      return stats.scoresDelta;
    case 'BY_SCORES_MADE':
      return stats.scoresMade;
    case 'PLAYOFF_FINALS':
      return 0;
    default:
      return stats.matchesWon;
  }
}

function compareMatchesWon(aStats: PlayerStats, bStats: PlayerStats): number {
  return bStats.matchesWon - aStats.matchesWon;
}

function compareTies(aStats: PlayerStats, bStats: PlayerStats): number {
  return bStats.ties - aStats.ties;
}

function compareScoresDelta(aStats: PlayerStats, bStats: PlayerStats): number {
  return bStats.scoresDelta - aStats.scoresDelta;
}

function compareScoresMade(aStats: PlayerStats, bStats: PlayerStats): number {
  return bStats.scoresMade - aStats.scoresMade;
}

function compareLevelAtStart(aUser: BasicUser, bUser: BasicUser): number {
  return bUser.level - aUser.level;
}

function getHeadToHeadWinner(
  playerAId: string,
  playerBId: string,
  rounds: Round[],
  game: Game
): 'A' | 'B' | 'tie' | null {
  let aWins = 0;
  let bWins = 0;

  for (const round of rounds) {
    if (!round.matches || round.matches.length === 0) continue;

    for (const match of round.matches) {
      const validSets = match.sets.filter(set => set.teamA > 0 || set.teamB > 0);
      if (validSets.length === 0) continue;

      const aInTeamA = match.teamA.includes(playerAId);
      const aInTeamB = match.teamB.includes(playerAId);
      const bInTeamA = match.teamA.includes(playerBId);
      const bInTeamB = match.teamB.includes(playerBId);

      const areOpponents = 
        (aInTeamA && bInTeamB) || (aInTeamB && bInTeamA);

      if (!areOpponents) continue;

      const matchWinner = calculateMatchWinner(match, game);
      
      if (matchWinner === 'teamA') {
        if (aInTeamA) aWins++;
        else bWins++;
      } else if (matchWinner === 'teamB') {
        if (aInTeamB) aWins++;
        else bWins++;
      }
    }
  }

  if (aWins > bWins) return 'A';
  if (bWins > aWins) return 'B';
  if (aWins === bWins && aWins > 0) return 'tie';
  return null;
}

function calculateHeadToHeadMap(
  players: BasicUser[],
  rounds: Round[],
  game: Game
): Map<string, Map<string, 'A' | 'B' | 'tie' | null>> {
  const h2hMap = new Map<string, Map<string, 'A' | 'B' | 'tie' | null>>();
  
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      const result = getHeadToHeadWinner(playerA.id, playerB.id, rounds, game);
      
      if (!h2hMap.has(playerA.id)) {
        h2hMap.set(playerA.id, new Map());
      }
      if (!h2hMap.has(playerB.id)) {
        h2hMap.set(playerB.id, new Map());
      }
      
      h2hMap.get(playerA.id)!.set(playerB.id, result);
      const reverseResult = result === 'A' ? 'B' : result === 'B' ? 'A' : result;
      h2hMap.get(playerB.id)!.set(playerA.id, reverseResult);
    }
  }
  
  return h2hMap;
}

function compareHeadToHead(
  aStanding: PlayerStanding,
  bStanding: PlayerStanding,
  h2hMap: Map<string, Map<string, 'A' | 'B' | 'tie' | null>>
): number {
  const h2h = h2hMap.get(aStanding.user.id)?.get(bStanding.user.id);
  if (h2h === 'A') return -1;
  if (h2h === 'B') return 1;
  return 0;
}

function arePlayersTied(
  a: PlayerStanding,
  b: PlayerStanding,
  aStats: PlayerStats,
  bStats: PlayerStats,
  winnerOfGame: WinnerOfGame,
  h2hMap: Map<string, Map<string, 'A' | 'B' | 'tie' | null>>,
  pointsPerWin: number,
  pointsPerTie: number,
  pointsPerLoose: number
): boolean {
  // Check all stats are equal
  if (
    aStats.wins !== bStats.wins ||
    aStats.ties !== bStats.ties ||
    aStats.losses !== bStats.losses ||
    aStats.matchesWon !== bStats.matchesWon ||
    aStats.scoresDelta !== bStats.scoresDelta
  ) {
    return false;
  }

  // Check points earned (for BY_POINTS mode)
  if (winnerOfGame === 'BY_POINTS') {
    const aPoints = aStats.wins * pointsPerWin + aStats.ties * pointsPerTie + aStats.losses * pointsPerLoose;
    const bPoints = bStats.wins * pointsPerWin + bStats.ties * pointsPerTie + bStats.losses * pointsPerLoose;
    if (aPoints !== bPoints) {
      return false;
    }
  }

  // Check scores made (for BY_SCORES_MADE mode)
  if (winnerOfGame === 'BY_SCORES_MADE') {
    if (aStats.scoresMade !== bStats.scoresMade) {
      return false;
    }
  }

  // Check head-to-head
  const h2h = h2hMap.get(a.user.id)?.get(b.user.id);
  if (h2h !== null && h2h !== 'tie' && h2h !== undefined) {
    return false;
  }

  // Check level
  if (a.user.level !== b.user.level) {
    return false;
  }

  return true;
}

function compareStandings(
  a: PlayerStanding,
  b: PlayerStanding,
  aStats: PlayerStats,
  bStats: PlayerStats,
  winnerOfGame: WinnerOfGame,
  h2hMap: Map<string, Map<string, 'A' | 'B' | 'tie' | null>>,
  pointsPerWin: number = 0,
  pointsPerTie: number = 0,
  pointsPerLoose: number = 0
): number {
  if (winnerOfGame === 'BY_MATCHES_WON') {
    const diff = compareMatchesWon(aStats, bStats);
    if (diff !== 0) return diff;

    const tiesDiff = compareTies(aStats, bStats);
    if (tiesDiff !== 0) return tiesDiff;

    const scoresDiff = compareScoresDelta(aStats, bStats);
    if (scoresDiff !== 0) return scoresDiff;

    const h2hDiff = compareHeadToHead(a, b, h2hMap);
    if (h2hDiff !== 0) return h2hDiff;

    return compareLevelAtStart(a.user, b.user);
  }

  if (winnerOfGame === 'BY_POINTS') {
    const aValue = getSortValue(aStats, winnerOfGame, pointsPerWin, pointsPerTie, pointsPerLoose);
    const bValue = getSortValue(bStats, winnerOfGame, pointsPerWin, pointsPerTie, pointsPerLoose);
    const pointsDiff = bValue - aValue;
    if (pointsDiff !== 0) return pointsDiff;

    const matchesDiff = compareMatchesWon(aStats, bStats);
    if (matchesDiff !== 0) return matchesDiff;

    const tiesDiff = compareTies(aStats, bStats);
    if (tiesDiff !== 0) return tiesDiff;

    const scoresDiff = compareScoresDelta(aStats, bStats);
    if (scoresDiff !== 0) return scoresDiff;

    const h2hDiff = compareHeadToHead(a, b, h2hMap);
    if (h2hDiff !== 0) return h2hDiff;

    return compareLevelAtStart(a.user, b.user);
  }

  if (winnerOfGame === 'BY_SCORES_DELTA') {
    const scoresDiff = compareScoresDelta(aStats, bStats);
    if (scoresDiff !== 0) return scoresDiff;

    const matchesDiff = compareMatchesWon(aStats, bStats);
    if (matchesDiff !== 0) return matchesDiff;

    const tiesDiff = compareTies(aStats, bStats);
    if (tiesDiff !== 0) return tiesDiff;

    const h2hDiff = compareHeadToHead(a, b, h2hMap);
    if (h2hDiff !== 0) return h2hDiff;

    return compareLevelAtStart(a.user, b.user);
  }

  if (winnerOfGame === 'BY_SCORES_MADE') {
    const scoresMadeDiff = compareScoresMade(aStats, bStats);
    if (scoresMadeDiff !== 0) return scoresMadeDiff;

    const matchesDiff = compareMatchesWon(aStats, bStats);
    if (matchesDiff !== 0) return matchesDiff;

    const tiesDiff = compareTies(aStats, bStats);
    if (tiesDiff !== 0) return tiesDiff;

    const scoresDiff = compareScoresDelta(aStats, bStats);
    if (scoresDiff !== 0) return scoresDiff;

    const h2hDiff = compareHeadToHead(a, b, h2hMap);
    if (h2hDiff !== 0) return h2hDiff;

    return compareLevelAtStart(a.user, b.user);
  }

  const aValue = getSortValue(aStats, winnerOfGame, pointsPerWin, pointsPerTie, pointsPerLoose);
  const bValue = getSortValue(bStats, winnerOfGame, pointsPerWin, pointsPerTie, pointsPerLoose);
  return bValue - aValue;
}

/** Covers participants not on any fixed-team roster, or empty team score table. */
function assignResidualPlayerPlaces(standings: PlayerStanding[]) {
  const floor = Math.max(
    0,
    ...standings.map((s) => (Number.isFinite(s.place) && s.place >= 1 ? s.place : 0)),
  );
  let next = floor + 1;
  for (const s of standings) {
    if (!Number.isFinite(s.place) || s.place < 1) {
      s.place = next++;
    }
  }
}

export function calculateGameStandings(
  game: Game,
  rounds: Round[],
  winnerOfGame: WinnerOfGame
): PlayerStanding[] {
  const playingParticipants = game.participants.filter(p => p.status === 'PLAYING');
  const players = playingParticipants.map(p => p.user as BasicUser);

  if (players.length === 0 || rounds.length === 0) {
    return [];
  }

  const playerStatsMap = new Map<string, PlayerStats>();

  for (const player of players) {
    const stats = calculatePlayerStats(player.id, rounds, game);
    playerStatsMap.set(player.id, stats);
  }

  const pointsPerWin = game.pointsPerWin ?? 0;
  const pointsPerTie = game.pointsPerTie ?? 0;
  const pointsPerLoose = game.pointsPerLoose ?? 0;

  const h2hMap = calculateHeadToHeadMap(players, rounds, game);

  const standings: PlayerStanding[] = [];

  for (const player of players) {
    const stats = playerStatsMap.get(player.id);
    if (!stats) continue;

    const isPointsBased = winnerOfGame === 'BY_POINTS';
    const points = isPointsBased 
      ? stats.wins * pointsPerWin + stats.ties * pointsPerTie + stats.losses * pointsPerLoose
      : 0;

    standings.push({
      user: player,
      place: 0,
      wins: stats.wins,
      ties: stats.ties,
      losses: stats.losses,
      scoresMade: stats.scoresMade,
      scoresLost: stats.scoresLost,
      points,
      roundsWon: stats.roundsWon,
      matchesWon: stats.matchesWon,
      scoresDelta: stats.scoresDelta,
    });
  }

  const isMixPairsWithoutFixedTeams = !game.hasFixedTeams && game.genderTeams === 'MIX_PAIRS';

  if (isMixPairsWithoutFixedTeams) {
    const maleStandings = standings.filter(s => s.user.gender === 'MALE');
    const femaleStandings = standings.filter(s => s.user.gender === 'FEMALE');

    const sortStandings = (standingsToSort: PlayerStanding[]) => {
      return standingsToSort.sort((a, b) => {
        const aStats = playerStatsMap.get(a.user.id);
        const bStats = playerStatsMap.get(b.user.id);
        if (!aStats || !bStats) return 0;
        return compareStandings(
          a,
          b,
          aStats,
          bStats,
          winnerOfGame,
          h2hMap,
          pointsPerWin,
          pointsPerTie,
          pointsPerLoose
        );
      });
    };

    const sortedMaleStandings = sortStandings(maleStandings);
    const sortedFemaleStandings = sortStandings(femaleStandings);

    const assignPlaces = (standingsToAssign: PlayerStanding[]) => {
      let currentPlace = 1;
      let i = 0;

      while (i < standingsToAssign.length) {
        const tiedGroup: PlayerStanding[] = [standingsToAssign[i]];
        let j = i + 1;

        while (j < standingsToAssign.length) {
          const prev = standingsToAssign[i];
          const current = standingsToAssign[j];
          const prevStats = playerStatsMap.get(prev.user.id);
          const currentStats = playerStatsMap.get(current.user.id);

          if (prevStats && currentStats) {
            const isTied = arePlayersTied(
              prev,
              current,
              prevStats,
              currentStats,
              winnerOfGame,
              h2hMap,
              pointsPerWin,
              pointsPerTie,
              pointsPerLoose
            );

            if (isTied) {
              tiedGroup.push(current);
              j++;
            } else {
              break;
            }
          } else {
            break;
          }
        }

        for (const standing of tiedGroup) {
          standing.place = currentPlace;
        }

        currentPlace += 1;
        i = j;
      }
    };

    assignPlaces(sortedMaleStandings);
    assignPlaces(sortedFemaleStandings);

    const maxPairs = Math.max(sortedMaleStandings.length, sortedFemaleStandings.length);
    const interleavedStandings: PlayerStanding[] = [];

    for (let i = 0; i < maxPairs; i++) {
      if (i < sortedMaleStandings.length) {
        interleavedStandings.push(sortedMaleStandings[i]);
      }
      if (i < sortedFemaleStandings.length) {
        interleavedStandings.push(sortedFemaleStandings[i]);
      }
    }

    return interleavedStandings;
  }

  if (game.hasFixedTeams && game.fixedTeams && game.fixedTeams.length > 0) {
    interface TeamScore {
      teamId: string;
      teamNumber: number;
      playerIds: string[];
      matchesWon: number;
      wins: number;
      ties: number;
      losses: number;
      totalPoints: number;
      scoresDelta: number;
      pointsEarned: number;
    }

    const teamScoresMap = new Map<string, TeamScore>();
    const fixedTeamsList = game.fixedTeams;
    const userTeamCount = (uid: string) =>
      fixedTeamsList.filter(ft => ft.players.some(p => p.userId === uid)).length;
    const statWeight = (uid: string) =>
      !game.allowUserInMultipleTeams || userTeamCount(uid) <= 1 ? 1 : 1 / userTeamCount(uid);

    for (const fixedTeam of fixedTeamsList) {
      const teamPlayerIds = fixedTeam.players.map(p => p.userId);
      const teamPlayerStandings = standings.filter(s => teamPlayerIds.includes(s.user.id));
      
      if (teamPlayerStandings.length === 0) {
        console.warn(`[CALCULATE GAME STANDINGS] Team ${fixedTeam.id} (teamNumber: ${fixedTeam.teamNumber}) has no players with standings, skipping`);
        continue;
      }

      const teamPlayerStats = teamPlayerStandings
        .map(s => playerStatsMap.get(s.user.id))
        .filter((stats): stats is PlayerStats => stats !== undefined);

      if (teamPlayerStats.length === 0) {
        console.warn(`[CALCULATE GAME STANDINGS] Team ${fixedTeam.id} (teamNumber: ${fixedTeam.teamNumber}) has no players with stats, skipping`);
        continue;
      }
      
      if (teamPlayerStats.length < teamPlayerIds.length) {
        const missingPlayers = teamPlayerIds.filter(id => !standings.some(s => s.user.id === id));
        console.warn(`[CALCULATE GAME STANDINGS] Team ${fixedTeam.id} (teamNumber: ${fixedTeam.teamNumber}) has ${teamPlayerStats.length}/${teamPlayerIds.length} players with stats. Missing players: ${missingPlayers.join(', ')}`);
      }

      const teamScore: TeamScore = {
        teamId: fixedTeam.id,
        teamNumber: fixedTeam.teamNumber,
        playerIds: teamPlayerIds,
        matchesWon: teamPlayerStats.reduce(
          (sum, s) => sum + s.matchesWon * statWeight(s.userId),
          0
        ),
        wins: teamPlayerStats.reduce((sum, s) => sum + s.wins * statWeight(s.userId), 0),
        ties: teamPlayerStats.reduce((sum, s) => sum + s.ties * statWeight(s.userId), 0),
        losses: teamPlayerStats.reduce((sum, s) => sum + s.losses * statWeight(s.userId), 0),
        totalPoints: teamPlayerStats.reduce(
          (sum: number, s) => sum + s.scoresMade * statWeight(s.userId),
          0
        ),
        scoresDelta: teamPlayerStats.reduce(
          (sum: number, s) => sum + s.scoresDelta * statWeight(s.userId),
          0
        ),
        pointsEarned: teamPlayerStats.reduce((sum: number, s) => {
          const rowPts = s.wins * pointsPerWin + s.ties * pointsPerTie + s.losses * pointsPerLoose;
          return sum + rowPts * statWeight(s.userId);
        }, 0),
      };

      teamScoresMap.set(fixedTeam.id, teamScore);
    }

    const compareTeams = (a: TeamScore, b: TeamScore): number => {
      switch (winnerOfGame) {
        case 'BY_MATCHES_WON': {
          const matchesDiff = b.matchesWon - a.matchesWon;
          if (matchesDiff !== 0) return matchesDiff;
          
          const tiesDiff = b.ties - a.ties;
          if (tiesDiff !== 0) return tiesDiff;
          
          const scoresDeltaDiff = b.scoresDelta - a.scoresDelta;
          if (scoresDeltaDiff !== 0) return scoresDeltaDiff;
          
          return 0;
        }
        
        case 'BY_POINTS': {
          const pointsDiff = b.pointsEarned - a.pointsEarned;
          if (pointsDiff !== 0) return pointsDiff;
          
          const matchesDiff2 = b.matchesWon - a.matchesWon;
          if (matchesDiff2 !== 0) return matchesDiff2;
          
          const tiesDiff2 = b.ties - a.ties;
          if (tiesDiff2 !== 0) return tiesDiff2;
          
          const scoresDeltaDiff2 = b.scoresDelta - a.scoresDelta;
          if (scoresDeltaDiff2 !== 0) return scoresDeltaDiff2;
          
          return 0;
        }
        
        case 'BY_SCORES_DELTA': {
          const deltasDiff = b.scoresDelta - a.scoresDelta;
          if (deltasDiff !== 0) return deltasDiff;

          const matchesDiff3 = b.matchesWon - a.matchesWon;
          if (matchesDiff3 !== 0) return matchesDiff3;

          const tiesDiff3 = b.ties - a.ties;
          if (tiesDiff3 !== 0) return tiesDiff3;

          return 0;
        }

        case 'BY_SCORES_MADE': {
          const scoresMadeDiff = b.totalPoints - a.totalPoints;
          if (scoresMadeDiff !== 0) return scoresMadeDiff;

          const matchesDiff4 = b.matchesWon - a.matchesWon;
          if (matchesDiff4 !== 0) return matchesDiff4;

          const tiesDiff4 = b.ties - a.ties;
          if (tiesDiff4 !== 0) return tiesDiff4;

          const scoresDeltaDiff4 = b.scoresDelta - a.scoresDelta;
          if (scoresDeltaDiff4 !== 0) return scoresDeltaDiff4;

          return 0;
        }

        default: {
          const defaultDiff = b.matchesWon - a.matchesWon;
          if (defaultDiff !== 0) return defaultDiff;
          return b.scoresDelta - a.scoresDelta;
        }
      }
    };

    const areTeamsTied = (a: TeamScore, b: TeamScore): boolean => {
      if (
        a.wins !== b.wins ||
        a.ties !== b.ties ||
        a.losses !== b.losses ||
        a.matchesWon !== b.matchesWon ||
        a.scoresDelta !== b.scoresDelta
      ) {
        return false;
      }

      if (winnerOfGame === 'BY_POINTS') {
        if (a.pointsEarned !== b.pointsEarned) {
          return false;
        }
      }

      if (winnerOfGame === 'BY_SCORES_MADE') {
        if (a.totalPoints !== b.totalPoints) {
          return false;
        }
      }

      return true;
    };

    const sortedTeams = Array.from(teamScoresMap.values()).sort(compareTeams);

    const teamPositionMap = new Map<string, number>();
    let currentPosition = 1;
    let i = 0;

    while (i < sortedTeams.length) {
      const tiedGroup: TeamScore[] = [sortedTeams[i]];
      let j = i + 1;

      while (j < sortedTeams.length && areTeamsTied(sortedTeams[i], sortedTeams[j])) {
        tiedGroup.push(sortedTeams[j]);
        j++;
      }

      for (const team of tiedGroup) {
        teamPositionMap.set(team.teamId, currentPosition);
      }

      currentPosition += 1;
      i = j;
    }

    for (const team of sortedTeams) {
      const position = teamPositionMap.get(team.teamId) ?? sortedTeams.length;

      for (const playerId of team.playerIds) {
        const standing = standings.find(s => s.user.id === playerId);
        if (standing) {
          standing.place = standing.place === 0 ? position : Math.min(standing.place, position);
        } else {
          console.warn(`[CALCULATE GAME STANDINGS] Player ${playerId} in team ${team.teamId} (teamNumber: ${team.teamNumber}) has no standing, cannot assign position`);
        }
      }
    }

    const unassignedFixed = standings.filter(s => s.place === 0);
    if (unassignedFixed.length > 0) {
      const assignedPlaces = standings.filter(s => s.place > 0).map(s => s.place);
      let currentPlace =
        assignedPlaces.length > 0 ? Math.max(...assignedPlaces) + 1 : 1;

      unassignedFixed.sort((a, b) => {
        const aStats = playerStatsMap.get(a.user.id);
        const bStats = playerStatsMap.get(b.user.id);
        if (!aStats || !bStats) return 0;
        return compareStandings(
          a,
          b,
          aStats,
          bStats,
          winnerOfGame,
          h2hMap,
          pointsPerWin,
          pointsPerTie,
          pointsPerLoose
        );
      });

      let i = 0;
      while (i < unassignedFixed.length) {
        const tiedGroup: PlayerStanding[] = [unassignedFixed[i]];
        let j = i + 1;

        while (j < unassignedFixed.length) {
          const prev = unassignedFixed[i];
          const current = unassignedFixed[j];
          const prevStats = playerStatsMap.get(prev.user.id);
          const currentStats = playerStatsMap.get(current.user.id);

          if (prevStats && currentStats) {
            const isTied = arePlayersTied(
              prev,
              current,
              prevStats,
              currentStats,
              winnerOfGame,
              h2hMap,
              pointsPerWin,
              pointsPerTie,
              pointsPerLoose
            );

            if (isTied) {
              tiedGroup.push(current);
              j++;
            } else {
              break;
            }
          } else {
            break;
          }
        }

        for (const standing of tiedGroup) {
          standing.place = currentPlace;
        }

        currentPlace += 1;
        i = j;
      }
    }

    standings.sort((a, b) => {
      if (a.place !== b.place) {
        return a.place - b.place;
      }
      const aStats = playerStatsMap.get(a.user.id);
      const bStats = playerStatsMap.get(b.user.id);
      if (!aStats || !bStats) return 0;
      return compareStandings(
        a,
        b,
        aStats,
        bStats,
        winnerOfGame,
        h2hMap,
        pointsPerWin,
        pointsPerTie,
        pointsPerLoose
      );
    });

    assignResidualPlayerPlaces(standings);
    return standings;
  }

  standings.sort((a, b) => {
    const aStats = playerStatsMap.get(a.user.id);
    const bStats = playerStatsMap.get(b.user.id);
    if (!aStats || !bStats) return 0;
    return compareStandings(
      a,
      b,
      aStats,
      bStats,
      winnerOfGame,
      h2hMap,
      pointsPerWin,
      pointsPerTie,
      pointsPerLoose
    );
  });

  let currentPlace = 1;
  let i = 0;

  while (i < standings.length) {
    const tiedGroup: PlayerStanding[] = [standings[i]];
    let j = i + 1;

    while (j < standings.length) {
      const prev = standings[i];
      const current = standings[j];
      const prevStats = playerStatsMap.get(prev.user.id);
      const currentStats = playerStatsMap.get(current.user.id);

      if (prevStats && currentStats) {
        const isTied = arePlayersTied(
          prev,
          current,
          prevStats,
          currentStats,
          winnerOfGame,
          h2hMap,
          pointsPerWin,
          pointsPerTie,
          pointsPerLoose
        );

        if (isTied) {
          tiedGroup.push(current);
          j++;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    for (const standing of tiedGroup) {
      standing.place = currentPlace;
    }

    currentPlace += 1;
    i = j;
  }

  return standings;
}

