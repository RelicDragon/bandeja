import { Op } from '@/types/ops';
import { Round } from '@/types/gameResults';
import { Game } from '@/types';
import { OpCreator } from './opCreators';
import { calculateGameStandings } from './gameStandings';

export interface RoundGeneratorOptions {
  opCreator: OpCreator;
  rounds: Round[];
  game: Game;
  roundNumber: number;
  roundName: string;
  fixedNumberOfSets?: number;
}

export class RoundGenerator {
  private opCreator: OpCreator;
  private options: RoundGeneratorOptions;

  constructor(options: RoundGeneratorOptions) {
    this.options = options;
    this.opCreator = options.opCreator;
  }

  generateRound(): Op[] {
    const { matchGenerationType } = this.options.game;
    
    if (!matchGenerationType) {
      return this.generateHandmadeRound();
    }

    switch (matchGenerationType) {
      case 'HANDMADE':
        return this.generateHandmadeRound();
      case 'FIXED':
        return this.generateFixedRound();
      case 'RANDOM':
        return this.generateRandomRound();
      case 'RATING':
        return this.generateRatingRound();
      case 'WINNERS_COURT':
        return this.generateWinnersCourtRound();
      case 'ROUND_ROBIN':
      case 'ESCALERA':
        return [];
      default:
        return this.generateHandmadeRound();
    }
  }

  private generateHandmadeRound(): Op[] {
    const ops: Op[] = [];
    const { roundNumber, roundName, fixedNumberOfSets } = this.options;
    const roundId = `round-${roundNumber}`;
    
    ops.push(this.opCreator.addRound(roundId, roundName));
    
    const matchId = this.getNextMatchId();
    ops.push(this.opCreator.addMatch(matchId, roundId, fixedNumberOfSets));
    
    return ops;
  }

  private generateFixedRound(): Op[] {
    const ops: Op[] = [];
    const { rounds, roundNumber, roundName, fixedNumberOfSets } = this.options;
    const roundId = `round-${roundNumber}`;
    
    if (rounds.length === 0) {
      ops.push(this.opCreator.addRound(roundId, roundName));
      const matchId = this.getNextMatchId(0);
      ops.push(this.opCreator.addMatch(matchId, roundId, fixedNumberOfSets));
      return ops;
    }
    
    const previousRound = rounds[rounds.length - 1];
    const firstRound = rounds[0];
    
    ops.push(this.opCreator.addRound(roundId, roundName));
    
    if (previousRound.matches && previousRound.matches.length > 0) {
      let matchIndex = 0;
      for (const prevMatch of previousRound.matches) {
        const newMatchId = this.getNextMatchId(matchIndex);
        this.opCreator.registerMatchIndex(newMatchId, matchIndex);
        matchIndex++;
        
        ops.push(this.opCreator.addMatch(newMatchId, roundId, fixedNumberOfSets));
        
        if (firstRound.matches && firstRound.matches[matchIndex - 1]?.courtId) {
          ops.push(this.opCreator.setMatchCourt(newMatchId, firstRound.matches[matchIndex - 1].courtId!, roundId));
        }
        
        for (const playerId of prevMatch.teamA) {
          ops.push(this.opCreator.addPlayerToTeam(newMatchId, 'teamA', playerId, roundId));
        }
        
        for (const playerId of prevMatch.teamB) {
          ops.push(this.opCreator.addPlayerToTeam(newMatchId, 'teamB', playerId, roundId));
        }
      }
    } else {
      const matchId = this.getNextMatchId(0);
      this.opCreator.registerMatchIndex(matchId, 0);
      ops.push(this.opCreator.addMatch(matchId, roundId, fixedNumberOfSets));
    }
    
    return ops;
  }

  private generateRandomRound(): Op[] {
    const ops: Op[] = [];
    const { game, rounds, roundNumber, roundName, fixedNumberOfSets } = this.options;
    const roundId = `round-${roundNumber}`;

    ops.push(this.opCreator.addRound(roundId, roundName));
    
    const playingParticipants = game.participants.filter(p => p.isPlaying);
    const numPlayers = playingParticipants.length;
    
    if (numPlayers < 4) {
      return ops;
    }
    
    const numCourts = game.gameCourts?.length || 1;
    const numMatches = Math.min(numCourts, Math.floor(numPlayers / 4));
    
    const sortedCourts = game.gameCourts 
      ? [...game.gameCourts].sort((a, b) => a.order - b.order)
      : [];
    
    let pairs: string[][];
    
    if (game.hasFixedTeams && game.fixedTeams && game.fixedTeams.length > 0) {
      pairs = this.generateRandomRoundWithFixedTeams(game, rounds, numMatches);
    } else {
      pairs = this.generateRandomPairs(playingParticipants, rounds, numMatches, game.genderTeams);
    }

    const actualMatches = Math.floor(pairs.length / 2);
    
    for (let i = 0; i < actualMatches; i++) {
      const matchId = this.getNextMatchId(i);
      this.opCreator.registerMatchIndex(matchId, i);
      ops.push(this.opCreator.addMatch(matchId, roundId, fixedNumberOfSets));
      
      if (sortedCourts[i]?.courtId) {
        ops.push(this.opCreator.setMatchCourt(matchId, sortedCourts[i].courtId, roundId));
      }
      
      if (pairs[i * 2]) {
        for (const playerId of pairs[i * 2]) {
          ops.push(this.opCreator.addPlayerToTeam(matchId, 'teamA', playerId, roundId));
        }
      }
      
      if (pairs[i * 2 + 1]) {
        for (const playerId of pairs[i * 2 + 1]) {
          ops.push(this.opCreator.addPlayerToTeam(matchId, 'teamB', playerId, roundId));
        }
      }
    }
    
    return ops;
  }

