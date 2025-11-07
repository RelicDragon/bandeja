import { Op } from '@/types/ops';
import { OpCreator } from '../opCreators';
import { User } from '@/types';

export interface OneOnOneMatchSetup {
  matchId: string;
  teamA: string[];
  teamB: string[];
}

export function createOneOnOneMatches(players: User[]): OneOnOneMatchSetup[] {
  if (players.length !== 2) {
    throw new Error('One-on-one games require exactly 2 players');
  }

  return [
    {
      matchId: 'match-1',
      teamA: [players[0].id],
      teamB: [players[1].id],
    },
  ];
}

export function createOneOnOneOps(
  opCreator: OpCreator,
  matches: OneOnOneMatchSetup[],
  roundId: string,
  roundName: string,
  createRound: boolean = true,
  createMatches: boolean = true
): Op[] {
  const ops: Op[] = [];

  if (createRound) {
    ops.push(opCreator.addRound(roundId, roundName));
  }

  for (const match of matches) {
    if (createMatches) {
      ops.push(opCreator.addMatch(match.matchId, roundId));
    }
    
    for (const playerId of match.teamA) {
      ops.push(opCreator.addPlayerToTeam(match.matchId, 'teamA', playerId, roundId));
    }
    for (const playerId of match.teamB) {
      ops.push(opCreator.addPlayerToTeam(match.matchId, 'teamB', playerId, roundId));
    }
  }

  return ops;
}

