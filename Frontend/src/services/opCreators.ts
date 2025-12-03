import { createId } from '@paralleldrive/cuid2';
import { Op } from '@/types/ops';

export class OpCreator {
  private gameId: string;
  private userId: string;
  private baseVersion: number;

  constructor(gameId: string, userId: string, baseVersion: number) {
    this.gameId = gameId;
    this.userId = userId;
    this.baseVersion = baseVersion;
  }

  private createOp(path: string, type: Op['type'], value?: any): Op {
    return {
      id: createId(),
      gameId: this.gameId,
      baseVersion: this.baseVersion,
      path,
      type,
      value,
      ts: Date.now(),
      actor: { userId: this.userId },
    };
  }

  updateMatch(matchId: string, match: { teamA: string[]; teamB: string[]; sets: Array<{ id?: string; teamA: number; teamB: number }>; courtId?: string }, roundId: string): Op {
    return this.createOp(`/rounds/${roundId}/matches/${matchId}`, 'set', {
      id: matchId,
      ...match,
    });
  }

  addPlayerToTeam(matchId: string, team: 'teamA' | 'teamB', playerId: string, roundId: string): Op {
    return this.createOp(`/rounds/${roundId}/matches/${matchId}/${team}`, 'add', playerId);
  }

  removePlayerFromTeam(matchId: string, team: 'teamA' | 'teamB', playerId: string, roundId: string): Op {
    return this.createOp(`/rounds/${roundId}/matches/${matchId}/${team}/${playerId}`, 'remove');
  }

  addMatch(matchId: string, roundId: string, fixedNumberOfSets?: number): Op {
    const initialSets = fixedNumberOfSets && fixedNumberOfSets > 0
      ? Array.from({ length: fixedNumberOfSets }, () => ({ id: createId(), teamA: 0, teamB: 0 }))
      : [{ id: createId(), teamA: 0, teamB: 0 }];
    return this.createOp(`/rounds/${roundId}/matches`, 'add', { id: matchId, teamA: [], teamB: [], sets: initialSets });
  }

  removeMatch(matchId: string, roundId: string): Op {
    return this.createOp(`/rounds/${roundId}/matches/${matchId}`, 'remove');
  }

  addRound(roundId: string, _name?: string): Op {
    return this.createOp(`/rounds`, 'add', { id: roundId, matches: [] });
  }

  removeRound(roundId: string): Op {
    return this.createOp(`/rounds/${roundId}`, 'remove');
  }

  setMatchCourt(matchId: string, courtId: string, roundId: string): Op {
    return this.createOp(`/rounds/${roundId}/matches/${matchId}/courtId`, 'set', courtId);
  }
}

