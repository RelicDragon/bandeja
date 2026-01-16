import { create } from 'zustand';
import { createId } from '@paralleldrive/cuid2';
import { Game } from '@/types';
import { Round, Match, GameState } from '@/types/gameResults';
import { ResultsStorage, LocalResults } from './resultsStorage';
import { resultsApi } from '@/api/results';
import { gamesApi } from '@/api';
import { isUserGameAdminOrOwner, isUserGameParticipant, validateSetScores, validateSetIndexAgainstFixed } from '@/utils/gameResults';
import { RoundGenerator } from './roundGenerator';

export type SyncStatus = 'IDLE' | 'SYNCING' | 'SUCCESS' | 'FAILED';

interface GameResultsState {
  gameId: string | null;
  userId: string | null;
  game: Game | null;
  rounds: Round[];
  gameState: GameState | null;
  canEdit: boolean;
  loading: boolean;
  initialized: boolean;
  expandedRoundId: string | null;
  editingMatchId: string | null;
  syncStatus: SyncStatus;
  serverProblem: boolean;
}

interface GameResultsStore extends GameResultsState {
  setState: (state: Partial<GameResultsState>) => void;
}

const useGameResultsStore = create<GameResultsStore>((set) => ({
  gameId: null,
  userId: null,
  game: null,
  rounds: [],
  gameState: null,
  canEdit: false,
  loading: false,
  initialized: false,
  expandedRoundId: null,
  editingMatchId: null,
  syncStatus: 'IDLE',
  serverProblem: false,
  setState: (state) => set(state),
}));

class GameResultsEngineClass {
  getState() {
    return useGameResultsStore.getState();
  }

  subscribe(callback: (state: GameResultsState) => void) {
    return useGameResultsStore.subscribe(callback);
  }

  async initialize(gameId: string, userId: string, t: (key: string) => string): Promise<void> {
    const state = this.getState();
    if (state.initialized && state.gameId === gameId && state.userId === userId) {
      return;
    }

    useGameResultsStore.setState({ loading: true, gameId, userId });

    try {
      const [gameResponse, localResults, serverProblem] = await Promise.all([
        gamesApi.getById(gameId).catch(() => null),
        ResultsStorage.getResults(gameId),
        ResultsStorage.getServerProblem(gameId),
      ]);

      if (!gameResponse) {
        throw new Error('Game not found');
      }

      const game = gameResponse.data;
      const canEdit = this.canUserEditResults(game, userId);
      const gameState = this.getGameState(game, userId);

      useGameResultsStore.setState({ game, canEdit, gameState, serverProblem });

      const resultsStatus = game.resultsStatus || 'NONE';
      
      if (resultsStatus === 'NONE' && canEdit) {
        const emptyData: LocalResults = {
          gameId,
          rounds: [],
        };
        await ResultsStorage.saveResults(emptyData);
        useGameResultsStore.setState({ 
          gameId,
          userId,
          rounds: [], 
          initialized: true, 
          loading: false,
        });
        return;
      }

      let rounds: Round[] = [];
      
      // Check if there are existing rounds in the store (from a previous operation like addRound)
      const currentStoreState = this.getState();
      const hasExistingRounds = currentStoreState.rounds.length > 0 && 
                                 currentStoreState.gameId === gameId;

      if (resultsStatus !== 'NONE') {
        try {
          const resultsResponse = await resultsApi.getGameResults(gameId);
          if (resultsResponse?.data) {
            const serverRounds = this.convertServerResultsToState(resultsResponse.data, t).rounds;
            // If we have existing rounds in store for this game, prefer them over server
            // This prevents overwriting rounds that were just added locally
            if (hasExistingRounds) {
              rounds = currentStoreState.rounds;
              // Still save to local storage for consistency
              const localData: LocalResults = {
                gameId,
                rounds,
                lastSyncedAt: Date.now(),
              };
              await ResultsStorage.saveResults(localData);
            } else {
              rounds = serverRounds;
              const localData: LocalResults = {
                gameId,
                rounds,
                lastSyncedAt: Date.now(),
              };
              await ResultsStorage.saveResults(localData);
            }
            await ResultsStorage.setServerProblem(gameId, false);
            useGameResultsStore.setState({ serverProblem: false });
          } else if (hasExistingRounds) {
            // Server returned no data but we have rounds in store, use store
            rounds = currentStoreState.rounds;
          }
        } catch (error) {
          console.warn('Failed to load server results, using local:', error);
          if (hasExistingRounds) {
            rounds = currentStoreState.rounds;
          } else if (localResults?.rounds) {
            rounds = localResults.rounds;
          }
        }
      } else if (hasExistingRounds) {
        rounds = currentStoreState.rounds;
      } else if (localResults?.rounds) {
        rounds = localResults.rounds;
      }

      if (rounds.length === 0) {
        const emptyData: LocalResults = {
            gameId,
          rounds: [],
        };
        await ResultsStorage.saveResults(emptyData);
      }

      // Avoid overwriting rounds that might have been added while we were loading.
      // This prevents a race where "Start results entry" adds the first round,
      // but a late-finishing initialize() call writes stale (empty) rounds back.
      const latestStoreState = this.getState();
      const shouldKeepLatestRounds =
        latestStoreState.gameId === gameId && latestStoreState.rounds.length > 0;

      const finalRounds = shouldKeepLatestRounds ? latestStoreState.rounds : rounds;
      const finalExpandedRoundId =
        shouldKeepLatestRounds
          ? (latestStoreState.expandedRoundId ?? (finalRounds.length > 0 ? finalRounds[finalRounds.length - 1].id : null))
          : (finalRounds.length > 0 ? finalRounds[finalRounds.length - 1].id : null);

      useGameResultsStore.setState({
        gameId,
        userId,
        rounds: finalRounds,
        initialized: true,
        loading: false,
        expandedRoundId: finalExpandedRoundId,
      });
    } catch (error) {
      console.error('Failed to initialize game results:', error);
      useGameResultsStore.setState({ loading: false });
      throw error;
          }
  }

