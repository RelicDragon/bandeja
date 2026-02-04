import { createId } from '@paralleldrive/cuid2';
import { Match, Round } from '@/types/gameResults';
import { Game } from '@/types';

function getPairKey(player1: string, player2: string): string {
  return player1 < player2 ? `${player1}-${player2}` : `${player2}-${player1}`;
}

function getPairUsageHistory(rounds: Round[]): Map<string, number> {
  const pairCounts = new Map<string, number>();
  
  for (const round of rounds) {
    for (const match of round.matches) {
      const validSets = match.sets.filter(set => set.teamA > 0 || set.teamB > 0);
      if (validSets.length === 0) continue;
      
      if (match.teamA.length >= 2) {
        const pairKey = getPairKey(match.teamA[0], match.teamA[1]);
        pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
      }
      
      if (match.teamB.length >= 2) {
        const pairKey = getPairKey(match.teamB[0], match.teamB[1]);
        pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
      }
    }
  }
  
  return pairCounts;
}

function getIndividualOpponentHistory(rounds: Round[]): Map<string, number> {
  const opponentCounts = new Map<string, number>();
  
  for (const round of rounds) {
    for (const match of round.matches) {
      const validSets = match.sets.filter(set => set.teamA > 0 || set.teamB > 0);
      if (validSets.length === 0) continue;
      
      const allTeamA = match.teamA;
      const allTeamB = match.teamB;
      
      for (const playerA of allTeamA) {
        for (const playerB of allTeamB) {
          const opponentKey = getPairKey(playerA, playerB);
          opponentCounts.set(opponentKey, (opponentCounts.get(opponentKey) || 0) + 1);
        }
      }
    }
  }
  
  return opponentCounts;
}

function getMatchesPlayedCounts(playerIds: string[], rounds: Round[]): Map<string, number> {
  const matchCounts = new Map<string, number>();
  
  for (const playerId of playerIds) {
    matchCounts.set(playerId, 0);
  }
  
  for (const round of rounds) {
    for (const match of round.matches) {
      const validSets = match.sets.filter(set => set.teamA > 0 || set.teamB > 0);
      if (validSets.length === 0) continue;
      
      for (const playerId of match.teamA) {
        if (matchCounts.has(playerId)) {
          matchCounts.set(playerId, (matchCounts.get(playerId) || 0) + 1);
        }
      }
      
      for (const playerId of match.teamB) {
        if (matchCounts.has(playerId)) {
          matchCounts.set(playerId, (matchCounts.get(playerId) || 0) + 1);
        }
      }
    }
  }
  
  return matchCounts;
}

function getOpponentMatchupHistory(rounds: Round[]): Map<string, number> {
  const matchupCounts = new Map<string, number>();
  
  for (const round of rounds) {
    for (const match of round.matches) {
      const validSets = match.sets.filter(set => set.teamA > 0 || set.teamB > 0);
      if (validSets.length === 0) continue;
      
      if (match.teamA.length >= 2 && match.teamB.length >= 2) {
        const pairA = getPairKey(match.teamA[0], match.teamA[1]);
        const pairB = getPairKey(match.teamB[0], match.teamB[1]);
        const matchupKey = pairA < pairB ? `${pairA}-vs-${pairB}` : `${pairB}-vs-${pairA}`;
        matchupCounts.set(matchupKey, (matchupCounts.get(matchupKey) || 0) + 1);
      }
    }
  }
  
  return matchupCounts;
}

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

interface PairInfo {
  pair: string[];
  pairKey: string;
  usageCount: number;
  maxMatches: number;
  totalMatches: number;
  score: number;
}

