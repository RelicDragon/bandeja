import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function getPairKey(player1: string, player2: string): string {
  return player1 < player2 ? `${player1}-${player2}` : `${player2}-${player1}`;
}

interface Match {
  teamA: string[];
  teamB: string[];
}

interface Round {
  matches: Match[];
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

function getIndividualOpponentHistory(rounds: Round[]): Map<string, number> {
  const opponentCounts = new Map<string, number>();
  
  for (const round of rounds) {
    for (const match of round.matches) {
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
  players: string[],
  previousRounds: Round[],
  numMatches: number
): string[][] {
  const usedPairCounts = getPairUsageHistory(previousRounds);
  const matchesPlayedCounts = getMatchesPlayedCounts(players, previousRounds);
  
  const sortedPlayers = shuffleArray([...players]).sort((a, b) => {
    const matchesA = matchesPlayedCounts.get(a) || 0;
    const matchesB = matchesPlayedCounts.get(b) || 0;
    return matchesA - matchesB;
  });
  
  const pairs: string[][] = [];
  const usedInThisRound = new Set<string>();
  const neededPairs = numMatches * 2;
  
  let attempts = 0;
  const maxAttempts = 10000;
  
  while (pairs.length < neededPairs && attempts < maxAttempts) {
    attempts++;
    
    const availablePlayers = sortedPlayers.filter(p => !usedInThisRound.has(p));
    
    if (availablePlayers.length < 2) {
      break;
    }
    
    const candidatePairs: Array<{ pair: string[]; score: number }> = [];
    const unusedPairs: Array<{ pair: string[]; score: number }> = [];
    
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
        
        const candidate = {
          pair: [p1, p2],
          score: maxMatches * 1000 + totalMatches * 10
        };
        
        if (usageCount === 0) {
          unusedPairs.push(candidate);
        } else {
          candidatePairs.push({
            pair: [p1, p2],
            score: usageCount * 1000000 + maxMatches * 1000 + totalMatches * 10
          });
        }
      }
    }
    
    let pair: string[] | null = null;
    
    if (unusedPairs.length > 0) {
      unusedPairs.sort((a, b) => a.score - b.score);
      const bestScore = unusedPairs[0]?.score;
      const bestPairs = unusedPairs.filter(p => p.score === bestScore);
      pair = bestPairs[Math.floor(Math.random() * bestPairs.length)]?.pair || null;
    } else if (candidatePairs.length > 0) {
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
  fixedTeams: string[][],
  previousRounds: Round[],
  numMatches: number
): string[][] {
  const usedPairCounts = getPairUsageHistory(previousRounds);
  const allPlayerIds = fixedTeams.flat();
  const matchesPlayedCounts = getMatchesPlayedCounts(allPlayerIds, previousRounds);
  
  const selectedPairs: string[][] = [];
  const usedTeamIndices = new Set<number>();
  
  for (let i = 0; i < numMatches * 2 && selectedPairs.length < numMatches * 2; i++) {
    const unusedCandidates: Array<{ index: number; score: number }> = [];
    const usedCandidates: Array<{ index: number; score: number }> = [];
    
    for (let j = 0; j < fixedTeams.length; j++) {
      if (usedTeamIndices.has(j)) continue;
      
      const pair = fixedTeams[j];
      if (pair.length < 2) continue;
      
      const pairKey = getPairKey(pair[0], pair[1]);
      const usage = usedPairCounts.get(pairKey) || 0;
      const matchesP1 = matchesPlayedCounts.get(pair[0]) || 0;
      const matchesP2 = matchesPlayedCounts.get(pair[1]) || 0;
      const totalMatches = matchesP1 + matchesP2;
      
      const candidate = {
        index: j,
        score: totalMatches * 100
      };
      
      if (usage === 0) {
        unusedCandidates.push(candidate);
      } else {
        usedCandidates.push({
          index: j,
          score: usage * 1000000 + totalMatches * 100
        });
      }
    }
    
    let selected: { index: number; score: number } | undefined;
    
    if (unusedCandidates.length > 0) {
      unusedCandidates.sort((a, b) => a.score - b.score);
      const bestScore = unusedCandidates[0].score;
      const bestCandidates = unusedCandidates.filter(c => c.score === bestScore);
      selected = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
    } else if (usedCandidates.length > 0) {
      usedCandidates.sort((a, b) => a.score - b.score);
      const bestScore = usedCandidates[0].score;
      const bestCandidates = usedCandidates.filter(c => c.score === bestScore);
      selected = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
    }
    
    if (selected) {
      selectedPairs.push(fixedTeams[selected.index]);
      usedTeamIndices.add(selected.index);
    } else {
      break;
    }
  }
  
  return selectedPairs;
}

function generateRandomRound(
  players: string[],
  fixedTeams: string[][] | null,
  previousRounds: Round[],
  numMatches: number
): Match[] {
  let pairs: string[][];
  
  if (fixedTeams && fixedTeams.length > 0) {
    pairs = generateRandomRoundWithFixedTeams(fixedTeams, previousRounds, numMatches);
  } else {
    pairs = generateRandomPairs(players, previousRounds, numMatches);
  }
  
  const shuffledPairs = shuffleArray(pairs);
  const opponentMatchups = getOpponentMatchupHistory(previousRounds);
  const individualOpponentHistory = getIndividualOpponentHistory(previousRounds);
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
        const teamMatchupCount = opponentMatchups.get(matchupKey) || 0;
        
        let maxIndividualOpponentCount = 0;
        for (const playerA of pairA) {
          for (const playerB of pairB) {
            const opponentKey = getPairKey(playerA, playerB);
            const count = individualOpponentHistory.get(opponentKey) || 0;
            maxIndividualOpponentCount = Math.max(maxIndividualOpponentCount, count);
          }
        }
        
        const teamMatchupPenalty = teamMatchupCount > 0 ? Math.pow(10, teamMatchupCount + 2) : 0;
        const individualOpponentPenalty = maxIndividualOpponentCount > 0 ? Math.pow(10, maxIndividualOpponentCount + 1) : 0;
        const score = teamMatchupPenalty + individualOpponentPenalty + teamMatchupCount * 100 + maxIndividualOpponentCount * 10;
        
        if (!bestMatchup || score < bestMatchup.score || 
            (score === bestMatchup.score && Math.random() < 0.5)) {
          bestMatchup = { pairAIndex: i, pairBIndex: j, score };
        }
      }
    }
    
    if (bestMatchup) {
      matches.push({
        teamA: shuffledPairs[bestMatchup.pairAIndex],
        teamB: shuffledPairs[bestMatchup.pairBIndex],
      });
      
      usedPairIndices.add(bestMatchup.pairAIndex);
      usedPairIndices.add(bestMatchup.pairBIndex);
    } else {
      const availableIndices = shuffledPairs
        .map((_, idx) => idx)
        .filter(idx => !usedPairIndices.has(idx));
      
      if (availableIndices.length >= 2) {
        matches.push({
          teamA: shuffledPairs[availableIndices[0]],
          teamB: shuffledPairs[availableIndices[1]],
        });
        
        usedPairIndices.add(availableIndices[0]);
        usedPairIndices.add(availableIndices[1]);
      }
    }
  }
  
