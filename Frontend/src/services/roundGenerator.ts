import { createId } from '@paralleldrive/cuid2';
import { Round, Match } from '@/types/gameResults';
import { Game, BasicUser } from '@/types';
import { createOneOnOneMatches, createTwoOnTwoMatches } from './predefinedResults';
import { generateFixedRound, generateRandomRound } from './predefinedResults';
import { calculateGameStandings } from './gameStandings';

export interface RoundGeneratorOptions {
  rounds: Round[];
  game: Game;
  roundNumber: number;
  fixedNumberOfSets?: number;
}

export class RoundGenerator {
  private options: RoundGeneratorOptions;

  constructor(options: RoundGeneratorOptions) {
    this.options = options;
  }

  generateRound(): Match[] {
    const { matchGenerationType } = this.options.game;
    const fixedNumberOfSets = this.options.fixedNumberOfSets || 0;
    const initialSets = fixedNumberOfSets > 0
      ? Array.from({ length: fixedNumberOfSets }, () => ({ teamA: 0, teamB: 0, isTieBreak: false }))
      : [{ teamA: 0, teamB: 0, isTieBreak: false }];
    
    if (!matchGenerationType || matchGenerationType === 'HANDMADE') {
      return this.generateHandmadeRound(initialSets);
    }

    switch (matchGenerationType) {
      case 'FIXED':
        return generateFixedRound(this.options.game, this.options.rounds, initialSets);
      case 'RANDOM':
        return generateRandomRound(this.options.game, this.options.rounds, initialSets);
      case 'RATING':
        return this.generateRatingRound(initialSets);
      case 'WINNERS_COURT':
        return this.generateWinnersCourtRound(initialSets);
      case 'ROUND_ROBIN':
      case 'ESCALERA':
        return [];
      default:
        return this.generateHandmadeRound(initialSets);
    }
  }

  private generateHandmadeRound(initialSets: Array<{ teamA: number; teamB: number }>): Match[] {
    const { game } = this.options;
    const playingParticipants = game.participants.filter(p => p.isPlaying);
    const numPlayers = playingParticipants.length;
    const players = playingParticipants.map(p => p.user) as BasicUser[];
    
    const matches: Match[] = [];

    if (numPlayers === 4) {
      if (game.hasFixedTeams && game.fixedTeams && game.fixedTeams.length >= 2) {
        const team1 = game.fixedTeams.find(t => t.teamNumber === 1);
        const team2 = game.fixedTeams.find(t => t.teamNumber === 2);
        
        if (team1 && team2 && team1.players.length > 0 && team2.players.length > 0) {
          matches.push({
            id: createId(),
            teamA: team1.players.map(p => p.userId),
            teamB: team2.players.map(p => p.userId),
            sets: initialSets,
          });
        }
      } else {
        const matchSetups = createTwoOnTwoMatches(players);
        for (const setup of matchSetups) {
          matches.push({
            id: createId(),
            teamA: setup.teamA,
            teamB: setup.teamB,
            sets: initialSets,
          });
        }
      }
    } else if (numPlayers === 2) {
      const matchSetups = createOneOnOneMatches(players);
      if (matchSetups.length > 0) {
        matches.push({
          id: createId(),
          teamA: matchSetups[0].teamA,
          teamB: matchSetups[0].teamB,
          sets: initialSets,
        });
      }
    } else {
      matches.push({
        id: createId(),
        teamA: [],
        teamB: [],
        sets: initialSets,
      });
    }
    
    return matches;
  }

  private generateRatingRound(initialSets: Array<{ teamA: number; teamB: number }>): Match[] {
    const { game, rounds } = this.options;
    const playingParticipants = game.participants.filter(p => p.isPlaying);
    const numPlayers = playingParticipants.length;
    
    if (numPlayers < 4) {
      return [];
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
    const matches: Match[] = [];
    
    for (let i = 0; i < actualMatches; i++) {
      const baseIndex = i * 4;
      const player1 = playerIds[baseIndex];
      const player2 = playerIds[baseIndex + 1];
      const player3 = playerIds[baseIndex + 2];
      const player4 = playerIds[baseIndex + 3];
      
      if (player1 && player2 && player3 && player4) {
        matches.push({
          id: createId(),
          teamA: [player1, player3],
          teamB: [player2, player4],
          sets: initialSets,
          courtId: sortedCourts[i]?.courtId,
        });
      }
    }
    
    return matches;
  }

  private generateWinnersCourtRound(initialSets: Array<{ teamA: number; teamB: number }>): Match[] {
    const { game, rounds } = this.options;
    const playingParticipants = game.participants.filter(p => p.isPlaying);
    const numPlayers = playingParticipants.length;
    
    if (numPlayers < 4) {
      return [];
    }
    
    const sortedCourts = game.gameCourts 
      ? [...game.gameCourts].sort((a, b) => a.order - b.order)
      : [];
    
    const numCourts = sortedCourts.length || 1;
    const numMatches = Math.min(numCourts, Math.floor(numPlayers / 4));

    if (rounds.length === 0) {
      const sortedPlayers = [...playingParticipants].sort((a, b) => b.user.level - a.user.level);
      const playerIds = sortedPlayers.map(p => p.userId);
      const matches: Match[] = [];
      
      for (let i = 0; i < numMatches; i++) {
        const baseIndex = i * 4;
        const player1 = playerIds[baseIndex];
        const player2 = playerIds[baseIndex + 1];
        const player3 = playerIds[baseIndex + 2];
        const player4 = playerIds[baseIndex + 3];
        
        if (player1 && player2 && player3 && player4) {
          matches.push({
            id: createId(),
            teamA: [player1, player3],
            teamB: [player2, player4],
            sets: initialSets,
            courtId: sortedCourts[i]?.courtId,
          });
        }
      }
      
      return matches;
    } else {
      const previousRound = rounds[rounds.length - 1];
      
      if (!previousRound.matches || previousRound.matches.length === 0) {
        return [];
      }

      const courtResults: Array<{
        courtIndex: number;
        winners: string[];
        losers: string[];
      }> = [];

      for (let i = 0; i < previousRound.matches.length; i++) {
        const match = previousRound.matches[i];
        
        const validSets = match.sets.filter(set => set.teamA > 0 || set.teamB > 0);
        const teamAScore = validSets.reduce((sum: number, set) => sum + set.teamA, 0);
        const teamBScore = validSets.reduce((sum: number, set) => sum + set.teamB, 0);
        
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

      const matches: Match[] = [];
      for (let i = 0; i < Math.min(newMatches.length, numMatches); i++) {
        const newMatch = newMatches[i];
        matches.push({
          id: createId(),
          teamA: newMatch.teamA,
          teamB: newMatch.teamB,
          sets: initialSets,
          courtId: sortedCourts[newMatch.courtIndex]?.courtId,
        });
      }
      
      return matches;
    }
  }

  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