function generateAllPossiblePairs(
  participants: any[],
  usedPairCounts: Map<string, number>,
  matchesPlayedCounts: Map<string, number>,
  genderTeams?: string
): PairInfo[] {
  const isMixPairs = genderTeams === 'MIX_PAIRS';
  const allPairs: PairInfo[] = [];
  
  if (isMixPairs) {
    const malePlayers = participants
      .filter(p => p.user.gender === 'MALE')
      .map(p => p.userId);
    const femalePlayers = participants
      .filter(p => p.user.gender === 'FEMALE')
      .map(p => p.userId);
    
    for (const male of malePlayers) {
      for (const female of femalePlayers) {
        const pairKey = getPairKey(male, female);
        const usageCount = usedPairCounts.get(pairKey) || 0;
        const matchesMale = matchesPlayedCounts.get(male) || 0;
        const matchesFemale = matchesPlayedCounts.get(female) || 0;
        const maxMatches = Math.max(matchesMale, matchesFemale);
        const totalMatches = matchesMale + matchesFemale;
        
        allPairs.push({
          pair: [male, female],
          pairKey,
          usageCount,
          maxMatches,
          totalMatches,
          score: usageCount * 1000000 + maxMatches * 1000 + totalMatches * 10
        });
      }
    }
  } else {
    const players = genderTeams === 'MEN'
      ? participants.filter(p => p.user.gender === 'MALE').map(p => p.userId)
      : genderTeams === 'WOMEN'
      ? participants.filter(p => p.user.gender === 'FEMALE').map(p => p.userId)
      : participants.map(p => p.userId);
    
    for (let i = 0; i < players.length - 1; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const p1 = players[i];
        const p2 = players[j];
        const pairKey = getPairKey(p1, p2);
        const usageCount = usedPairCounts.get(pairKey) || 0;
        const matchesP1 = matchesPlayedCounts.get(p1) || 0;
        const matchesP2 = matchesPlayedCounts.get(p2) || 0;
        const maxMatches = Math.max(matchesP1, matchesP2);
        const totalMatches = matchesP1 + matchesP2;
        
        allPairs.push({
          pair: [p1, p2],
          pairKey,
          usageCount,
          maxMatches,
          totalMatches,
          score: usageCount * 1000000 + maxMatches * 1000 + totalMatches * 10
        });
      }
    }
  }
  
  allPairs.sort((a, b) => {
    if (a.usageCount !== b.usageCount) return a.usageCount - b.usageCount;
    if (a.maxMatches !== b.maxMatches) return a.maxMatches - b.maxMatches;
    return a.totalMatches - b.totalMatches;
  });
  
  return allPairs;
}

