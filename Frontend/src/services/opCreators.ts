import { nanoid } from 'nanoid';
import { Op } from '@/types/ops';

export class OpCreator {
  private gameId: string;
  private userId: string;
  private baseVersion: number;
  private roundIndexMap: Map<string, number> = new Map();
  private matchIndexMap: Map<string, number> = new Map();

  constructor(gameId: string, userId: string, baseVersion: number) {
    this.gameId = gameId;
    this.userId = userId;
    this.baseVersion = baseVersion;
  }

  private getRoundIndex(roundId: string): number {
    if (this.roundIndexMap.has(roundId)) {
      return this.roundIndexMap.get(roundId)!;
    }
    // Extract number from round-X format
    const match = roundId.match(/round-(\d+)/);
    return match ? parseInt(match[1]) - 1 : 0;
  }

  private getMatchIndex(matchId: string): number {
    if (this.matchIndexMap.has(matchId)) {
      return this.matchIndexMap.get(matchId)!;
    }
    // Extract number from match-X format
    const match = matchId.match(/match-(\d+)/);
    return match ? parseInt(match[1]) - 1 : 0;
  }

  setRoundIndexMap(rounds: Array<{ id: string }>): void {
    this.roundIndexMap.clear();
    if (Array.isArray(rounds)) {
      rounds.forEach((round, index) => {
        this.roundIndexMap.set(round.id, index);
      });
    }
  }

  setMatchIndexMap(matches: Array<{ id: string; matchIndex: number }>): void {
    this.matchIndexMap.clear();
    if (Array.isArray(matches)) {
      matches.forEach(({ id, matchIndex }) => {
        this.matchIndexMap.set(id, matchIndex);
      });
    }
  }

  registerMatchIndex(matchId: string, matchIndex: number): void {
    this.matchIndexMap.set(matchId, matchIndex);
  }

  private createOp(path: string, type: Op['type'], value?: any): Op {
    return {
      id: nanoid(),
      gameId: this.gameId,
      baseVersion: this.baseVersion,
      path,
      type,
      value,
      ts: Date.now(),
      actor: { userId: this.userId },
    };
  }

  updateMatch(matchId: string, match: { teamA: string[]; teamB: string[]; sets: Array<{ teamA: number; teamB: number }>; courtId?: string }, roundId: string): Op {
    const roundIndex = this.getRoundIndex(roundId);
    const matchIndex = this.getMatchIndex(matchId);
    return this.createOp(`/rounds/${roundIndex}/matches/${matchIndex}`, 'set', {
      id: matchId,
      ...match,
    });
  }

  addPlayerToTeam(matchId: string, team: 'teamA' | 'teamB', playerId: string, roundId: string): Op {
    const roundIndex = this.getRoundIndex(roundId);
    const matchIndex = this.getMatchIndex(matchId);
    return this.createOp(`/rounds/${roundIndex}/matches/${matchIndex}/${team}`, 'add', playerId);
  }

  removePlayerFromTeam(matchId: string, team: 'teamA' | 'teamB', playerId: string, roundId: string): Op {
    const roundIndex = this.getRoundIndex(roundId);
    const matchIndex = this.getMatchIndex(matchId);
    return this.createOp(`/rounds/${roundIndex}/matches/${matchIndex}/${team}/${playerId}`, 'remove');
  }

  addMatch(matchId: string, roundId: string, fixedNumberOfSets?: number): Op {
    const roundIndex = this.getRoundIndex(roundId);
    const initialSets = fixedNumberOfSets && fixedNumberOfSets > 0
      ? Array.from({ length: fixedNumberOfSets }, () => ({ teamA: 0, teamB: 0 }))
      : [{ teamA: 0, teamB: 0 }];
    return this.createOp(`/rounds/${roundIndex}/matches`, 'add', { id: matchId, teamA: [], teamB: [], sets: initialSets });
  }

  removeMatch(matchId: string, roundId: string): Op {
    const roundIndex = this.getRoundIndex(roundId);
    const matchIndex = this.getMatchIndex(matchId);
    return this.createOp(`/rounds/${roundIndex}/matches/${matchIndex}`, 'remove');
  }

  addRound(roundId: string, name: string): Op {
    return this.createOp(`/rounds`, 'add', { id: roundId, name, matches: [] });
  }

  removeRound(roundId: string): Op {
    const roundIndex = this.getRoundIndex(roundId);
    return this.createOp(`/rounds/${roundIndex}`, 'remove');
  }

  setMatchCourt(matchId: string, courtId: string, roundId: string): Op {
    const roundIndex = this.getRoundIndex(roundId);
    const matchIndex = this.getMatchIndex(matchId);
    return this.createOp(`/rounds/${roundIndex}/matches/${matchIndex}/courtId`, 'set', courtId);
  }
}

