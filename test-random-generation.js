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

function pairKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function shuffle(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function hasPlayers(match) {
  return match.teamA.length > 0 && match.teamB.length > 0;
}

function buildTeammateHistory(rounds) {
  const counts = new Map();
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

function buildOpponentHistory(rounds) {
  const counts = new Map();
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

function buildMatchesPlayed(playerIds, rounds) {
  const counts = new Map();
  for (const id of playerIds) counts.set(id, 0);
  for (const round of rounds) {
    for (const match of round.matches) {
      if (!hasPlayers(match)) continue;
      for (const id of [...match.teamA, ...match.teamB]) {
        if (counts.has(id)) counts.set(id, counts.get(id) + 1);
      }
    }
  }
  return counts;
}

function getLastRoundTeamKeys(rounds) {
  const keys = new Set();
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

function generateAllPossiblePairs(players) {
  const pairs = [];
  for (let i = 0; i < players.length - 1; i++) {
    for (let j = i + 1; j < players.length; j++) {
      pairs.push({ pair: [players[i], players[j]], key: pairKey(players[i], players[j]) });
    }
  }
  return pairs;
}

function buildPairPool(allPairs, teammateHistory, lastRoundKeys) {
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

function selectFromPool(pool, matchesPlayed, neededPairs, teammateHistory) {
  const selected = [];
  const usedPlayers = new Set();

  const playerSet = new Set();
  for (const { pair } of pool) {
    playerSet.add(pair[0]);
    playerSet.add(pair[1]);
  }

  const sortedPlayers = shuffle([...playerSet]).sort(
    (a, b) => (matchesPlayed.get(a) || 0) - (matchesPlayed.get(b) || 0)
  );

  const playerPairsMap = new Map();
  for (const p of pool) {
    for (const id of p.pair) {
      if (!playerPairsMap.has(id)) playerPairsMap.set(id, []);
      playerPairsMap.get(id).push(p);
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

function selectTeamPairs(pool, allPairs, matchesPlayed, neededPairs, teammateHistory) {
  let best = [];

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

function formMatchups(pairs, opponentHistory) {
  const matches = [];
  const shuffledPairs = shuffle([...pairs]);
  const used = new Set();

  for (let i = 0; i < shuffledPairs.length; i++) {
    if (used.has(i)) continue;

    const team1 = shuffledPairs[i];
    let bestScore = Infinity;
    const candidates = [];

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

function generateFixedTeamMatchups(fixedTeams, matchesPlayed, opponentHistory, numMatches) {
  const allMatchups = [];

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

  const selected = [];
  const usedTeams = new Set();

  for (const m of sorted) {
    if (selected.length >= numMatches) break;
    if (usedTeams.has(m.teamAIdx) || usedTeams.has(m.teamBIdx)) continue;
    selected.push({ teamA: fixedTeams[m.teamAIdx], teamB: fixedTeams[m.teamBIdx] });
    usedTeams.add(m.teamAIdx);
    usedTeams.add(m.teamBIdx);
  }

  return selected;
}

function generateRandomRound(players, fixedTeams, previousRounds, numMatches) {
  const allPlayerIds = fixedTeams ? fixedTeams.flat() : players;
  const matchesPlayed = buildMatchesPlayed(allPlayerIds, previousRounds);
  const opponentHistory = buildOpponentHistory(previousRounds);

  if (fixedTeams && fixedTeams.length > 0) {
    return generateFixedTeamMatchups(fixedTeams, matchesPlayed, opponentHistory, numMatches);
  }

  const teammateHistory = buildTeammateHistory(previousRounds);
  const lastRoundKeys = getLastRoundTeamKeys(previousRounds);
  const allPairs = generateAllPossiblePairs(players);

  if (allPairs.length === 0) return [];

  const pool = buildPairPool(allPairs, teammateHistory, lastRoundKeys);
  const neededPairs = numMatches * 2;
  const teamPairs = selectTeamPairs(pool, allPairs, matchesPlayed, neededPairs, teammateHistory);

  if (teamPairs.length < 2) return [];

  const pairsToMatch = teamPairs.length % 2 === 0 ? teamPairs : teamPairs.slice(0, -1);
  return formMatchups(pairsToMatch, opponentHistory);
}

function formatTeam(team) {
  return team.join('');
}

function formatMatch(match, matchNum, previousRounds, hasFixedTeams) {
  const teammateHistory = buildTeammateHistory(previousRounds);
  const opponentHistory = buildOpponentHistory(previousRounds);

  const teamAKey = pairKey(match.teamA[0], match.teamA[1]);
  const teamBKey = pairKey(match.teamB[0], match.teamB[1]);

  const teamAUsed = !hasFixedTeams && (teammateHistory.get(teamAKey) || 0) > 0;
  const teamBUsed = !hasFixedTeams && (teammateHistory.get(teamBKey) || 0) > 0;

  const individualOpponents = [];
  for (const playerA of match.teamA) {
    for (const playerB of match.teamB) {
      const key = pairKey(playerA, playerB);
      const count = opponentHistory.get(key) || 0;
      if (count > 0) {
        individualOpponents.push(`${key}:${count}`);
      }
    }
  }

  let teamAStr = formatTeam(match.teamA);
  let teamBStr = formatTeam(match.teamB);

  if (teamAUsed) teamAStr = `${RED}${teamAStr}${RESET}`;
  if (teamBUsed) teamBStr = `${RED}${teamBStr}${RESET}`;

  let matchStr = `${teamAStr} - ${teamBStr}`;

  let result = `${matchNum}. ${matchStr}`;
  if (individualOpponents.length > 0) {
    result += ` ${YELLOW}(${individualOpponents.join(', ')})${RESET}`;
  }

  return result;
}

async function main() {
  console.log('Random Match Generation Test (Pool-based Algorithm)\n');

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

  let fixedTeams = null;
  if (hasFixedTeams) {
    fixedTeams = [];
    const shuffled = shuffle([...players]);
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

  const totalPairs = hasFixedTeams ? fixedTeams.length : (numPlayers * (numPlayers - 1)) / 2;
  const numMatches = Math.min(numCourts, Math.floor(numPlayers / 4));
  const pairsPerRound = numMatches * 2;
  const fullCycleRounds = hasFixedTeams ? null : Math.ceil(totalPairs / pairsPerRound);

  console.log(`\nPlayers: ${players.join(', ')}`);
  console.log(`Courts: ${numCourts}, Matches/round: ${numMatches}`);
  if (!hasFixedTeams) {
    console.log(`Total possible pairs: ${totalPairs}, Pairs/round: ${pairsPerRound}, Full cycle: ${fullCycleRounds} rounds`);
  }
  console.log('\nPress Enter to generate rounds...\n');

  const previousRounds = [];
  let roundNum = 0;

  while (true) {
    await question('');

    roundNum++;

    const matches = generateRandomRound(players, fixedTeams, previousRounds, numMatches);

    if (matches.length === 0) {
      console.log(`Round ${roundNum}: No matches possible\n`);
      continue;
    }

    const round = { matches };
    previousRounds.push(round);

    console.log(`Round ${roundNum}`);
    matches.forEach((match, idx) => {
      console.log(formatMatch(match, idx + 1, previousRounds.slice(0, -1), hasFixedTeams));
    });

    const matchCounts = buildMatchesPlayed(players, previousRounds);
    const maxMatches = Math.max(...Array.from(matchCounts.values()));
    const minMatches = Math.min(...Array.from(matchCounts.values()));

    if (maxMatches !== minMatches) {
      const sortedPlayers = [...players].sort();
      const countStrings = sortedPlayers.map(p => {
        const count = matchCounts.get(p) || 0;
        const diff = maxMatches - count;
        const countStr = `${p}${count}`;
        if (diff === 0) return countStr;
        if (diff === 1) return `${YELLOW}${countStr}${RESET}`;
        return `${RED}${countStr}${RESET}`;
      });
      console.log(`Matches played: ${countStrings.join(' ')}`);
    }

    const opponentHistory = buildOpponentHistory(previousRounds);
    const uniqueOpponentCounts = new Map();
    for (const player of players) uniqueOpponentCounts.set(player, new Set());

    for (const [key] of opponentHistory.entries()) {
      const [p1, p2] = key.split('-');
      if (uniqueOpponentCounts.has(p1)) uniqueOpponentCounts.get(p1).add(p2);
      if (uniqueOpponentCounts.has(p2)) uniqueOpponentCounts.get(p2).add(p1);
    }

    const sortedPlayers = [...players].sort();
    const uniqueOppStrings = sortedPlayers.map(p => `${p}${uniqueOpponentCounts.get(p)?.size || 0}`);
    console.log(`Unique opponents: ${uniqueOppStrings.join(' ')}`);

    if (!hasFixedTeams) {
      const teammateHistory = buildTeammateHistory(previousRounds);
      const usedPairs = Array.from(teammateHistory.entries())
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

      const repeated = usedPairs.filter(([_, count]) => count > 1);
      if (repeated.length > 0) {
        console.log(`${RED}Repeated teammate pairs:${RESET}`);
        repeated.forEach(([pair, count]) => console.log(`  ${RED}${count}x: ${pair}${RESET}`));
      }
      console.log(`Teammate pairs used: ${usedPairs.length}/${totalPairs}`);
    }

    console.log('');
  }
}

main().catch(console.error);