  return matches;
}

function formatTeam(team: string[]): string {
  return team.join('');
}

function formatMatch(match: Match, roundNum: number, matchNum: number, previousRounds: Round[], hasFixedTeams: boolean): string {
  const pairUsageHistory = getPairUsageHistory(previousRounds);
  const opponentMatchups = getOpponentMatchupHistory(previousRounds);
  const individualOpponentHistory = getIndividualOpponentHistory(previousRounds);
  
  const teamAKey = getPairKey(match.teamA[0], match.teamA[1]);
  const teamBKey = getPairKey(match.teamB[0], match.teamB[1]);
  const matchupKey = teamAKey < teamBKey ? `${teamAKey}-vs-${teamBKey}` : `${teamBKey}-vs-${teamAKey}`;
  
  const teamAUsed = !hasFixedTeams && (pairUsageHistory.get(teamAKey) || 0) > 0;
  const teamBUsed = !hasFixedTeams && (pairUsageHistory.get(teamBKey) || 0) > 0;
  const matchUsed = (opponentMatchups.get(matchupKey) || 0) > 0;
  
  const individualOpponents: string[] = [];
  for (const playerA of match.teamA) {
    for (const playerB of match.teamB) {
      const opponentKey = getPairKey(playerA, playerB);
      if ((individualOpponentHistory.get(opponentKey) || 0) > 0) {
        individualOpponents.push(opponentKey);
      }
    }
  }
  
  let teamAStr = formatTeam(match.teamA);
  let teamBStr = formatTeam(match.teamB);
  
  if (teamAUsed) teamAStr = `${RED}${teamAStr}${RESET}`;
  if (teamBUsed) teamBStr = `${RED}${teamBStr}${RESET}`;
  
  let matchStr = `${teamAStr} - ${teamBStr}`;
  if (matchUsed) {
    matchStr = `${YELLOW}${matchStr}${RESET}`;
  }
  
  let result = `${matchNum}. ${matchStr}`;
  if (individualOpponents.length > 0) {
    result += ` (${individualOpponents.join(', ')})`;
  }
  
  return result;
}