  async syncToServer(): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;

    useGameResultsStore.setState({ syncStatus: 'SYNCING' });

    try {
      await resultsApi.syncResults(state.gameId, state.rounds);
      await ResultsStorage.setServerProblem(state.gameId, false);
          useGameResultsStore.setState({ 
        syncStatus: 'SUCCESS',
        serverProblem: false,
          });

      const localData: LocalResults = {
        gameId: state.gameId,
        rounds: state.rounds,
            lastSyncedAt: Date.now(),
          };
      await ResultsStorage.saveResults(localData);
    } catch (error) {
      console.error('Failed to sync to server:', error);
      await ResultsStorage.setServerProblem(state.gameId, true);
          useGameResultsStore.setState({ 
        syncStatus: 'FAILED',
        serverProblem: true,
          });
      throw error;
    }
  }

  private async updateLocalAndServer(
    updateFn: () => Promise<void>,
    serverCall: () => Promise<void>
  ): Promise<void> {
        const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;

    await updateFn();
    await this.saveLocal();

    if (state.serverProblem) {
      return;
    }

    try {
      await serverCall();
      await ResultsStorage.setServerProblem(state.gameId, false);
      useGameResultsStore.setState({ serverProblem: false });
    } catch (error) {
      console.error('Server call failed:', error);
      await ResultsStorage.setServerProblem(state.gameId, true);
      useGameResultsStore.setState({ serverProblem: true });
    }
  }

  private async saveLocal(): Promise<void> {
    const state = this.getState();
    if (!state.gameId) return;

    const localData: LocalResults = {
            gameId: state.gameId,
      rounds: state.rounds,
    };
    await ResultsStorage.saveResults(localData);
  }

  private generateRoundData(): { matches: Match[] } | null {
    const state = this.getState();
    if (!state.game) return null;

    const roundNumber = state.rounds.length + 1;
    
    const roundGenerator = new RoundGenerator({
      rounds: state.rounds,
      game: state.game,
      roundNumber,
      fixedNumberOfSets: state.game.fixedNumberOfSets,
    });

    const matches = roundGenerator.generateRound();
    return { matches };
  }


  async initializeDefaultRound(): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit || !state.game) return;

    if (state.rounds.length > 0 && state.rounds[0].matches.length > 0) return;

    const roundData = this.generateRoundData();
    if (roundData) {
      await this.addRound();
    }
  }

  async initializePresetMatches(): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit || !state.game) return;

    const playingParticipants = state.game.participants.filter(p => p.isPlaying);
    if (playingParticipants.length !== 2 && playingParticipants.length !== 4) return;

    const hasPlayers = state.rounds.some((round) =>
      round.matches?.some((match) =>
        (match.teamA?.length > 0) || (match.teamB?.length > 0)
      )
    );

    if (hasPlayers) return;

    const roundData = this.generateRoundData();
    if (roundData) {
      await this.addRound();
    }
  }

  async cleanup() {
    useGameResultsStore.setState({
      gameId: null,
      userId: null,
      game: null,
      rounds: [],
      gameState: null,
      canEdit: false,
      loading: false,
      initialized: false,
      expandedRoundId: null,
      editingMatchId: null,
      syncStatus: 'IDLE',
      serverProblem: false,
    });
  }

  getGameResults(): { rounds: Round[] } {
    const state = this.getState();
    return { rounds: state.rounds };
  }

  async addRound(): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit || !state.game) return;

    const roundId = createId();

    const roundData = this.generateRoundData();
    if (!roundData) {
      return;
    }

    const newRoundData: Round = {
      id: roundId,
      matches: roundData.matches || [],
    };

    await this.updateLocalAndServer(
      async () => {
        useGameResultsStore.setState({
          rounds: [...state.rounds, newRoundData],
          expandedRoundId: roundId,
    });
      },
      async () => {
        await resultsApi.createRound(state.gameId!, {
          id: roundId,
        });
        for (const match of newRoundData.matches) {
          await resultsApi.createMatch(state.gameId!, roundId, { id: match.id });
          await resultsApi.updateMatch(state.gameId!, match.id, {
            teamA: match.teamA,
            teamB: match.teamB,
            sets: match.sets,
            courtId: match.courtId,
          });
        }
      }
    );
  }

  async removeRound(roundId: string, _t?: (key: string) => string): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;
    if (state.rounds.length <= 1) return;

    await this.updateLocalAndServer(
      async () => {
        const newRounds = state.rounds.filter(r => r.id !== roundId);
        
        useGameResultsStore.setState({
          rounds: newRounds,
          expandedRoundId: state.expandedRoundId === roundId ? (newRounds[0]?.id || null) : state.expandedRoundId,
        });
      },
      async () => {
        await resultsApi.deleteRound(state.gameId!, roundId);
      }
    );
  }

  async addMatch(roundId: string, matchId?: string): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;

    const round = state.rounds.find(r => r.id === roundId);
    if (!round) return;

    const newMatchId = matchId || createId();
    const fixedNumberOfSets = state.game?.fixedNumberOfSets;
    const initialSets = fixedNumberOfSets && fixedNumberOfSets > 0
      ? Array.from({ length: fixedNumberOfSets }, () => ({ teamA: 0, teamB: 0 }))
      : [{ teamA: 0, teamB: 0 }];

    const newMatch: Match = {
      id: newMatchId,
      teamA: [],
      teamB: [],
      sets: initialSets,
    };

    await this.updateLocalAndServer(
      async () => {
        const newRounds = state.rounds.map(r =>
          r.id === roundId
            ? { ...r, matches: [...r.matches, newMatch] }
            : r
        );
        useGameResultsStore.setState({
          rounds: newRounds,
          editingMatchId: newMatchId,
        });
      },
      async () => {
        await resultsApi.createMatch(state.gameId!, roundId, { id: newMatchId });
        await resultsApi.updateMatch(state.gameId!, newMatchId, {
          teamA: newMatch.teamA,
          teamB: newMatch.teamB,
          sets: newMatch.sets,
          courtId: newMatch.courtId,
        });
      }
    );
  }

  async removeMatch(roundId: string, matchId: string): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;

    const round = state.rounds.find(r => r.id === roundId);
    if (!round || round.matches.length <= 1) return;

    await this.updateLocalAndServer(
      async () => {
        const newRounds = state.rounds.map(r =>
          r.id === roundId
            ? { ...r, matches: r.matches.filter(m => m.id !== matchId) }
            : r
        );
        useGameResultsStore.setState({
          rounds: newRounds,
          editingMatchId: state.editingMatchId === matchId ? (round.matches.find(m => m.id !== matchId)?.id || null) : state.editingMatchId,
        });
      },
      async () => {
        await resultsApi.deleteMatch(state.gameId!, matchId);
      }
    );
  }

  async addPlayerToTeam(roundId: string, matchId: string, team: 'teamA' | 'teamB', playerId: string): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;

    const round = state.rounds.find(r => r.id === roundId);
    if (!round) return;

    const match = round.matches.find(m => m.id === matchId);
    if (!match) return;

    if (match[team].length >= 2) return;

    const otherTeam = team === 'teamA' ? 'teamB' : 'teamA';
    if (match[otherTeam].includes(playerId) || match[team].includes(playerId)) return;

    await this.updateLocalAndServer(
      async () => {
        const newRounds = state.rounds.map(r =>
          r.id === roundId
            ? {
                ...r,
                matches: r.matches.map(m =>
                  m.id === matchId
                    ? {
                        ...m,
                        [team]: [...m[team], playerId],
                      }
                    : m
                ),
              }
            : r
        );
        useGameResultsStore.setState({ rounds: newRounds });
      },
      async () => {
        await resultsApi.updateMatch(state.gameId!, matchId, {
          teamA: team === 'teamA' ? [...match.teamA, playerId] : match.teamA,
          teamB: team === 'teamB' ? [...match.teamB, playerId] : match.teamB,
          sets: match.sets,
          courtId: match.courtId,
        });
      }
    );
  }

  async removePlayerFromTeam(roundId: string, matchId: string, team: 'teamA' | 'teamB', playerId: string): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;

    const round = state.rounds.find(r => r.id === roundId);
    if (!round) return;

    const match = round.matches.find(m => m.id === matchId);
    if (!match) return;

    await this.updateLocalAndServer(
      async () => {
        const newRounds = state.rounds.map(r =>
          r.id === roundId
            ? {
                ...r,
                matches: r.matches.map(m =>
                  m.id === matchId
                    ? {
                        ...m,
                        [team]: m[team].filter(id => id !== playerId),
                      }
                    : m
                ),
              }
            : r
        );
        useGameResultsStore.setState({ rounds: newRounds });
      },
      async () => {
        await resultsApi.updateMatch(state.gameId!, matchId, {
          teamA: team === 'teamA' ? match.teamA.filter(id => id !== playerId) : match.teamA,
          teamB: team === 'teamB' ? match.teamB.filter(id => id !== playerId) : match.teamB,
          sets: match.sets,
          courtId: match.courtId,
        });
      }
    );
  }

  async updateMatch(roundId: string, matchId: string, match: {
    teamA: string[];
    teamB: string[];
    sets: Array<{ teamA: number; teamB: number }>;
    courtId?: string;
  }): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId) {
      throw new Error('Game not initialized');
    }
    
    if (!state.canEdit) {
      throw new Error('User does not have permission to edit results');
    }

    const round = state.rounds.find(r => r.id === roundId);
    if (!round) {
      throw new Error(`Round not found: ${roundId}`);
    }

    const existingMatch = round.matches.find(m => m.id === matchId);
    if (!existingMatch) {
      throw new Error(`Match not found: ${matchId} in round: ${roundId}`);
    }

    if (!Array.isArray(match.sets) || !Array.isArray(match.teamA) || !Array.isArray(match.teamB)) {
      throw new Error('Invalid match data structure: sets, teamA, and teamB must be arrays');
    }

    if (match.sets.some(set => typeof set.teamA !== 'number' || typeof set.teamB !== 'number' || set.teamA < 0 || set.teamB < 0)) {
      throw new Error('Invalid set data: scores must be non-negative numbers');
    }

    if (state.game) {
      const fixedNumberOfSets = state.game.fixedNumberOfSets || 0;

      for (let i = 0; i < match.sets.length; i++) {
        const set = match.sets[i];
        
        const scoreError = validateSetScores(set.teamA, set.teamB, state.game);
        if (scoreError) {
          throw new Error(scoreError);
        }

        const indexError = validateSetIndexAgainstFixed(i, fixedNumberOfSets);
        if (indexError) {
          throw new Error(indexError);
        }
      }

      if (fixedNumberOfSets > 0 && match.sets.length > fixedNumberOfSets) {
        throw new Error(`Cannot have more than ${fixedNumberOfSets} sets`);
      }
    }

    await this.updateLocalAndServer(
      async () => {
        const newRounds = state.rounds.map(r =>
          r.id === roundId
            ? {
                ...r,
                matches: r.matches.map(m =>
                  m.id === matchId
                    ? {
                        ...m,
                        teamA: match.teamA,
                        teamB: match.teamB,
                        sets: match.sets,
                        courtId: match.courtId,
                      }
                    : m
                ),
              }
            : r
        );
        useGameResultsStore.setState({ rounds: newRounds });
      },
      async () => {
        await resultsApi.updateMatch(state.gameId!, matchId, match);
      }
    );
  }

  async setMatchCourt(roundId: string, matchId: string, courtId: string): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;

    const round = state.rounds.find(r => r.id === roundId);
    if (!round) return;

    const match = round.matches.find(m => m.id === matchId);
    if (!match) return;

    await this.updateLocalAndServer(
      async () => {
        const newRounds = state.rounds.map(r =>
          r.id === roundId
            ? {
                ...r,
                matches: r.matches.map(m =>
                  m.id === matchId ? { ...m, courtId } : m
                ),
              }
            : r
        );
        useGameResultsStore.setState({ rounds: newRounds });
      },
      async () => {
        await resultsApi.updateMatch(state.gameId!, matchId, {
          teamA: match.teamA,
          teamB: match.teamB,
          sets: match.sets,
          courtId,
        });
      }
    );
  }

  setExpandedRoundId(roundId: string | null): void {
    useGameResultsStore.setState({ expandedRoundId: roundId });
  }

  setEditingMatchId(matchId: string | null): void {
    useGameResultsStore.setState({ editingMatchId: matchId });
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

    await resultsApi.resetGameResults(state.gameId);

    const emptyData: LocalResults = {
      gameId: state.gameId,
      rounds: [],
    };
    await ResultsStorage.saveResults(emptyData);
    await ResultsStorage.setServerProblem(state.gameId, false);

    useGameResultsStore.setState({ 
      rounds: [],
      serverProblem: false,
      expandedRoundId: null,
      editingMatchId: null,
    });
  }

  private convertServerResultsToState(serverResults: any, _t: (key: string) => string): { rounds: Round[] } {
    const rounds: Round[] = [];
    
    if (serverResults.rounds && Array.isArray(serverResults.rounds)) {
      serverResults.rounds.forEach((round: any) => {
        const matches: Match[] = [];
        
        if (round.matches && Array.isArray(round.matches)) {
          round.matches.forEach((match: any) => {
          const teamA: string[] = [];
          const teamB: string[] = [];
          
          if (match.teams && Array.isArray(match.teams)) {
            match.teams.forEach((team: any) => {
              const playerIds = team.playerIds || (team.players || []).map((p: any) => p.userId || p.user?.id).filter(Boolean);
              if (team.teamNumber === 1 && playerIds.length > 0) {
                teamA.push(...playerIds);
              } else if (team.teamNumber === 2 && playerIds.length > 0) {
                teamB.push(...playerIds);
              }
            });
          }
            
            const sets = match.sets && Array.isArray(match.sets) && match.sets.length > 0
              ? match.sets.map((s: any) => ({ teamA: s.teamAScore || 0, teamB: s.teamBScore || 0 }))
              : [{ teamA: 0, teamB: 0 }];
            
            let winnerTeam: 'teamA' | 'teamB' | null = null;
            if (match.winnerId) {
              const teamAId = match.teams?.find((t: any) => t.teamNumber === 1)?.id;
              const teamBId = match.teams?.find((t: any) => t.teamNumber === 2)?.id;
              if (match.winnerId === teamAId) {
                winnerTeam = 'teamA';
              } else if (match.winnerId === teamBId) {
                winnerTeam = 'teamB';
              }
            }
            
            matches.push({
              id: match.id || createId(),
              teamA,
              teamB,
              sets,
              winnerId: winnerTeam,
              courtId: match.courtId,
            });
          });
        }
        
        rounds.push({
          id: round.id || createId(),
          matches,
        });
      });
    }
    
    return { rounds };
  }

  private canUserEditResults(game: Game, userId: string): boolean {
    if (isUserGameAdminOrOwner(game, userId)) {
      return true;
    }
    
    if (game.resultsByAnyone) {
      const participant = game.participants?.find((p) => p.userId === userId);
      return !!participant;
    }
    
    return false;
  }

  private getGameState(game: Game, userId: string): GameState {
    const canEdit = this.canUserEditResults(game, userId);
    
    if (!isUserGameParticipant(game, userId)) {
      return {
        type: 'ACCESS_DENIED',
        message: 'games.results.problems.accessDenied',
        canEdit: false,
        showInputs: false,
        showClock: false,
      };
    }

    if (game.status === 'ARCHIVED') {
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

    const now = new Date();
    const startTime = new Date(game.startTime);
    
    return {
      type: 'NO_RESULTS',
      message: 'games.results.positive.noResultsYet',
      canEdit,
      showInputs: false,
      showClock: canEdit && now >= startTime,
    };
  }
}

export const GameResultsEngine = new GameResultsEngineClass();
export { useGameResultsStore };