  private generateRandomPairs(
    participants: any[],
    previousRounds: Round[],
    numMatches: number,
    genderTeams?: string
  ): string[][] {
    const players = participants.map(p => p.userId);
    const usedPairCounts = this.getPairUsageHistory(previousRounds);
    
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
    
    const shuffledPlayers = this.shuffleArray([...players]);
    const pairs: string[][] = [];
    const usedInThisRound = new Set<string>();
    const neededPairs = numMatches * 2;
    
    let attempts = 0;
    const maxAttempts = 100;
    
    while (pairs.length < neededPairs && attempts < maxAttempts) {
      attempts++;
      
      const availablePlayers = shuffledPlayers.filter(p => !usedInThisRound.has(p));
      
      if (availablePlayers.length < 2) {
        break;
      }
      
      let pair: string[] | null = null;
      
      if (isMixPairs) {
        const availableMales = malePlayers.filter(p => !usedInThisRound.has(p));
        const availableFemales = femalePlayers.filter(p => !usedInThisRound.has(p));
        
        if (availableMales.length > 0 && availableFemales.length > 0) {
          const male = availableMales[0];
          const female = availableFemales[0];
          pair = [male, female];
        }
      } else {
        let bestPair: string[] | null = null;
        let minUsageCount = Infinity;
        
        for (let i = 0; i < availablePlayers.length - 1; i++) {
          for (let j = i + 1; j < availablePlayers.length; j++) {
            const p1 = availablePlayers[i];
            const p2 = availablePlayers[j];
            const pairKey = this.getPairKey(p1, p2);
            const usageCount = usedPairCounts.get(pairKey) || 0;
            
            if (usageCount < minUsageCount) {
              minUsageCount = usageCount;
              bestPair = [p1, p2];
            }
          }
        }
        
        pair = bestPair;
      }
      
      if (pair) {
        pairs.push(pair);
        usedInThisRound.add(pair[0]);
        usedInThisRound.add(pair[1]);
        
        const pairKey = this.getPairKey(pair[0], pair[1]);
        usedPairCounts.set(pairKey, (usedPairCounts.get(pairKey) || 0) + 1);
      } else {
        break;
      }
    }
    
    return pairs;
  }

  private generateRandomRoundWithFixedTeams(
    game: Game,
    previousRounds: Round[],
    numMatches: number
  ): string[][] {
    const fixedTeams = game.fixedTeams || [];
    const teamPairs = fixedTeams.map(team => team.players.map(p => p.userId));
    
    const usedPairCounts = this.getPairUsageHistory(previousRounds);
    
    const sortedTeamPairs = [...teamPairs].sort(() => Math.random() - 0.5);
    
    const selectedPairs: string[][] = [];
    const usedTeamIndices = new Set<number>();
    
    for (let i = 0; i < Math.min(numMatches * 2, sortedTeamPairs.length); i++) {
      let bestIndex = -1;
      let minUsage = Infinity;
      
      for (let j = 0; j < sortedTeamPairs.length; j++) {
        if (usedTeamIndices.has(j)) continue;
        
        const pair = sortedTeamPairs[j];
        if (pair.length < 2) continue;
        
        const pairKey = this.getPairKey(pair[0], pair[1]);
        const usage = usedPairCounts.get(pairKey) || 0;
        
        if (usage < minUsage) {
          minUsage = usage;
          bestIndex = j;
        }
      }
      
      if (bestIndex !== -1) {
        selectedPairs.push(sortedTeamPairs[bestIndex]);
        usedTeamIndices.add(bestIndex);
      }
    }
    
    return selectedPairs;
  }

