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

function generateRandomPairs(
  participants: any[],
  previousRounds: Round[],
  numMatches: number,
  genderTeams?: string
): string[][] {
  const players = participants.map(p => p.userId);
  const usedPairCounts = getPairUsageHistory(previousRounds);
  const matchesPlayedCounts = getMatchesPlayedCounts(players, previousRounds);
  
  const isMixPairs = genderTeams === 'MIX_PAIRS';
  let malePlayers: string[] = [];
  let femalePlayers: string[] = [];
  
  if (isMixPairs) {
    malePlayers = participants
      .filter(p => p.user.gender === 'MALE')
      .map(p => p.userId);
    femalePlayers = participants
      .filter(p => p.user.gender === 'FEMALE')
      .map(p => p.userId);
  }
  
  const filteredPlayers = genderTeams === 'MEN'
    ? participants.filter(p => p.user.gender === 'MALE').map(p => p.userId)
    : genderTeams === 'WOMEN'
    ? participants.filter(p => p.user.gender === 'FEMALE').map(p => p.userId)
    : players;
  
  const sortedPlayers = shuffleArray([...filteredPlayers]).sort((a, b) => {
    const matchesA = matchesPlayedCounts.get(a) || 0;
    const matchesB = matchesPlayedCounts.get(b) || 0;
    return matchesA - matchesB;
  });
  
  const pairs: string[][] = [];
  const usedInThisRound = new Set<string>();
  const neededPairs = numMatches * 2;
  
  let attempts = 0;
  const maxAttempts = 100;
  
  while (pairs.length < neededPairs && attempts < maxAttempts) {
    attempts++;
    
    const availablePlayers = sortedPlayers.filter(p => !usedInThisRound.has(p));
    
    if (availablePlayers.length < 2) {
      break;
    }
    
    let pair: string[] | null = null;
    
    if (isMixPairs) {
      const availableMales = shuffleArray(malePlayers
        .filter(p => !usedInThisRound.has(p)))
        .sort((a, b) => {
          const matchesA = matchesPlayedCounts.get(a) || 0;
          const matchesB = matchesPlayedCounts.get(b) || 0;
          return matchesA - matchesB;
        });
      const availableFemales = shuffleArray(femalePlayers
        .filter(p => !usedInThisRound.has(p)))
        .sort((a, b) => {
          const matchesA = matchesPlayedCounts.get(a) || 0;
          const matchesB = matchesPlayedCounts.get(b) || 0;
          return matchesA - matchesB;
        });
      
      if (availableMales.length > 0 && availableFemales.length > 0) {
        const candidatePairs: Array<{ pair: string[]; score: number }> = [];
        
        for (const male of availableMales) {
          for (const female of availableFemales) {
            const pairKey = getPairKey(male, female);
            const usageCount = usedPairCounts.get(pairKey) || 0;
            const matchesMale = matchesPlayedCounts.get(male) || 0;
            const matchesFemale = matchesPlayedCounts.get(female) || 0;
            const maxMatches = Math.max(matchesMale, matchesFemale);
            const totalMatches = matchesMale + matchesFemale;
            
            candidatePairs.push({
              pair: [male, female],
              score: maxMatches * 10000 + totalMatches * 100 + usageCount
            });
          }
        }
        
        candidatePairs.sort((a, b) => a.score - b.score);
        const bestScore = candidatePairs[0]?.score;
        const bestPairs = candidatePairs.filter(p => p.score === bestScore);
        pair = bestPairs[Math.floor(Math.random() * bestPairs.length)]?.pair || null;
      }
    } else {
      const candidatePairs: Array<{ pair: string[]; score: number }> = [];
      
      for (let i = 0; i < availablePlayers.length - 1; i++) {
        for (let j = i + 1; j < availablePlayers.length; j++) {
          const p1 = availablePlayers[i];
          const p2 = availablePlayers[j];
          const pairKey = getPairKey(p1, p2);
          const usageCount = usedPairCounts.get(pairKey) || 0;
          const matchesP1 = matchesPlayedCounts.get(p1) || 0;
          const matchesP2 = matchesPlayedCounts.get(p2) || 0;
          const maxMatches = Math.max(matchesP1, matchesP2);
          const totalMatches = matchesP1 + matchesP2;
          
          candidatePairs.push({
            pair: [p1, p2],
            score: maxMatches * 10000 + totalMatches * 100 + usageCount
          });
        }
      }
      
      candidatePairs.sort((a, b) => a.score - b.score);
      const bestScore = candidatePairs[0]?.score;
      const bestPairs = candidatePairs.filter(p => p.score === bestScore);
      pair = bestPairs[Math.floor(Math.random() * bestPairs.length)]?.pair || null;
    }
    
    if (pair) {
      pairs.push(pair);
      usedInThisRound.add(pair[0]);
      usedInThisRound.add(pair[1]);
      
      const pairKey = getPairKey(pair[0], pair[1]);
      usedPairCounts.set(pairKey, (usedPairCounts.get(pairKey) || 0) + 1);
    } else {
      break;
    }
  }
  
  return pairs;
}

