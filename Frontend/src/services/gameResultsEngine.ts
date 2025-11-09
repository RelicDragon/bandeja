import { create } from 'zustand';
import { Game, User } from '@/types';
import { Round, Match, GameState } from '@/types/gameResults';
import { Op, OutboxOp, GameShadow } from '@/types/ops';
import { ResultsStorage } from './resultsStorage';
import { resultsSyncService } from './resultsSync';
import { resultsApi } from '@/api/results';
import { gamesApi } from '@/api';
import { createOneOnOneMatches, createTwoOnTwoMatches } from './predefinedResults';
import { RoundGenerator } from './roundGenerator';
import { OpCreator } from './opCreators';

export type SyncStatus = 'IDLE' | 'SYNCING' | 'SUCCESS' | 'FAILED';

export type ConflictCallback = (conflicts: any[]) => void;

interface GameResultsState {
  gameId: string | null;
  userId: string | null;
  game: Game | null;
  rounds: Round[];
  shadow: GameShadow | null;
  pendingOpsCount: number;
  gameState: GameState | null;
  canEdit: boolean;
  loading: boolean;
  initialized: boolean;
  expandedRoundId: string | null;
  editingMatchId: string | null;
  syncStatus: SyncStatus;
}

interface GameResultsStore extends GameResultsState {
  setState: (state: Partial<GameResultsState>) => void;
}

const useGameResultsStore = create<GameResultsStore>((set) => ({
  gameId: null,
  userId: null,
  game: null,
  rounds: [],
  shadow: null,
  pendingOpsCount: 0,
  gameState: null,
  canEdit: false,
  loading: false,
  initialized: false,
  expandedRoundId: null,
  editingMatchId: null,
  syncStatus: 'IDLE',
  setState: (state) => set(state),
}));

class GameResultsEngineClass {
  private syncUnsubscribe: (() => void) | null = null;
  private conflictCallback: ConflictCallback | null = null;

  getState() {
    return useGameResultsStore.getState();
  }

  subscribe(callback: (state: GameResultsState) => void) {
    return useGameResultsStore.subscribe(callback);
  }

  setConflictCallback(callback: ConflictCallback | null) {
    this.conflictCallback = callback;
  }

  notifyConflicts(conflicts: any[]) {
    if (this.conflictCallback && conflicts.length > 0) {
      this.conflictCallback(conflicts);
    }
  }