  private getPairUsageHistory(rounds: Round[]): Map<string, number> {
    const pairCounts = new Map<string, number>();
    
    for (const round of rounds) {
      for (const match of round.matches) {
        if (match.teamA.length >= 2) {
          const pairKey = this.getPairKey(match.teamA[0], match.teamA[1]);
          pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
        }
        
        if (match.teamB.length >= 2) {
          const pairKey = this.getPairKey(match.teamB[0], match.teamB[1]);
          pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
        }
      }
    }
    
    return pairCounts;
  }

  private getPairKey(player1: string, player2: string): string {
    return player1 < player2 ? `${player1}-${player2}` : `${player2}-${player1}`;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  private generateRatingRound(): Op[] {
    const ops: Op[] = [];
    const { game, rounds, roundNumber, roundName, fixedNumberOfSets } = this.options;
    const roundId = `round-${roundNumber}`;

    ops.push(this.opCreator.addRound(roundId, roundName));
    
    const playingParticipants = game.participants.filter(p => p.isPlaying);
    const numPlayers = playingParticipants.length;
    
    if (numPlayers < 4) {
      return ops;
    }
    
    const numCourts = game.gameCourts?.length || 1;
    const numMatches = Math.min(numCourts, Math.floor(numPlayers / 4));
    
    const sortedCourts = game.gameCourts 
      ? [...game.gameCourts].sort((a, b) => a.order - b.order)
      : [];
    
    let playerIds: string[];
    
    if (rounds.length === 0) {
      playerIds = this.shuffleArray(playingParticipants.map(p => p.userId));
    } else {
      const standings = calculateGameStandings(game, rounds, game.winnerOfGame || 'BY_MATCHES_WON');
      playerIds = standings.map(s => s.user.id);
    }
    
    const actualMatches = Math.min(numMatches, Math.floor(playerIds.length / 4));
    
    for (let i = 0; i < actualMatches; i++) {
      const matchId = this.getNextMatchId(i);
      this.opCreator.registerMatchIndex(matchId, i);
      ops.push(this.opCreator.addMatch(matchId, roundId, fixedNumberOfSets));
      
      if (sortedCourts[i]?.courtId) {
        ops.push(this.opCreator.setMatchCourt(matchId, sortedCourts[i].courtId, roundId));
      }
      
      const baseIndex = i * 4;
      const player1 = playerIds[baseIndex];
      const player2 = playerIds[baseIndex + 1];
      const player3 = playerIds[baseIndex + 2];
      const player4 = playerIds[baseIndex + 3];
      
      if (player1 && player3) {
        ops.push(this.opCreator.addPlayerToTeam(matchId, 'teamA', player1, roundId));
        ops.push(this.opCreator.addPlayerToTeam(matchId, 'teamA', player3, roundId));
      }
      
      if (player2 && player4) {
        ops.push(this.opCreator.addPlayerToTeam(matchId, 'teamB', player2, roundId));
        ops.push(this.opCreator.addPlayerToTeam(matchId, 'teamB', player4, roundId));
      }
    }
    
    return ops;
  }

  private generateWinnersCourtRound(): Op[] {
    const ops: Op[] = [];
    const { game, rounds, roundNumber, roundName, fixedNumberOfSets } = this.options;
    const roundId = `round-${roundNumber}`;

    ops.push(this.opCreator.addRound(roundId, roundName));
    
    const playingParticipants = game.participants.filter(p => p.isPlaying);
    const numPlayers = playingParticipants.length;
    
    if (numPlayers < 4) {
      return ops;
    }
    
    const sortedCourts = game.gameCourts 
      ? [...game.gameCourts].sort((a, b) => a.order - b.order)
      : [];
    
    const numCourts = sortedCourts.length || 1;
    const numMatches = Math.min(numCourts, Math.floor(numPlayers / 4));

    if (rounds.length === 0) {
      const sortedPlayers = [...playingParticipants].sort((a, b) => b.user.level - a.user.level);
      const playerIds = sortedPlayers.map(p => p.userId);
      
      for (let i = 0; i < numMatches; i++) {
        const matchId = this.getNextMatchId(i);
        this.opCreator.registerMatchIndex(matchId, i);
        ops.push(this.opCreator.addMatch(matchId, roundId, fixedNumberOfSets));
        
        if (sortedCourts[i]?.courtId) {
          ops.push(this.opCreator.setMatchCourt(matchId, sortedCourts[i].courtId, roundId));
        }
        
        const baseIndex = i * 4;
        const player1 = playerIds[baseIndex];
        const player2 = playerIds[baseIndex + 1];
        const player3 = playerIds[baseIndex + 2];
        const player4 = playerIds[baseIndex + 3];
        
        if (player1 && player3) {
          ops.push(this.opCreator.addPlayerToTeam(matchId, 'teamA', player1, roundId));
          ops.push(this.opCreator.addPlayerToTeam(matchId, 'teamA', player3, roundId));
        }
        
        if (player2 && player4) {
          ops.push(this.opCreator.addPlayerToTeam(matchId, 'teamB', player2, roundId));
          ops.push(this.opCreator.addPlayerToTeam(matchId, 'teamB', player4, roundId));
        }
      }
    } else {
      const previousRound = rounds[rounds.length - 1];
      
      if (!previousRound.matches || previousRound.matches.length === 0) {
        return ops;
      }

      const courtResults: Array<{
        courtIndex: number;
        winners: string[];
        losers: string[];
      }> = [];

      for (let i = 0; i < previousRound.matches.length; i++) {
        const match = previousRound.matches[i];
        
        const validSets = match.sets.filter(set => set.teamA > 0 || set.teamB > 0);
        const teamAScore = validSets.reduce((sum, set) => sum + set.teamA, 0);
        const teamBScore = validSets.reduce((sum, set) => sum + set.teamB, 0);
        
        let winners: string[] = [];
        let losers: string[] = [];
        
        if (teamAScore > teamBScore) {
          winners = [...match.teamA];
          losers = [...match.teamB];
        } else if (teamBScore > teamAScore) {
          winners = [...match.teamB];
          losers = [...match.teamA];
        } else {
          winners = [...match.teamA];
          losers = [...match.teamB];
        }
        
        courtResults.push({
          courtIndex: i,
          winners,
          losers
        });
      }

      const newMatches: Array<{
        courtIndex: number;
        teamA: string[];
        teamB: string[];
      }> = [];

      for (let i = 0; i < courtResults.length; i++) {
        const currentCourt = courtResults[i];
        
        if (i === 0) {
          if (courtResults.length > 1) {
            const nextCourtWinners = courtResults[1].winners;
            
            if (currentCourt.winners.length >= 2 && nextCourtWinners.length >= 2) {
              newMatches.push({
                courtIndex: i,
                teamA: [currentCourt.winners[0], nextCourtWinners[0]],
                teamB: [currentCourt.winners[1], nextCourtWinners[1]]
              });
            }
          } else {
            if (currentCourt.winners.length >= 2 && currentCourt.losers.length >= 2) {
              newMatches.push({
                courtIndex: i,
                teamA: [currentCourt.winners[0], currentCourt.losers[0]],
                teamB: [currentCourt.winners[1], currentCourt.losers[1]]
              });
            }
          }
        } else if (i === courtResults.length - 1) {
          if (currentCourt.losers.length >= 2 && currentCourt.winners.length >= 2) {
            newMatches.push({
              courtIndex: i,
              teamA: [currentCourt.losers[0], currentCourt.losers[1]],
              teamB: [currentCourt.winners[0], currentCourt.winners[1]]
            });
          }
        } else {
          const nextCourtWinners = courtResults[i + 1].winners;
          const prevCourtLosers = courtResults[i - 1].losers;
          
          if (prevCourtLosers.length >= 2 && currentCourt.winners.length >= 2) {
            newMatches.push({
              courtIndex: i,
              teamA: [prevCourtLosers[0], currentCourt.winners[0]],
              teamB: [prevCourtLosers[1], currentCourt.winners[1]]
            });
          }
          
          if (currentCourt.losers.length >= 2 && nextCourtWinners.length >= 2) {
            newMatches.push({
              courtIndex: i,
              teamA: [currentCourt.losers[0], nextCourtWinners[0]],
              teamB: [currentCourt.losers[1], nextCourtWinners[1]]
            });
          }
        }
      }

      for (let i = 0; i < Math.min(newMatches.length, numMatches); i++) {
        const newMatch = newMatches[i];
        const matchId = this.getNextMatchId(i);
        this.opCreator.registerMatchIndex(matchId, i);
        
        ops.push(this.opCreator.addMatch(matchId, roundId, fixedNumberOfSets));
        
        if (sortedCourts[newMatch.courtIndex]?.courtId) {
          ops.push(this.opCreator.setMatchCourt(matchId, sortedCourts[newMatch.courtIndex].courtId, roundId));
        }
        
        for (const playerId of newMatch.teamA) {
          ops.push(this.opCreator.addPlayerToTeam(matchId, 'teamA', playerId, roundId));
        }
        
        for (const playerId of newMatch.teamB) {
          ops.push(this.opCreator.addPlayerToTeam(matchId, 'teamB', playerId, roundId));
        }
      }
    }
    
    return ops;
  }

  private getNextMatchId(currentRoundMatchIndex: number = 0): string {
    const totalMatches = this.options.rounds.reduce((sum, r) => sum + r.matches.length, 0);
    return `match-${totalMatches + currentRoundMatchIndex + 1}`;
  }
}

