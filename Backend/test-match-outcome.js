const readline = require('readline');
const {
  calculateByMatchesWonOutcomes,
  calculateByPointsOutcomes,
  calculateByScoresDeltaOutcomes
} = require('./dist/services/results/calculator.service');

const WinnerOfMatch = {
  BY_SETS: 'BY_SETS',
  BY_SCORES: 'BY_SCORES'
};

const WinnerOfGame = {
  BY_MATCHES_WON: 'BY_MATCHES_WON',
  BY_POINTS: 'BY_POINTS',
  BY_SCORES_DELTA: 'BY_SCORES_DELTA'
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function calculateMatchWinner(sets, winnerOfMatch) {
  if (winnerOfMatch === WinnerOfMatch.BY_SETS) {
    let teamASetsWon = 0;
    let teamBSetsWon = 0;
    
    for (const set of sets) {
      if (set.teamAScore > set.teamBScore) {
        teamASetsWon++;
      } else if (set.teamBScore > set.teamAScore) {
        teamBSetsWon++;
      }
    }
    
    if (teamASetsWon > teamBSetsWon) return 'teamA';
    if (teamBSetsWon > teamASetsWon) return 'teamB';
    return 'tie';
  } else {
    const teamAScore = sets.reduce((sum, set) => sum + set.teamAScore, 0);
    const teamBScore = sets.reduce((sum, set) => sum + set.teamBScore, 0);
    
    if (teamAScore > teamBScore) return 'teamA';
    if (teamBScore > teamAScore) return 'teamB';
    return 'tie';
  }
}

async function main() {
  console.log('=== Match Outcome Calculator ===\n');

  const teamAPlayer1 = {
    level: parseFloat(await question('Team A - Player 1 Level: ')),
    reliability: parseFloat(await question('Team A - Player 1 Reliability: ')),
  };

  const teamAPlayer2 = {
    level: parseFloat(await question('Team A - Player 2 Level: ')),
    reliability: parseFloat(await question('Team A - Player 2 Reliability: ')),
  };

  const teamBPlayer1 = {
    level: parseFloat(await question('Team B - Player 1 Level: ')),
    reliability: parseFloat(await question('Team B - Player 1 Reliability: ')),
  };

  const teamBPlayer2 = {
    level: parseFloat(await question('Team B - Player 2 Level: ')),
    reliability: parseFloat(await question('Team B - Player 2 Reliability: ')),
  };

  console.log('\nEnter set scores (format: "6:5" or empty to finish):');
  const sets = [];
  
  while (true) {
    const input = await question(`Set ${sets.length + 1}: `);
    if (!input.trim()) break;
    
    const parts = input.split(':');
    if (parts.length !== 2) {
      console.log('Invalid format. Use "6:5" format.');
      continue;
    }
    
    const teamAScore = parseInt(parts[0].trim(), 10);
    const teamBScore = parseInt(parts[1].trim(), 10);
    
    if (isNaN(teamAScore) || isNaN(teamBScore)) {
      console.log('Invalid scores. Please enter numbers.');
      continue;
    }
    
    sets.push({ teamAScore, teamBScore });
  }

  if (sets.length === 0) {
    console.log('No sets entered. Exiting.');
    rl.close();
    return;
  }

  const winnerOfMatchInput = await question('\nWinner of Match (BY_SETS or BY_SCORES) [default: BY_SETS]: ');
  const winnerOfMatch = (winnerOfMatchInput.trim().toUpperCase() === 'BY_SCORES' 
    ? WinnerOfMatch.BY_SCORES 
    : WinnerOfMatch.BY_SETS);

  const ballsInGamesInput = await question('Balls in Games (y/n) [default: n]: ');
  const ballsInGames = ballsInGamesInput.trim().toLowerCase() === 'y';

  const winnerOfGameInput = await question('Winner of Game (BY_MATCHES_WON, BY_POINTS, BY_SCORES_DELTA) [default: BY_MATCHES_WON]: ');
  let winnerOfGame = WinnerOfGame.BY_MATCHES_WON;
  const winnerOfGameUpper = winnerOfGameInput.trim().toUpperCase();
  if (winnerOfGameUpper === 'BY_POINTS') {
    winnerOfGame = WinnerOfGame.BY_POINTS;
  } else if (winnerOfGameUpper === 'BY_SCORES_DELTA') {
    winnerOfGame = WinnerOfGame.BY_SCORES_DELTA;
  }

  const matchWinner = calculateMatchWinner(sets, winnerOfMatch);
  const teamAId = 'teamA';
  const teamBId = 'teamB';
  const winnerId = matchWinner === 'teamA' ? teamAId : matchWinner === 'teamB' ? teamBId : null;

  const players = [
    { userId: 'playerA1', level: teamAPlayer1.level, reliability: teamAPlayer1.reliability, gamesPlayed: 0 },
    { userId: 'playerA2', level: teamAPlayer2.level, reliability: teamAPlayer2.reliability, gamesPlayed: 0 },
    { userId: 'playerB1', level: teamBPlayer1.level, reliability: teamBPlayer1.reliability, gamesPlayed: 0 },
    { userId: 'playerB2', level: teamBPlayer2.level, reliability: teamBPlayer2.reliability, gamesPlayed: 0 },
  ];

  const roundResults = [{
    matches: [{
      teams: [
        { teamId: teamAId, teamNumber: 1, score: sets.reduce((sum, s) => sum + s.teamAScore, 0), playerIds: ['playerA1', 'playerA2'] },
        { teamId: teamBId, teamNumber: 2, score: sets.reduce((sum, s) => sum + s.teamBScore, 0), playerIds: ['playerB1', 'playerB2'] },
      ],
      winnerId,
      sets,
    }],
  }];

  let result;
  if (winnerOfGame === WinnerOfGame.BY_POINTS) {
    result = calculateByPointsOutcomes(players, roundResults, 0, 0, 0, ballsInGames);
  } else if (winnerOfGame === WinnerOfGame.BY_SCORES_DELTA) {
    result = calculateByScoresDeltaOutcomes(players, roundResults, 0, 0, 0, ballsInGames);
  } else {
    result = calculateByMatchesWonOutcomes(players, roundResults, 0, 0, 0, ballsInGames);
  }

  console.log('\n=== Results ===\n');
  console.log('Set Scores:');
  sets.forEach((set, i) => {
    console.log(`  Set ${i + 1}: ${set.teamAScore}:${set.teamBScore}`);
  });
  console.log(`\nMatch Winner: ${matchWinner === 'tie' ? 'Tie' : matchWinner === 'teamA' ? 'Team A' : 'Team B'}`);
  console.log(`Winner of Match: ${winnerOfMatch}`);
  console.log(`Winner of Game: ${winnerOfGame}\n`);

  console.log('Player Outcomes:');
  result.gameOutcomes.forEach((outcome, index) => {
    const player = players.find(p => p.userId === outcome.userId);
    const team = outcome.userId.startsWith('playerA') ? 'Team A' : 'Team B';
    const playerNum = outcome.userId.endsWith('1') ? '1' : '2';
    
    console.log(`\n${team} - Player ${playerNum}:`);
    console.log(`  Initial Level: ${player.level.toFixed(2)}`);
    console.log(`  Initial Reliability: ${player.reliability.toFixed(2)}`);
    console.log(`  Level Change: ${outcome.levelChange >= 0 ? '+' : ''}${outcome.levelChange.toFixed(4)}`);
    console.log(`  Final Level: ${(player.level + outcome.levelChange).toFixed(2)}`);
    console.log(`  Reliability Change: +${outcome.reliabilityChange.toFixed(2)}`);
    console.log(`  Final Reliability: ${(player.reliability + outcome.reliabilityChange).toFixed(2)}`);
    console.log(`  Wins: ${outcome.wins}, Ties: ${outcome.ties}, Losses: ${outcome.losses}`);
    console.log(`  Scores Made: ${outcome.scoresMade}, Scores Lost: ${outcome.scoresLost}`);
    console.log(`  Position: ${outcome.position}`);
    console.log(`  Is Winner: ${outcome.isWinner}`);
  });

  rl.close();
}

main().catch(console.error);