function selectPairsFromSorted(sortedPairs: PairInfo[], neededPairs: number, randomize = false): string[][] {
  const selected: string[][] = [];
  const usedPlayers = new Set<string>();
  const usedPairKeys = new Set<string>();
  
  let pairsList = sortedPairs;
  if (randomize) {
    const groups = new Map<string, PairInfo[]>();
    for (const pairInfo of sortedPairs) {
      const key = `${pairInfo.usageCount}-${pairInfo.maxMatches}-${pairInfo.totalMatches}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(pairInfo);
    }
    
    pairsList = [];
    for (const group of groups.values()) {
      pairsList.push(...shuffleArray(group));
    }
  }
  
  for (const pairInfo of pairsList) {
    if (selected.length >= neededPairs) break;
    
    const [p1, p2] = pairInfo.pair;
    
    if (usedPlayers.has(p1) || usedPlayers.has(p2)) continue;
    if (usedPairKeys.has(pairInfo.pairKey)) continue;
    
    selected.push(pairInfo.pair);
    usedPlayers.add(p1);
    usedPlayers.add(p2);
    usedPairKeys.add(pairInfo.pairKey);
  }
  
  return selected;
}

function selectPairsPlayerCentric(
  allPairs: PairInfo[],
  players: string[],
  matchesPlayedCounts: Map<string, number>,
  neededPairs: number
): string[][] {
  const sortedPlayers = [...players].sort((a, b) => {
    const matchesA = matchesPlayedCounts.get(a) || 0;
    const matchesB = matchesPlayedCounts.get(b) || 0;
    if (matchesA !== matchesB) return matchesA - matchesB;
    return Math.random() - 0.5;
  });
  
  const pairMap = new Map<string, PairInfo>();
  for (const pairInfo of allPairs) {
    pairMap.set(pairInfo.pairKey, pairInfo);
  }
  
  const selected: string[][] = [];
  const usedPlayers = new Set<string>();
  
  for (let i = 0; i < sortedPlayers.length - 1 && selected.length < neededPairs; i++) {
    const p1 = sortedPlayers[i];
    if (usedPlayers.has(p1)) continue;
    
    let bestPair: PairInfo | null = null;
    let bestScore = Infinity;
    
    for (let j = i + 1; j < sortedPlayers.length; j++) {
      const p2 = sortedPlayers[j];
      if (usedPlayers.has(p2)) continue;
      
      const pairKey = getPairKey(p1, p2);
      const pairInfo = pairMap.get(pairKey);
      
      if (!pairInfo) continue;
      
      if (pairInfo.score < bestScore) {
        bestScore = pairInfo.score;
        bestPair = pairInfo;
      }
    }
    
    if (bestPair) {
      selected.push(bestPair.pair);
      usedPlayers.add(bestPair.pair[0]);
      usedPlayers.add(bestPair.pair[1]);
    }
  }
  
  return selected;
}

function generateAllPossiblePairsFromFixedTeams(
  game: Game,
  usedPairCounts: Map<string, number>,
  matchesPlayedCounts: Map<string, number>
): PairInfo[] {
  const fixedTeams = game.fixedTeams || [];
  let teamPairs = fixedTeams.map(team => team.players.map(p => p.userId));
  
  if (game.genderTeams === 'MEN') {
    teamPairs = fixedTeams
      .filter(team => team.players.every(p => p.user.gender === 'MALE'))
      .map(team => team.players.map(p => p.userId));
  } else if (game.genderTeams === 'WOMEN') {
    teamPairs = fixedTeams
      .filter(team => team.players.every(p => p.user.gender === 'FEMALE'))
      .map(team => team.players.map(p => p.userId));
  } else if (game.genderTeams === 'MIX_PAIRS') {
    teamPairs = fixedTeams
      .filter(team => {
        const genders = team.players.map(p => p.user.gender);
        return genders.includes('MALE') && genders.includes('FEMALE') &&
               !genders.includes('PREFER_NOT_TO_SAY');
      })
      .map(team => team.players.map(p => p.userId));
  } else if (game.genderTeams !== 'ANY' && game.genderTeams) {
    teamPairs = fixedTeams
      .filter(team => team.players.every(p => p.user.gender !== 'PREFER_NOT_TO_SAY'))
      .map(team => team.players.map(p => p.userId));
  }
  
  const allPairs: PairInfo[] = [];
  
  for (const pair of teamPairs) {
    if (pair.length < 2) continue;
    
    const p1 = pair[0];
    const p2 = pair[1];
    const pairKey = getPairKey(p1, p2);
    const usageCount = usedPairCounts.get(pairKey) || 0;
    const matchesP1 = matchesPlayedCounts.get(p1) || 0;
    const matchesP2 = matchesPlayedCounts.get(p2) || 0;
    const maxMatches = Math.max(matchesP1, matchesP2);
    const totalMatches = matchesP1 + matchesP2;
    
    allPairs.push({
      pair: [p1, p2],
      pairKey,
      usageCount,
      maxMatches,
      totalMatches,
      score: usageCount * 1000000 + maxMatches * 1000 + totalMatches * 10
    });
  }
  
  allPairs.sort((a, b) => {
    if (a.usageCount !== b.usageCount) return a.usageCount - b.usageCount;
    if (a.maxMatches !== b.maxMatches) return a.maxMatches - b.maxMatches;
    return a.totalMatches - b.totalMatches;
  });
  
  return allPairs;
}

interface MatchupInfo {
  pairAIndex: number;
  pairBIndex: number;
  teamMatchupCount: number;
  maxIndividualOpponentCount: number;
  score: number;
}

function generateAllPossibleMatchups(
  pairs: string[][],
  opponentMatchups: Map<string, number>,
  individualOpponentHistory: Map<string, number>
): MatchupInfo[] {
  const allMatchups: MatchupInfo[] = [];
  
  for (let i = 0; i < pairs.length - 1; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const pairA = pairs[i];
      const pairB = pairs[j];
      const pairAKey = getPairKey(pairA[0], pairA[1]);
      const pairBKey = getPairKey(pairB[0], pairB[1]);
      const matchupKey = pairAKey < pairBKey ? `${pairAKey}-vs-${pairBKey}` : `${pairBKey}-vs-${pairAKey}`;
      const teamMatchupCount = opponentMatchups.get(matchupKey) || 0;
      
      let maxIndividualOpponentCount = 0;
      for (const playerA of pairA) {
        for (const playerB of pairB) {
          const opponentKey = getPairKey(playerA, playerB);
          const count = individualOpponentHistory.get(opponentKey) || 0;
          maxIndividualOpponentCount = Math.max(maxIndividualOpponentCount, count);
        }
      }
      
      allMatchups.push({
        pairAIndex: i,
        pairBIndex: j,
        teamMatchupCount,
        maxIndividualOpponentCount,
        score: teamMatchupCount * 1000 + maxIndividualOpponentCount * 10
      });
    }
  }
  
  allMatchups.sort((a, b) => {
    if (a.teamMatchupCount !== b.teamMatchupCount) return a.teamMatchupCount - b.teamMatchupCount;
    return a.maxIndividualOpponentCount - b.maxIndividualOpponentCount;
  });
  
  return allMatchups;
}

function selectMatchupsFromSorted(sortedMatchups: MatchupInfo[], numMatches: number, randomize = false): MatchupInfo[] {
  const selected: MatchupInfo[] = [];
  const usedPairIndices = new Set<number>();
  
  let matchupsList = sortedMatchups;
  if (randomize) {
    const groups = new Map<string, MatchupInfo[]>();
    for (const matchup of sortedMatchups) {
      const key = `${matchup.teamMatchupCount}-${matchup.maxIndividualOpponentCount}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(matchup);
    }
    
    matchupsList = [];
    for (const group of groups.values()) {
      matchupsList.push(...shuffleArray(group));
    }
  }
  
  for (const matchup of matchupsList) {
    if (selected.length >= numMatches) break;
    
    if (usedPairIndices.has(matchup.pairAIndex) || usedPairIndices.has(matchup.pairBIndex)) continue;
    
    selected.push(matchup);
    usedPairIndices.add(matchup.pairAIndex);
    usedPairIndices.add(matchup.pairBIndex);
  }
  
  return selected;
}

