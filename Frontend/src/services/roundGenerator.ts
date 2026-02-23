import { createId } from '@paralleldrive/cuid2';
import { Round, Match } from '@/types/gameResults';
import { Game, BasicUser } from '@/types';
import {
  createOneOnOneMatches,
  createTwoOnTwoMatches,
  generateFixedRound,
  generateRandomRound,
  generateRatingRound,
  generateEscaleraRound,
  generateWinnersCourtRound,
  cloneSets,
} from './predefinedResults';

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
        return generateRatingRound(this.options.game, this.options.rounds, initialSets);
      case 'WINNERS_COURT':
        return generateWinnersCourtRound(this.options.game, this.options.rounds, initialSets);
      case 'ESCALERA':
        return generateEscaleraRound(this.options.game, this.options.rounds, initialSets);
      case 'ROUND_ROBIN':
        return [];
      default:
        return this.generateHandmadeRound(initialSets);
    }
  }

  private generateHandmadeRound(initialSets: Array<{ teamA: number; teamB: number }>): Match[] {
    const { game } = this.options;
    const playingParticipants = game.participants.filter(p => p.status === 'PLAYING');
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
            sets: cloneSets(initialSets),
          });
        }
      } else {
        const matchSetups = createTwoOnTwoMatches(players);
        for (const setup of matchSetups) {
          matches.push({
            id: createId(),
            teamA: setup.teamA,
            teamB: setup.teamB,
            sets: cloneSets(initialSets),
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
          sets: cloneSets(initialSets),
        });
      }
    } else {
      matches.push({
        id: createId(),
        teamA: [],
        teamB: [],
        sets: cloneSets(initialSets),
      });
    }
    
    return matches;
  }


}
