import { Op } from '@/types/ops';
import { OpCreator } from '../opCreators';
import { User } from '@/types';

export interface TwoOnTwoMatchSetup {
  matchId: string;
  teamA: string[];
  teamB: string[];
}

export function createTwoOnTwoMatches(players: User[]): TwoOnTwoMatchSetup[] {
  if (players.length !== 4) {
    throw new Error('Two-on-two games require exactly 4 players');
  }

  return [
    {
      matchId: 'match-1',
      teamA: [players[0].id, players[1].id],
      teamB: [players[2].id, players[3].id],
    },
    {
      matchId: 'match-2',
      teamA: [players[0].id, players[2].id],
      teamB: [players[1].id, players[3].id],
    },
    {
      matchId: 'match-3',
      teamA: [players[0].id, players[3].id],
      teamB: [players[1].id, players[2].id],
    },
  ];
}

export function createTwoOnTwoOps(
  opCreator: OpCreator,
  matches: TwoOnTwoMatchSetup[],
  roundId: string,
  createRound: boolean = true,
  createMatches: boolean = true
): Op[] {
  const ops: Op[] = [];

  if (createRound) {
    ops.push(opCreator.addRound(roundId));
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