export function generateRandomRound(
  game: Game,
  previousRounds: Round[],
  initialSets: Array<{ teamA: number; teamB: number }>
): Match[] {
  let playingParticipants = game.participants.filter(p => p.status === 'PLAYING');
  
  if (game.genderTeams === 'MEN') {
    playingParticipants = playingParticipants.filter(p => p.user.gender === 'MALE');
  } else if (game.genderTeams === 'WOMEN') {
    playingParticipants = playingParticipants.filter(p => p.user.gender === 'FEMALE');
  } else if (game.genderTeams === 'MIX_PAIRS') {
    playingParticipants = playingParticipants.filter(p => 
      p.user.gender === 'MALE' || p.user.gender === 'FEMALE'
    );
  } else if (game.genderTeams && game.genderTeams !== 'ANY') {
    playingParticipants = playingParticipants.filter(p => 
      p.user.gender !== 'PREFER_NOT_TO_SAY'
    );
  }
  
  const numPlayers = playingParticipants.length;
  
  if (numPlayers < 4) {
    return [];
  }
  
  const numCourts = game.gameCourts?.length || 1;
  const numMatches = Math.min(numCourts, Math.floor(numPlayers / 4));
  
  const sortedCourts = game.gameCourts 
    ? [...game.gameCourts].sort((a, b) => a.order - b.order)
    : [];
  
  const shuffledParticipants = shuffleArray([...playingParticipants]);
  
  const players = shuffledParticipants.map(p => p.userId);
  const usedPairCounts = getPairUsageHistory(previousRounds);
  const neededPairs = numMatches * 2;
  
  let allPairs: PairInfo[];
  let allPlayerIds: string[];
  let matchesPlayedCounts: Map<string, number>;
  
  if (game.hasFixedTeams && game.fixedTeams && game.fixedTeams.length > 0) {
    const shuffledGame = {
      ...game,
      fixedTeams: shuffleArray([...game.fixedTeams])
    };
    allPlayerIds = shuffledGame.fixedTeams.flatMap(team => team.players.map(p => p.userId));
    matchesPlayedCounts = getMatchesPlayedCounts(allPlayerIds, previousRounds);
    allPairs = generateAllPossiblePairsFromFixedTeams(shuffledGame, usedPairCounts, matchesPlayedCounts);
  } else {
    const filteredPlayers = game.genderTeams === 'MEN'
      ? shuffledParticipants.filter(p => p.user.gender === 'MALE').map(p => p.userId)
      : game.genderTeams === 'WOMEN'
      ? shuffledParticipants.filter(p => p.user.gender === 'FEMALE').map(p => p.userId)
      : players;
    allPlayerIds = filteredPlayers;
    matchesPlayedCounts = getMatchesPlayedCounts(allPlayerIds, previousRounds);
    allPairs = generateAllPossiblePairs(shuffledParticipants, usedPairCounts, matchesPlayedCounts, game.genderTeams);
  }
  
  const pairsByUsage = new Map<number, PairInfo[]>();
  for (const pairInfo of allPairs) {
    const usageKey = pairInfo.usageCount;
    if (!pairsByUsage.has(usageKey)) {
      pairsByUsage.set(usageKey, []);
    }
    pairsByUsage.get(usageKey)!.push(pairInfo);
  }
  
  const sortedUsageLevels = Array.from(pairsByUsage.keys()).sort((a, b) => a - b);
  
  let pairs: string[][] | null = null;
  
  for (let levelIndex = 0; levelIndex < sortedUsageLevels.length; levelIndex++) {
    const availablePairsForLevel: PairInfo[] = [];
    
    for (let i = 0; i <= levelIndex; i++) {
      availablePairsForLevel.push(...pairsByUsage.get(sortedUsageLevels[i])!);
    }
    
    for (let attempt = 0; attempt < 100; attempt++) {
      const selectedPairs = selectPairsFromSorted(availablePairsForLevel, neededPairs, attempt > 0);
      if (selectedPairs.length === neededPairs) {
        pairs = selectedPairs;
        break;
      }
    }
    
    if (pairs) break;
    
    for (let attempt = 0; attempt < 10; attempt++) {
      const selectedPairs = selectPairsPlayerCentric(availablePairsForLevel, allPlayerIds, matchesPlayedCounts, neededPairs);
      if (selectedPairs.length === neededPairs) {
        pairs = selectedPairs;
        break;
      }
    }
    
    if (pairs) break;
  }
  
  if (!pairs) {
    pairs = selectPairsFromSorted(allPairs, neededPairs, false);
  }
  
  const opponentMatchups = getOpponentMatchupHistory(previousRounds);
  const individualOpponentHistory = getIndividualOpponentHistory(previousRounds);
  
  const allMatchups = generateAllPossibleMatchups(pairs, opponentMatchups, individualOpponentHistory);
  
  const matchupsByLevel = new Map<string, MatchupInfo[]>();
  for (const matchup of allMatchups) {
    const levelKey = `${matchup.teamMatchupCount}-${matchup.maxIndividualOpponentCount}`;
    if (!matchupsByLevel.has(levelKey)) {
      matchupsByLevel.set(levelKey, []);
    }
    matchupsByLevel.get(levelKey)!.push(matchup);
  }
  
  const sortedLevels = Array.from(matchupsByLevel.keys()).sort((a, b) => {
    const [aTeam, aInd] = a.split('-').map(Number);
    const [bTeam, bInd] = b.split('-').map(Number);
    if (aTeam !== bTeam) return aTeam - bTeam;
    return aInd - bInd;
  });
  
  for (const level of sortedLevels) {
    const matchupsAtLevel = matchupsByLevel.get(level)!;
    
    for (let attempt = 0; attempt < 100; attempt++) {
      const selectedMatchups = selectMatchupsFromSorted(matchupsAtLevel, numMatches, attempt > 0);
      if (selectedMatchups.length === numMatches) {
        return selectedMatchups.map((matchup, idx) => ({
          id: createId(),
          teamA: pairs[matchup.pairAIndex],
          teamB: pairs[matchup.pairBIndex],
          sets: initialSets,
          courtId: sortedCourts[idx]?.courtId,
        }));
      }
    }
  }
  
  const selectedMatchups = selectMatchupsFromSorted(allMatchups, numMatches, false);
  return selectedMatchups.map((matchup, idx) => ({
    id: createId(),
    teamA: pairs[matchup.pairAIndex],
    teamB: pairs[matchup.pairBIndex],
    sets: initialSets,
    courtId: sortedCourts[idx]?.courtId,
  }));
}

