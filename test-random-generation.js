const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function getPairKey(player1, player2) {
  return player1 < player2 ? `${player1}-${player2}` : `${player2}-${player1}`;
}

function getPairUsageHistory(rounds) {
  const pairCounts = new Map();
  
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

function getIndividualOpponentHistory(rounds) {
  const opponentCounts = new Map();
  
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

function getMatchesPlayedCounts(playerIds, rounds) {
  const matchCounts = new Map();
  
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

function getOpponentMatchupHistory(rounds) {
  const matchupCounts = new Map();
  
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

function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generateAllPossiblePairs(players, usedPairCounts, matchesPlayedCounts) {
  const allPairs = [];
  
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
  
  allPairs.sort((a, b) => {
    if (a.usageCount !== b.usageCount) return a.usageCount - b.usageCount;
    if (a.maxMatches !== b.maxMatches) return a.maxMatches - b.maxMatches;
    return a.totalMatches - b.totalMatches;
  });
  
  return allPairs;
}

function selectPairsFromSorted(sortedPairs, neededPairs, randomize = false) {
  const selected = [];
  const usedPlayers = new Set();
  const usedPairKeys = new Set();
  
  let pairsList = sortedPairs;
  if (randomize) {
    const groups = new Map();
    for (const pairInfo of sortedPairs) {
      const key = `${pairInfo.usageCount}-${pairInfo.maxMatches}-${pairInfo.totalMatches}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(pairInfo);
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

function selectPairsPlayerCentric(allPairs, players, matchesPlayedCounts, neededPairs) {
  const sortedPlayers = [...players].sort((a, b) => {
    const matchesA = matchesPlayedCounts.get(a) || 0;
    const matchesB = matchesPlayedCounts.get(b) || 0;
    if (matchesA !== matchesB) return matchesA - matchesB;
    return Math.random() - 0.5;
  });
  
  const pairMap = new Map();
  for (const pairInfo of allPairs) {
    const key = pairInfo.pairKey;
    pairMap.set(key, pairInfo);
  }
  
  const selected = [];
  const usedPlayers = new Set();
  
  for (let i = 0; i < sortedPlayers.length - 1 && selected.length < neededPairs; i++) {
    const p1 = sortedPlayers[i];
    if (usedPlayers.has(p1)) continue;
    
    let bestPair = null;
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

function generateAllPossiblePairsFromFixedTeams(fixedTeams, usedPairCounts, matchesPlayedCounts) {
  const allPairs = [];
  
  for (const pair of fixedTeams) {
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

function generateAllPossibleMatchups(pairs, opponentMatchups, individualOpponentHistory) {
  const allMatchups = [];
  
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

function selectMatchupsFromSorted(sortedMatchups, numMatches, randomize = false) {
  const selected = [];
  const usedPairIndices = new Set();
  
  let matchupsList = sortedMatchups;
  if (randomize) {
    const groups = new Map();
    for (const matchup of sortedMatchups) {
      const key = `${matchup.teamMatchupCount}-${matchup.maxIndividualOpponentCount}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(matchup);
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

function generateRandomRound(players, fixedTeams, previousRounds, numMatches) {
  const shuffledPlayers = shuffleArray([...players]);
  const shuffledFixedTeams = fixedTeams ? shuffleArray([...fixedTeams]) : null;
  
  const usedPairCounts = getPairUsageHistory(previousRounds);
  const allPlayerIds = shuffledFixedTeams ? shuffledFixedTeams.flat() : shuffledPlayers;
  const matchesPlayedCounts = getMatchesPlayedCounts(allPlayerIds, previousRounds);
  const neededPairs = numMatches * 2;
  
  let allPairs;
  if (shuffledFixedTeams && shuffledFixedTeams.length > 0) {
    allPairs = generateAllPossiblePairsFromFixedTeams(shuffledFixedTeams, usedPairCounts, matchesPlayedCounts);
  } else {
    allPairs = generateAllPossiblePairs(shuffledPlayers, usedPairCounts, matchesPlayedCounts);
  }
  
  const pairsByUsage = new Map();
  for (const pairInfo of allPairs) {
    const usageKey = pairInfo.usageCount;
    if (!pairsByUsage.has(usageKey)) {
      pairsByUsage.set(usageKey, []);
    }
    pairsByUsage.get(usageKey).push(pairInfo);
  }
  
  const sortedUsageLevels = Array.from(pairsByUsage.keys()).sort((a, b) => a - b);
  
  let pairs = null;
  
  for (let levelIndex = 0; levelIndex < sortedUsageLevels.length; levelIndex++) {
    const availablePairsForLevel = [];
    
    for (let i = 0; i <= levelIndex; i++) {
      availablePairsForLevel.push(...pairsByUsage.get(sortedUsageLevels[i]));
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
  
  const matchupsByLevel = new Map();
  for (const matchup of allMatchups) {
    const levelKey = `${matchup.teamMatchupCount}-${matchup.maxIndividualOpponentCount}`;
    if (!matchupsByLevel.has(levelKey)) {
      matchupsByLevel.set(levelKey, []);
    }
    matchupsByLevel.get(levelKey).push(matchup);
  }
  
  const sortedLevels = Array.from(matchupsByLevel.keys()).sort((a, b) => {
    const [aTeam, aInd] = a.split('-').map(Number);
    const [bTeam, bInd] = b.split('-').map(Number);
    if (aTeam !== bTeam) return aTeam - bTeam;
    return aInd - bInd;
  });
  
  for (const level of sortedLevels) {
    const matchupsAtLevel = matchupsByLevel.get(level);
    
    for (let attempt = 0; attempt < 100; attempt++) {
      const selectedMatchups = selectMatchupsFromSorted(matchupsAtLevel, numMatches, attempt > 0);
      if (selectedMatchups.length === numMatches) {
        return selectedMatchups.map(matchup => ({
          teamA: pairs[matchup.pairAIndex],
          teamB: pairs[matchup.pairBIndex],
        }));
      }
    }
  }
  
  const selectedMatchups = selectMatchupsFromSorted(allMatchups, numMatches, false);
  return selectedMatchups.map(matchup => ({
    teamA: pairs[matchup.pairAIndex],
    teamB: pairs[matchup.pairBIndex],
  }));
}

function formatTeam(team) {
  return team.join('');
}

function formatMatch(match, roundNum, matchNum, previousRounds, hasFixedTeams) {
  const pairUsageHistory = getPairUsageHistory(previousRounds);
  const opponentMatchups = getOpponentMatchupHistory(previousRounds);
  const individualOpponentHistory = getIndividualOpponentHistory(previousRounds);
  
  const teamAKey = getPairKey(match.teamA[0], match.teamA[1]);
  const teamBKey = getPairKey(match.teamB[0], match.teamB[1]);
  const matchupKey = teamAKey < teamBKey ? `${teamAKey}-vs-${teamBKey}` : `${teamBKey}-vs-${teamAKey}`;
  
  const teamAUsed = !hasFixedTeams && (pairUsageHistory.get(teamAKey) || 0) > 0;
  const teamBUsed = !hasFixedTeams && (pairUsageHistory.get(teamBKey) || 0) > 0;
  const matchUsed = (opponentMatchups.get(matchupKey) || 0) > 0;
  
  const individualOpponents = [];
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
  
  const players = [];
  for (let i = 0; i < numPlayers; i++) {
    players.push(String.fromCharCode(65 + i));
  }
  
  const courts = [];
  for (let i = 0; i < numCourts; i++) {
    courts.push(`Court${i + 1}`);
  }
  
  let fixedTeams = null;
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
  
  const previousRounds = [];
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
    
    const round = { matches };
    previousRounds.push(round);
    
    console.log(`Round ${roundNum}`);
    matches.forEach((match, idx) => {
      console.log(formatMatch(match, roundNum, idx + 1, previousRounds.slice(0, -1), hasFixedTeams));
    });
    
    if (numPlayers !== numCourts * 4) {
      const matchCounts = getMatchesPlayedCounts(players, previousRounds);
      const maxMatches = Math.max(...Array.from(matchCounts.values()));
      const sortedPlayers = [...players].sort();
      const countStrings = sortedPlayers.map(p => {
        const count = matchCounts.get(p) || 0;
        const diff = maxMatches - count;
        const countStr = `${p}${count}`;
        if (diff === 0) {
          return countStr;
        } else if (diff === 1) {
          return `${YELLOW}${countStr}${RESET}`;
        } else {
          return `${RED}${countStr}${RESET}`;
        }
      });
      console.log(`Match counts: ${countStrings.join(' ')}`);
    }
    
    const individualOpponentHistory = getIndividualOpponentHistory(previousRounds);
    const uniqueOpponentCounts = new Map();
    
    for (const player of players) {
      uniqueOpponentCounts.set(player, new Set());
    }
    
    for (const [opponentKey, _] of individualOpponentHistory.entries()) {
      const [p1, p2] = opponentKey.split('-');
      if (uniqueOpponentCounts.has(p1)) {
        uniqueOpponentCounts.get(p1).add(p2);
      }
      if (uniqueOpponentCounts.has(p2)) {
        uniqueOpponentCounts.get(p2).add(p1);
      }
    }
    
    const sortedPlayers = [...players].sort();
    const uniqueOpponentStrings = sortedPlayers.map(p => {
      const count = uniqueOpponentCounts.get(p)?.size || 0;
      return `${p}${count}`;
    });
    console.log(`Unique opponents: ${uniqueOpponentStrings.join(' ')}`);
    
    const allUsedPairs = getPairUsageHistory(previousRounds);
    const sortedPairs = Array.from(allUsedPairs.entries())
      .filter(([_, count]) => count > 0)
      .sort((a, b) => {
        if (a[1] !== b[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      });
    
    if (sortedPairs.length > 0) {
      console.log(`Used pairs (${sortedPairs.length} unique):`);
      const pairsByCount = new Map();
      sortedPairs.forEach(([pair, count]) => {
        if (!pairsByCount.has(count)) {
          pairsByCount.set(count, []);
        }
        pairsByCount.get(count).push(pair);
      });
      Array.from(pairsByCount.entries())
        .sort((a, b) => b[0] - a[0])
        .forEach(([count, pairs]) => {
          if (count > 1) {
            console.log(`  ${count}x: ${pairs.join(', ')}`);
          }
        });
    }
  }
}

main().catch(console.error);