function generateRandomRoundWithFixedTeams(
  game: Game,
  previousRounds: Round[],
  numMatches: number
): string[][] {
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
  
  if (teamPairs.length < 2) {
    return [];
  }
  
  const usedPairCounts = getPairUsageHistory(previousRounds);
  const allPlayerIds = teamPairs.flat();
  const matchesPlayedCounts = getMatchesPlayedCounts(allPlayerIds, previousRounds);
  
  const selectedPairs: string[][] = [];
  const usedTeamIndices = new Set<number>();
  
  for (let i = 0; i < numMatches * 2 && selectedPairs.length < numMatches * 2; i++) {
    const candidates: Array<{ index: number; score: number }> = [];
    
    for (let j = 0; j < teamPairs.length; j++) {
      if (usedTeamIndices.has(j)) continue;
      
      const pair = teamPairs[j];
      if (pair.length < 2) continue;
      
      const pairKey = getPairKey(pair[0], pair[1]);
      const usage = usedPairCounts.get(pairKey) || 0;
      const matchesP1 = matchesPlayedCounts.get(pair[0]) || 0;
      const matchesP2 = matchesPlayedCounts.get(pair[1]) || 0;
      const totalMatches = matchesP1 + matchesP2;
      
      candidates.push({
        index: j,
        score: totalMatches * 100 + usage
      });
    }
    
    if (candidates.length === 0) break;
    
    candidates.sort((a, b) => a.score - b.score);
    const bestScore = candidates[0].score;
    const bestCandidates = candidates.filter(c => c.score === bestScore);
    const selected = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
    
    if (selected) {
      selectedPairs.push(teamPairs[selected.index]);
      usedTeamIndices.add(selected.index);
    }
  }
  
  return selectedPairs;
}

export function generateRandomRound(
  game: Game,
  previousRounds: Round[],
  initialSets: Array<{ teamA: number; teamB: number }>
): Match[] {
  let playingParticipants = game.participants.filter(p => p.isPlaying);
  
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
  
  let pairs: string[][];
  
  if (game.hasFixedTeams && game.fixedTeams && game.fixedTeams.length > 0) {
    pairs = generateRandomRoundWithFixedTeams(game, previousRounds, numMatches);
  } else {
    pairs = generateRandomPairs(playingParticipants, previousRounds, numMatches, game.genderTeams);
  }
  
  const shuffledPairs = shuffleArray(pairs);
  const opponentMatchups = getOpponentMatchupHistory(previousRounds);
  const matches: Match[] = [];
  const usedPairIndices = new Set<number>();
  
  for (let matchIndex = 0; matchIndex < numMatches && matches.length < numMatches; matchIndex++) {
    let bestMatchup: { pairAIndex: number; pairBIndex: number; score: number } | null = null;
    
    for (let i = 0; i < shuffledPairs.length; i++) {
      if (usedPairIndices.has(i)) continue;
      
      for (let j = i + 1; j < shuffledPairs.length; j++) {
        if (usedPairIndices.has(j)) continue;
        
        const pairA = shuffledPairs[i];
        const pairB = shuffledPairs[j];
        const pairAKey = getPairKey(pairA[0], pairA[1]);
        const pairBKey = getPairKey(pairB[0], pairB[1]);
        const matchupKey = pairAKey < pairBKey ? `${pairAKey}-vs-${pairBKey}` : `${pairBKey}-vs-${pairAKey}`;
        const matchupCount = opponentMatchups.get(matchupKey) || 0;
        
        const score = matchupCount;
        
        if (!bestMatchup || score < bestMatchup.score || 
            (score === bestMatchup.score && Math.random() < 0.5)) {
          bestMatchup = { pairAIndex: i, pairBIndex: j, score };
        }
      }
    }
    
    if (bestMatchup) {
      matches.push({
        id: createId(),
        teamA: shuffledPairs[bestMatchup.pairAIndex],
        teamB: shuffledPairs[bestMatchup.pairBIndex],
        sets: initialSets,
        courtId: sortedCourts[matches.length]?.courtId,
      });
      
      usedPairIndices.add(bestMatchup.pairAIndex);
      usedPairIndices.add(bestMatchup.pairBIndex);
    } else {
      const availableIndices = shuffledPairs
        .map((_, idx) => idx)
        .filter(idx => !usedPairIndices.has(idx));
      
      if (availableIndices.length >= 2) {
        matches.push({
          id: createId(),
          teamA: shuffledPairs[availableIndices[0]],
          teamB: shuffledPairs[availableIndices[1]],
          sets: initialSets,
          courtId: sortedCourts[matches.length]?.courtId,
        });
        
        usedPairIndices.add(availableIndices[0]);
        usedPairIndices.add(availableIndices[1]);
      }
    }
  }
  
  return matches;
}