  async initialize(gameId: string, userId: string, t: (key: string) => string): Promise<void> {
    const state = this.getState();
    if (state.initialized && state.gameId === gameId && state.userId === userId) {
      return;
    }

    useGameResultsStore.setState({ loading: true, gameId, userId });

    try {
      const [gameResponse, shadow, outbox] = await Promise.all([
        gamesApi.getById(gameId).catch(() => null),
        ResultsStorage.getGame(gameId),
        ResultsStorage.getOutbox(gameId),
      ]);

      if (!gameResponse) {
        throw new Error('Game not found');
      }

      const game = gameResponse.data;
      const canEdit = this.canUserEditResults(game, userId);
      const gameState = this.getGameState(game, userId);

      useGameResultsStore.setState({ game, canEdit, gameState });

      const resultsStatus = game.resultsStatus || 'NONE';
      
      // Don't initialize results if game needs setup and user can edit
      if (resultsStatus === 'NONE' && canEdit) {
        // Clear any stale data
        await ResultsStorage.clearOutbox(gameId);
        const emptyData = { rounds: [] };
        const newShadow = {
          gameId,
          data: emptyData,
          version: 0,
          lastSyncedAt: Date.now(),
        };
        await ResultsStorage.saveGame(newShadow);
        
        // Set up sync listener for when user starts entering results
        this.syncUnsubscribe = resultsSyncService.onSync(async () => {
          await this.updatePendingCount(gameId);
          const state = this.getState();
          if (state.pendingOpsCount === 0) {
            useGameResultsStore.setState({ syncStatus: 'SUCCESS' });
          }
        });
        
        useGameResultsStore.setState({ 
          rounds: [], 
          shadow: newShadow,
          pendingOpsCount: 0,
          initialized: true, 
          loading: false 
        });
        return;
      }

      const serverVersion = ((game as any).resultsMeta as any)?.version || 0;
      const shadowVersion = shadow?.version || 0;
      const hasOutbox = outbox.length > 0;

      let serverResultsData: any = null;
      let serverDataLoaded = false;

      if (game.resultsStatus !== 'NONE' || resultsStatus === 'IN_PROGRESS') {
        try {
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
          );
          const resultsPromise = resultsApi.getGameResults(gameId);
          const resultsResponse = await Promise.race([resultsPromise, timeoutPromise]) as any;
          
          if (resultsResponse?.data) {
            serverResultsData = resultsResponse.data;
            serverDataLoaded = true;
          }
        } catch (error) {
          console.warn('Failed to load server results:', error);
        }
      }

      const shadowData = shadow?.data;
      
      if (serverDataLoaded && serverResultsData) {
        if (shadowData && shadowVersion === serverVersion && !hasOutbox) {
          const stateData = this.convertServerResultsToState(serverResultsData, t);
          await ResultsStorage.saveGame({
            gameId,
            data: stateData,
            version: serverVersion,
            lastSyncedAt: Date.now(),
          });
          useGameResultsStore.setState({ 
            rounds: stateData.rounds, 
            shadow: { gameId, data: stateData, version: serverVersion, lastSyncedAt: Date.now() },
            expandedRoundId: stateData.rounds.length > 0 ? stateData.rounds[0].id : null,
          });
        } else if (shadowData && shadowVersion !== serverVersion) {
          // Only throw version conflict for users who can edit
          if (canEdit && hasOutbox) {
            throw new Error('Version conflict');
          }
          // For read-only users or users without pending changes, use server data
          const stateData = this.convertServerResultsToState(serverResultsData, t);
          const newShadow = {
            gameId,
            data: stateData,
            version: serverVersion,
            lastSyncedAt: Date.now(),
          };
          await ResultsStorage.saveGame(newShadow);
          // Clear any stale outbox for non-editors
          if (!canEdit) {
            await ResultsStorage.clearOutbox(gameId);
          }
          useGameResultsStore.setState({ 
            rounds: stateData.rounds,
            shadow: newShadow,
            expandedRoundId: stateData.rounds.length > 0 ? stateData.rounds[0].id : null,
          });
        } else if (!shadowData) {
          const stateData = this.convertServerResultsToState(serverResultsData, t);
          const newShadow = {
            gameId,
            data: stateData,
            version: serverVersion,
            lastSyncedAt: Date.now(),
          };
          await ResultsStorage.saveGame(newShadow);
          useGameResultsStore.setState({ 
            rounds: stateData.rounds,
            shadow: newShadow,
            expandedRoundId: stateData.rounds.length > 0 ? stateData.rounds[0].id : null,
          });
        }
      } else if (shadowData && !serverDataLoaded) {
        if (shadowData.rounds && Array.isArray(shadowData.rounds)) {
          const storedRounds = shadowData.rounds as Round[];
          useGameResultsStore.setState({ 
            rounds: storedRounds,
            shadow,
            expandedRoundId: storedRounds.length > 0 ? storedRounds[0].id : null,
          });
        }
      } else if (!shadowData && !serverDataLoaded) {
        const emptyData = { rounds: [] };
        const newShadow = {
          gameId,
          data: emptyData,
          version: 0,
          lastSyncedAt: Date.now(),
        };
        await ResultsStorage.saveGame(newShadow);
        useGameResultsStore.setState({ rounds: [], shadow: newShadow });
      }

      await this.updatePendingCount(gameId);

      this.syncUnsubscribe = resultsSyncService.onSync(async () => {
        await this.updatePendingCount(gameId);
        const state = this.getState();
        if (state.pendingOpsCount === 0) {
          useGameResultsStore.setState({ syncStatus: 'SUCCESS' });
        }
      });

      useGameResultsStore.setState({ initialized: true, loading: false });
    } catch (error) {
      console.error('Failed to initialize game results:', error);
      useGameResultsStore.setState({ loading: false });
      throw error;
    }
  }

  async reloadResults(t: (key: string) => string): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.initialized) return;

    console.log('[GameResultsEngine] Reloading results from server');

    try {
      const gameResponse = await gamesApi.getById(state.gameId);
      if (!gameResponse?.data) return;

      const game = gameResponse.data;
      const serverVersion = ((game as any).resultsMeta as any)?.version || 0;

      if (game.resultsStatus !== 'NONE') {
        const resultsResponse = await resultsApi.getGameResults(state.gameId);
        if (resultsResponse?.data) {
          const stateData = this.convertServerResultsToState(resultsResponse.data, t);
          const newShadow = {
            gameId: state.gameId,
            data: stateData,
            version: serverVersion,
            lastSyncedAt: Date.now(),
          };
          await ResultsStorage.saveGame(newShadow);
          
          const canEdit = this.canUserEditResults(game, state.userId!);
          if (!canEdit) {
            await ResultsStorage.clearOutbox(state.gameId);
          }

          useGameResultsStore.setState({ 
            rounds: stateData.rounds,
            shadow: newShadow,
            game,
            expandedRoundId: stateData.rounds.length > 0 ? stateData.rounds[0].id : state.expandedRoundId,
          });

          console.log('[GameResultsEngine] Results reloaded successfully');
        }
      }
    } catch (error) {
      console.error('[GameResultsEngine] Failed to reload results:', error);
    }
  }

  async initializeDefaultRound(t: (key: string) => string): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit || !state.game) return;

    const shadow = await ResultsStorage.getGame(state.gameId);
    const outbox = await ResultsStorage.getOutbox(state.gameId);

    if (!shadow || !shadow.data) return;

    const existingRounds = shadow.data.rounds || [];
    const hasRound = existingRounds.length > 0;
    const hasMatches = hasRound && existingRounds[0].matches && existingRounds[0].matches.length > 0;

    if (hasRound && hasMatches) return;
    if (outbox.length > 0) return;

    const opCreator = this.createOpCreator(shadow);
    const roundGenerator = new RoundGenerator({
      opCreator,
      rounds: existingRounds,
      game: state.game,
      roundNumber: 1,
      roundName: `${t('gameResults.round')} 1`,
      fixedNumberOfSets: state.game.fixedNumberOfSets,
    });

    const ops = roundGenerator.generateRound();

    if (ops.length > 0) {
      for (const op of ops) {
        await this.applyOp(op);
      }

      const updatedShadow = await ResultsStorage.getGame(state.gameId);
      if (updatedShadow?.data) {
        const updatedRounds = updatedShadow.data.rounds as Round[];
        useGameResultsStore.setState({ 
          rounds: updatedRounds,
          expandedRoundId: updatedRounds.length > 0 ? updatedRounds[0].id : null,
        });
      }

      await this.forceSync();
    }
  }

  async initializePresetMatches(t: (key: string) => string): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit || !state.game) return;

    const players = (state.game.participants?.map(p => p.user) || []) as User[];
    if (players.length !== 2 && players.length !== 4) return;

    const shadow = await ResultsStorage.getGame(state.gameId);
    const outbox = await ResultsStorage.getOutbox(state.gameId);

    if (!shadow || !shadow.data || !shadow.data.rounds) return;

    const hasPlayers = shadow.data.rounds.some((round: any) =>
      round.matches?.some((match: any) =>
        (match.teamA?.length > 0) || (match.teamB?.length > 0)
      )
    );

    if (hasPlayers || outbox.length > 0) return;

    const roundId = 'round-1';
    const roundName = `${t('gameResults.round')} 1`;
    const existingRounds = shadow.data.rounds || [];
    const hasRound = existingRounds.length > 0;
    const existingMatches = hasRound ? (existingRounds[0].matches || []) : [];
    const existingMatchIds = existingMatches.map((m: any) => m.id);

    const ops: Op[] = [];

    if (!hasRound) {
      const roundOp = await this.createOp((creator) => creator.addRound(roundId, roundName));
      ops.push(roundOp);
    }

    if (players.length === 2) {
      const matchSetup = createOneOnOneMatches(players);
      const matchId = matchSetup[0].matchId;

      if (!existingMatchIds.includes(matchId)) {
        const fixedNumberOfSets = state.game?.fixedNumberOfSets;
        const matchOp = await this.createOp((creator) => creator.addMatch(matchId, roundId, fixedNumberOfSets));
        ops.push(matchOp);
      }

      for (const playerId of matchSetup[0].teamA) {
        const op = await this.createOp((creator) => creator.addPlayerToTeam(matchId, 'teamA', playerId, roundId));
        ops.push(op);
      }
      for (const playerId of matchSetup[0].teamB) {
        const op = await this.createOp((creator) => creator.addPlayerToTeam(matchId, 'teamB', playerId, roundId));
        ops.push(op);
      }
    } else if (players.length === 4) {
      const matchSetup = createTwoOnTwoMatches(players);

      for (const match of matchSetup) {
        if (!existingMatchIds.includes(match.matchId)) {
          const fixedNumberOfSets = state.game?.fixedNumberOfSets;
          const matchOp = await this.createOp((creator) => creator.addMatch(match.matchId, roundId, fixedNumberOfSets));
          ops.push(matchOp);
        }

        for (const playerId of match.teamA) {
          const op = await this.createOp((creator) => creator.addPlayerToTeam(match.matchId, 'teamA', playerId, roundId));
          ops.push(op);
        }
        for (const playerId of match.teamB) {
          const op = await this.createOp((creator) => creator.addPlayerToTeam(match.matchId, 'teamB', playerId, roundId));
          ops.push(op);
        }
      }
    }

    if (ops.length > 0) {
      for (const op of ops) {
        await this.applyOp(op);
      }

      const updatedShadow = await ResultsStorage.getGame(state.gameId);
      if (updatedShadow?.data) {
        const updatedRounds = updatedShadow.data.rounds as Round[];
        useGameResultsStore.setState({ 
          rounds: updatedRounds,
          expandedRoundId: updatedRounds.length > 0 ? updatedRounds[0].id : null,
        });
      }

      await this.forceSync();
    }
  }

  async cleanup() {
    if (this.syncUnsubscribe) {
      this.syncUnsubscribe();
      this.syncUnsubscribe = null;
    }
    useGameResultsStore.setState({
      gameId: null,
      userId: null,
      game: null,
      rounds: [],
      shadow: null,
      pendingOpsCount: 0,
      gameState: null,
      canEdit: false,
      loading: false,
      initialized: false,
      expandedRoundId: null,
      editingMatchId: null,
      syncStatus: 'IDLE',
    });
  }

  getGameResults(): { rounds: Round[] } {
    const state = this.getState();
    return { rounds: state.rounds };
  }

  async addRound(name?: string, t?: (key: string) => string): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit || !state.game) return;

    const shadow = await ResultsStorage.getGame(state.gameId);
    if (!shadow) return;

    const roundNumber = state.rounds.length + 1;
    const roundId = `round-${roundNumber}`;
    const roundName = name || (t ? `${t('gameResults.round')} ${roundNumber}` : `Round ${roundNumber}`);

    const opCreator = this.createOpCreator(shadow);
    const roundGenerator = new RoundGenerator({
      opCreator,
      rounds: state.rounds,
      game: state.game,
      roundNumber,
      roundName,
      fixedNumberOfSets: state.game.fixedNumberOfSets,
    });

    const ops = roundGenerator.generateRound();

    for (const op of ops) {
      await this.applyOp(op);
    }
    
    useGameResultsStore.setState({ expandedRoundId: roundId, syncStatus: 'SYNCING' });
    resultsSyncService.debouncedSync(state.gameId);
  }

  async removeRound(roundId: string): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;
    if (state.rounds.length <= 1) return;

    const op = await this.createOp((creator) => creator.removeRound(roundId));
    await this.applyOp(op);

    if (state.expandedRoundId === roundId) {
      const newRounds = state.rounds.filter(r => r.id !== roundId);
      useGameResultsStore.setState({ expandedRoundId: newRounds[0]?.id || null, syncStatus: 'SYNCING' });
    } else {
      useGameResultsStore.setState({ syncStatus: 'SYNCING' });
    }

    resultsSyncService.debouncedSync(state.gameId);
  }

  async addMatch(roundId: string, matchId?: string): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;

    const round = state.rounds.find(r => r.id === roundId);
    if (!round) return;

    const totalMatches = state.rounds.reduce((sum, r) => sum + r.matches.length, 0);
    const newMatchId = matchId || `match-${totalMatches + 1}`;
    const fixedNumberOfSets = state.game?.fixedNumberOfSets;
    const op = await this.createOp((creator) => creator.addMatch(newMatchId, roundId, fixedNumberOfSets));
    await this.applyOp(op);

    useGameResultsStore.setState({ editingMatchId: newMatchId, syncStatus: 'SYNCING' });
    resultsSyncService.debouncedSync(state.gameId);
  }

  async removeMatch(roundId: string, matchId: string): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;

    const round = state.rounds.find(r => r.id === roundId);
    if (!round || round.matches.length <= 1) return;

    const op = await this.createOp((creator) => creator.removeMatch(matchId, roundId));
    await this.applyOp(op);

    if (state.editingMatchId === matchId) {
      const updatedRound = state.rounds.find(r => r.id === roundId);
      useGameResultsStore.setState({ editingMatchId: updatedRound?.matches[0]?.id || null, syncStatus: 'SYNCING' });
    } else {
      useGameResultsStore.setState({ syncStatus: 'SYNCING' });
    }

    resultsSyncService.debouncedSync(state.gameId);
  }

  async addPlayerToTeam(roundId: string, matchId: string, team: 'teamA' | 'teamB', playerId: string): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;

    const round = state.rounds.find(r => r.id === roundId);
    if (!round) return;

    const match = round.matches.find(m => m.id === matchId);
    if (!match) return;

    const otherTeam = team === 'teamA' ? 'teamB' : 'teamA';
    if (match[otherTeam].includes(playerId) || match[team].includes(playerId)) return;

    const op = await this.createOp((creator) => creator.addPlayerToTeam(matchId, team, playerId, roundId));
    await this.applyOp(op);

    useGameResultsStore.setState({ syncStatus: 'SYNCING' });
    resultsSyncService.debouncedSync(state.gameId);
  }

  async removePlayerFromTeam(roundId: string, matchId: string, team: 'teamA' | 'teamB', playerId: string): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;

    const op = await this.createOp((creator) => creator.removePlayerFromTeam(matchId, team, playerId, roundId));
    await this.applyOp(op);

    useGameResultsStore.setState({ syncStatus: 'SYNCING' });
    resultsSyncService.debouncedSync(state.gameId);
  }

  async updateMatch(roundId: string, matchId: string, match: { teamA: string[]; teamB: string[]; sets: Array<{ teamA: number; teamB: number }>; courtId?: string }): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;

    const op = await this.createOp((creator) => creator.updateMatch(matchId, match, roundId));
    await this.applyOp(op);

    useGameResultsStore.setState({ syncStatus: 'SYNCING' });
    resultsSyncService.debouncedSync(state.gameId);
  }

  async setMatchCourt(roundId: string, matchId: string, courtId: string): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;

    const op = await this.createOp((creator) => creator.setMatchCourt(matchId, courtId, roundId));
    await this.applyOp(op);

    useGameResultsStore.setState({ syncStatus: 'SYNCING' });
    resultsSyncService.debouncedSync(state.gameId);
  }

  setExpandedRoundId(roundId: string | null): void {
    useGameResultsStore.setState({ expandedRoundId: roundId });
  }

  setEditingMatchId(matchId: string | null): void {
    useGameResultsStore.setState({ editingMatchId: matchId });
  }

  async forceSync(): Promise<void> {
    const state = this.getState();
    if (!state.gameId) return;
    
    useGameResultsStore.setState({ syncStatus: 'SYNCING' });
    
    try {
      await resultsSyncService.forceSync(state.gameId);
      const outbox = await ResultsStorage.getOutbox(state.gameId);
      const hasPending = outbox.some((o) => o.status === 'pending' || o.status === 'sending');
      
      if (!hasPending) {
        useGameResultsStore.setState({ syncStatus: 'SUCCESS' });
      }
    } catch (error) {
      useGameResultsStore.setState({ syncStatus: 'FAILED' });
    }
  }

  setSyncStatus(status: SyncStatus): void {
    useGameResultsStore.setState({ syncStatus: status });
  }

  updateGame(game: Game): void {
    const state = this.getState();
    if (!state.userId) return;
    
    const canEdit = this.canUserEditResults(game, state.userId);
    const gameState = this.getGameState(game, state.userId);
    
    useGameResultsStore.setState({ 
      game,
      canEdit,
      gameState,
    });
  }

  async resetGame(): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId) return;

    // Clear all pending ops before creating reset op
    await ResultsStorage.clearOutbox(state.gameId);

    const op = await this.createOp((creator) => creator.resetGame());
    await this.applyOp(op);

    const emptyData = { rounds: [] };
    const shadow = await ResultsStorage.getGame(state.gameId);
    if (shadow) {
      shadow.data = emptyData;
      shadow.version = 0;
      await ResultsStorage.saveGame(shadow);
    }

    useGameResultsStore.setState({ 
      rounds: [],
      shadow: shadow || null,
      syncStatus: 'SYNCING',
    });

    await this.forceSync();
  }

  private createOpCreator(shadow: GameShadow): OpCreator {
    const state = this.getState();
    if (!state.gameId || !state.userId) throw new Error('Not initialized');

    const creator = new OpCreator(state.gameId, state.userId, shadow.version);
    
    if (shadow.data?.rounds && Array.isArray(shadow.data.rounds)) {
      creator.setRoundIndexMap(shadow.data.rounds);
      
      const allMatches: Array<{ id: string; roundIndex: number; matchIndex: number }> = [];
      shadow.data.rounds.forEach((round: any, roundIndex: number) => {
        if (round.matches && Array.isArray(round.matches)) {
          round.matches.forEach((match: any, matchIndex: number) => {
            allMatches.push({ id: match.id, roundIndex, matchIndex });
          });
        }
      });
      
      if (allMatches.length > 0) {
        creator.setMatchIndexMap(allMatches);
      }
    }

    return creator;
  }

  private async createOp(opFactory: (creator: OpCreator) => Op): Promise<Op> {
    const shadow = await ResultsStorage.getGame(this.getState().gameId!);
    if (!shadow) throw new Error('Shadow not found');

    const creator = this.createOpCreator(shadow);
    return opFactory(creator);
  }

  private async applyOp(op: Op): Promise<void> {
    const state = this.getState();
    if (!state.gameId) return;

    const shadow = await ResultsStorage.getGame(state.gameId);
    if (!shadow || !shadow.data) {
      console.error('Cannot apply op: shadow does not exist');
      return;
    }

    const outboxOp: OutboxOp = {
      ...op,
      status: 'pending',
      retryCount: 0,
    };

    await ResultsStorage.addToOutbox(state.gameId, outboxOp);

    const newState = this.applyOpToState(shadow.data, op);
    shadow.data = newState;
    await ResultsStorage.saveGame(shadow);

    if (newState.rounds) {
      useGameResultsStore.setState({ 
        rounds: newState.rounds,
        shadow,
      });
    }

    await this.updatePendingCount(state.gameId);
  }

  private applyOpToState(state: any, op: Op): any {
    const pathParts = op.path.split('/').filter(Boolean);
    
    const deepClone = (obj: any): any => {
      if (obj === null || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(deepClone);
      return Object.keys(obj).reduce((acc, key) => {
        acc[key] = deepClone(obj[key]);
        return acc;
      }, {} as any);
    };

    const getValue = (obj: any, path: string[]): any => {
      let current = obj;
      for (const part of path) {
        if (current === undefined || current === null) return undefined;
        if (Array.isArray(current) && !isNaN(parseInt(part))) {
          current = current[parseInt(part)];
        } else {
          current = current[part];
        }
      }
      return current;
    };

    const setValue = (obj: any, path: string[], value: any): any => {
      if (path.length === 0) return value;
      
      const [head, ...tail] = path;
      const cloned = Array.isArray(obj) ? [...obj] : { ...obj };
      
      if (Array.isArray(cloned) && !isNaN(parseInt(head))) {
        const index = parseInt(head);
        if (tail.length === 0) {
          cloned[index] = value;
        } else {
          cloned[index] = setValue(cloned[index] || {}, tail, value);
        }
      } else {
        if (tail.length === 0) {
          cloned[head] = value;
        } else {
          cloned[head] = setValue(cloned[head] || {}, tail, value);
        }
      }
      
      return cloned;
    };

    const newState = deepClone(state);

    if (op.type === 'set') {
      return setValue(newState, pathParts, op.value);
    } else if (op.type === 'add') {
      if (pathParts.length === 1) {
        const key = pathParts[0];
        const arr = Array.isArray(newState[key]) ? [...newState[key]] : [];
        arr.push(op.value);
        newState[key] = arr;
        return newState;
      } else {
        const parentPath = pathParts.slice(0, -1);
        const key = pathParts[pathParts.length - 1];
        const parent = getValue(newState, parentPath);
        
        if (Array.isArray(parent?.[key])) {
          const arr = [...parent[key]];
          arr.push(op.value);
          return setValue(newState, parentPath.concat(key), arr);
        } else if (Array.isArray(parent)) {
          const arr = [...parent];
          arr.push(op.value);
          return setValue(newState, parentPath, arr);
        }
      }
    } else if (op.type === 'remove') {
      const parentPath = pathParts.slice(0, -1);
      const key = pathParts[pathParts.length - 1];
      const parent = getValue(newState, parentPath);
      
      if (Array.isArray(parent)) {
        const index = parseInt(key);
        if (!isNaN(index)) {
          const arr = [...parent];
          arr.splice(index, 1);
          return setValue(newState, parentPath, arr);
        }
      } else if (parent && typeof parent === 'object') {
        const obj = { ...parent };
        delete obj[key];
        return setValue(newState, parentPath, obj);
      }
    }

    return newState;
  }

  private async updatePendingCount(gameId: string): Promise<void> {
    const outbox = await ResultsStorage.getOutbox(gameId);
    const pending = outbox.filter((o: OutboxOp) => o.status === 'pending' || o.status === 'sending' || o.status === 'failed');
    useGameResultsStore.setState({ pendingOpsCount: pending.length });
  }

  private convertServerResultsToState(serverResults: any, t: (key: string) => string): { rounds: Round[] } {
    const rounds: Round[] = [];
    
    if (serverResults.rounds && Array.isArray(serverResults.rounds)) {
      serverResults.rounds.forEach((round: any, roundIndex: number) => {
        const matches: Match[] = [];
        
        if (round.matches && Array.isArray(round.matches)) {
          round.matches.forEach((match: any, matchIndex: number) => {
          const teamA: string[] = [];
          const teamB: string[] = [];
          let teamAId: string | undefined;
          let teamBId: string | undefined;
          
          if (match.teams && Array.isArray(match.teams)) {
            match.teams.forEach((team: any) => {
              const playerIds = team.playerIds || (team.players || []).map((p: any) => p.userId || p.user?.id).filter(Boolean);
              if (team.teamNumber === 1 && playerIds.length > 0) {
                teamA.push(...playerIds);
                teamAId = team.id;
              } else if (team.teamNumber === 2 && playerIds.length > 0) {
                teamB.push(...playerIds);
                teamBId = team.id;
              }
            });
          }
            
            const sets = match.sets && Array.isArray(match.sets) && match.sets.length > 0
              ? match.sets.map((s: any) => ({ teamA: s.teamAScore || 0, teamB: s.teamBScore || 0 }))
              : [{ teamA: 0, teamB: 0 }];
            
            let winnerTeam: 'teamA' | 'teamB' | null = null;
            if (match.winnerId) {
              if (match.winnerId === teamAId) {
                winnerTeam = 'teamA';
              } else if (match.winnerId === teamBId) {
                winnerTeam = 'teamB';
              }
            }
            
            matches.push({
              id: `match-${matchIndex + 1}`,
              teamA,
              teamB,
              sets,
              winnerId: winnerTeam,
              courtId: match.courtId,
            });
          });
        }
        
        rounds.push({
          id: `round-${roundIndex + 1}`,
          name: `${t('gameResults.round')} ${roundIndex + 1}`,
          matches,
        });
      });
    }
    
    if (rounds.length === 0) {
      rounds.push({
        id: 'round-1',
        name: `${t('gameResults.round')} 1`,
        matches: [],
      });
    }
    
    return { rounds };
  }

  private canUserEditResults(game: Game, userId: string): boolean {
    const participant = game.participants?.find((p) => p.userId === userId);
    if (!participant) return false;
    if (participant.role === 'OWNER' || participant.role === 'ADMIN') return true;
    if (game.resultsByAnyone) return true;
    return false;
  }

  private getGameState(game: Game, userId: string): GameState {
    const canEdit = this.canUserEditResults(game, userId);
    const participant = game.participants?.find((p) => p.userId === userId);
    
    if (!participant) {
      return {
        type: 'ACCESS_DENIED',
        message: 'games.results.problems.accessDenied',
        canEdit: false,
        showInputs: false,
        showClock: false,
      };
    }

    if (game.status === 'ARCHIVED') {
      // Allow viewing results for archived games if results exist
      if (game.resultsStatus !== 'NONE') {
        return {
          type: 'HAS_RESULTS',
          message: 'games.results.positive.canViewResults',
          canEdit: false,
          showInputs: false,
          showClock: false,
        };
      }
      return {
        type: 'GAME_ARCHIVED',
        message: 'games.results.problems.gameArchived',
        canEdit: false,
        showInputs: false,
        showClock: false,
      };
    }

    const now = new Date();
    const startTime = new Date(game.startTime);

    if (now < startTime) {
      return {
        type: 'GAME_NOT_STARTED',
        message: 'games.results.problems.gameNotStarted',
        canEdit,
        showInputs: false,
        showClock: canEdit,
      };
    }

    const playingParticipants = game.participants?.filter((p) => p.isPlaying) || [];
    if (playingParticipants.length < 2) {
      return {
        type: 'INSUFFICIENT_PLAYERS',
        message: 'games.results.problems.insufficientPlayers',
        canEdit,
        showInputs: false,
        showClock: canEdit,
      };
    }

    if (game.resultsStatus !== 'NONE') {
      return {
        type: 'HAS_RESULTS',
        message: canEdit ? 'games.results.positive.canModifyResults' : 'games.results.positive.canViewResults',
        canEdit,
        showInputs: false,
        showClock: false,
      };
    }

    return {
      type: 'NO_RESULTS',
      message: 'games.results.positive.noResultsYet',
      canEdit,
      showInputs: false,
      showClock: canEdit && now >= startTime,
    };
  }

  async applyRemoteOps(ops: Op[]): Promise<void> {
    const state = this.getState();
    if (!state.gameId) return;

    const shadow = await ResultsStorage.getGame(state.gameId);
    if (!shadow || !shadow.data) {
      console.error('Cannot apply remote ops: shadow does not exist');
      return;
    }

    console.log(`[GameResultsEngine] Applying ${ops.length} remote op(s) to shadow (current version: ${shadow.version})`);
    
    let newState = shadow.data;
    for (const op of ops) {
      console.log(`[GameResultsEngine] Applying op ${op.id}: ${op.type} ${op.path}`);
      newState = this.applyOpToState(newState, op);
    }

    shadow.data = newState;
    shadow.version += 1;
    shadow.lastSyncedAt = Date.now();
    await ResultsStorage.saveGame(shadow);

    console.log(`[GameResultsEngine] Remote ops applied successfully, new version: ${shadow.version}`);

    if (newState.rounds) {
      useGameResultsStore.setState({ 
        rounds: newState.rounds,
        shadow,
      });
    }
  }

  async resolveConflictsAcceptServer(): Promise<void> {
    const state = this.getState();
    if (!state.gameId) return;

    console.log('[GameResultsEngine] Resolving conflicts: accepting server state');

    const outbox = await ResultsStorage.getOutbox(state.gameId);
    const conflictedOps = outbox.filter(op => op.status === 'conflict');
    await ResultsStorage.removeOutboxOps(state.gameId, conflictedOps.map(op => op.id));

    const gameResponse = await gamesApi.getById(state.gameId);
    if (gameResponse?.data) {
      const game = gameResponse.data;
      const serverResultsData = await resultsApi.getGameResults(state.gameId);
      
      if (serverResultsData.data) {
        const t = (key: string) => key;
        const stateData = this.convertServerResultsToState(serverResultsData.data, t);
        const serverVersion = (game.resultsMeta?.version || 0);

        await ResultsStorage.saveGame({
          gameId: state.gameId,
          data: stateData,
          version: serverVersion,
          lastSyncedAt: Date.now(),
        });

        useGameResultsStore.setState({
          game,
          rounds: stateData.rounds,
          shadow: {
            gameId: state.gameId,
            data: stateData,
            version: serverVersion,
            lastSyncedAt: Date.now(),
          },
          syncStatus: 'SUCCESS',
        });

        console.log('[GameResultsEngine] Conflicts resolved: server state accepted');
      }
    }
  }

  async resolveConflictsForceClient(): Promise<void> {
    const state = this.getState();
    if (!state.gameId) return;

    console.log('[GameResultsEngine] Resolving conflicts: forcing client state');

    const gameResponse = await gamesApi.getById(state.gameId);
    if (!gameResponse?.data) return;

    const game = gameResponse.data;
    const serverVersion = (game.resultsMeta?.version || 0);

    const outbox = await ResultsStorage.getOutbox(state.gameId);
    const conflictedOps = outbox.filter(op => op.status === 'conflict');

    for (const op of conflictedOps) {
      await ResultsStorage.updateOutboxOp(state.gameId, op.id, {
        status: 'pending',
        baseVersion: serverVersion,
        lastError: undefined,
      });
    }

    const shadow = await ResultsStorage.getGame(state.gameId);
    if (shadow) {
      shadow.version = serverVersion;
      await ResultsStorage.saveGame(shadow);
    }

    useGameResultsStore.setState({ syncStatus: 'SYNCING' });
    
    await this.forceSync();

    console.log('[GameResultsEngine] Conflicts resolved: client state forced');
  }
}

export const GameResultsEngine = new GameResultsEngineClass();
export { useGameResultsStore };