async function main() {
  console.log('Random Match Generation Test\n');
  
  const hasFixedTeamInput = await question('Has fixed teams? (y/n): ');
  const hasFixedTeams = hasFixedTeamInput.toLowerCase() === 'y';
  
  const playersInput = await question('Number of players: ');
  const courtsInput = await question('Number of courts: ');
  
  const numPlayers = parseInt(playersInput);
  const numCourts = parseInt(courtsInput);
  
  if (isNaN(numPlayers) || isNaN(numCourts) || numPlayers < 4 || numCourts < 1) {
    console.log('Invalid input');
    rl.close();
    return;
  }
  
  const players: string[] = [];
  for (let i = 0; i < numPlayers; i++) {
    players.push(String.fromCharCode(65 + i));
  }
  
  const courts: string[] = [];
  for (let i = 0; i < numCourts; i++) {
    courts.push(`Court${i + 1}`);
  }
  
  let fixedTeams: string[][] | null = null;
  if (hasFixedTeams) {
    fixedTeams = [];
    const shuffled = shuffleArray([...players]);
    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        fixedTeams.push([shuffled[i], shuffled[i + 1]]);
      }
    }
    console.log('\nFixed Teams:');
    fixedTeams.forEach((team, idx) => {
      console.log(`  ${idx + 1}. ${formatTeam(team)}`);
    });
  }
  
  console.log(`\nPlayers: ${players.join(', ')}`);
  console.log(`Courts: ${courts.join(', ')}`);
  console.log('\nPress Enter to generate rounds...\n');
  
  const previousRounds: Round[] = [];
  let roundNum = 0;
  
  while (true) {
    await question('');
    
    roundNum++;
    const numMatches = Math.min(numCourts, Math.floor(numPlayers / 4));
    
    const matches = generateRandomRound(players, fixedTeams, previousRounds, numMatches);
    
    if (matches.length === 0) {
      console.log(`Round ${roundNum}: No matches possible\n`);
      continue;
    }
    
    const round: Round = { matches };
    previousRounds.push(round);
    
    console.log(`Round ${roundNum}`);
    matches.forEach((match, idx) => {
      console.log(formatMatch(match, roundNum, idx + 1, previousRounds.slice(0, -1), hasFixedTeams));
    });
    console.log();
  }
}

main().catch(console.error);
