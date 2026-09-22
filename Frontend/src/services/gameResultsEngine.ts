import { create } from 'zustand';
import { createId } from '@paralleldrive/cuid2';
import toast from 'react-hot-toast';
import i18n from '@/i18n/config';
import { Game, User } from '@/types';
import { Round, Match, GameState } from '@/types/gameResults';
import { ResultsStorage, LocalResults } from './resultsStorage';
import { resultsApi } from '@/api/results';
import { gamesApi } from '@/api';
import {
  canUserEditResults,
  canUserSeeGame,
  validateSetScores,
  validateSetIndexAgainstFixed,
  validateTieBreak,
} from '@/utils/gameResults';
import { getRules, initialSetsForRules } from '@/utils/scoring';
import { matchTimerApi } from '@/api/matchTimer';
import {
  applyOptimisticTimerTransition,
  isGameMatchTimerEnabled,
  type MatchTimerAction,
  type MatchTimerSnapshot,
} from '@/utils/matchTimer';
import {
  isSupplementalMatchSet,
  parseMatchSetRole,
  splitOfficialAndSupplementalSets,
  validateSupplementalSetOrder,
} from '@/utils/matchSetRole';
import { mergeRoundsPreservingIdentity } from './gameResultsMerge';
import {
  buildFivePlayerAllMatchCombinations,
  canCreateAllFivePlayerCombinations,
} from '@/utils/fivePlayerMatchCombinations';
import { maxPlayersPerTeamForGame } from '@/utils/matchFormat';
import { isPresetResultsRoster } from '@/utils/gameResultsHelpers';
import { convertServerResultsToRounds } from '@/utils/serverResultsToRounds';
import { extractApiErrorMessage } from '@/utils/extractApiErrorMessage';

function isRejectedResultsRequest(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

export type SyncStatus = 'IDLE' | 'SYNCING' | 'SUCCESS' | 'FAILED';

interface GameResultsState {
  gameId: string | null;
  userId: string | null;
  isGlobalAdmin: boolean;
  game: Game | null;
  rounds: Round[];
  gameState: GameState | null;
  canEdit: boolean;
  loading: boolean;
  initialized: boolean;
  expandedRoundIds: string[];
  editingMatchId: string | null;
  syncStatus: SyncStatus;
  serverProblem: boolean;
  resultsVersion: string | null;
}

interface GameResultsStore extends GameResultsState {
  setState: (state: Partial<GameResultsState>) => void;
}

const useGameResultsStore = create<GameResultsStore>((set) => ({
  gameId: null,
  userId: null,
  isGlobalAdmin: false,
  game: null,
  rounds: [],
  gameState: null,
  canEdit: false,
  loading: false,
  initialized: false,
  expandedRoundIds: [],
  editingMatchId: null,
  syncStatus: 'IDLE',
  serverProblem: false,
  resultsVersion: null,
  setState: (state) => set(state),
}));

class GameResultsEngineClass {
  getState() {
    return useGameResultsStore.getState();
  }

  subscribe(callback: (state: GameResultsState) => void) {
    return useGameResultsStore.subscribe(callback);
  }

  private toastIfLiveScoringCleared(
    putResponse: { success?: boolean; data?: { liveScoringCleared?: boolean } } | undefined
  ): void {
    if (putResponse?.success && putResponse.data?.liveScoringCleared) {
      toast(i18n.t('gameResults.liveScoringResetByTable'));
    }
  }

  async initialize(
    gameId: string,
    userId: string,
    t: (key: string) => string,
    options?: { force?: boolean; isAdmin?: boolean }
  ): Promise<void> {
    const force = Boolean(options?.force);
    const isGlobalAdmin = options?.isAdmin === true;
    const state = this.getState();
    if (
      !force
      && state.initialized
      && state.gameId === gameId
      && state.userId === userId
      && state.isGlobalAdmin === isGlobalAdmin
    ) {
      return;
    }

    const session = ++this.sessionEpoch;
    useGameResultsStore.setState({ loading: true, gameId, userId, isGlobalAdmin, resultsVersion: null,
      rounds: state.gameId === gameId && state.userId === userId ? state.rounds : [] });

    try {
      const [gameResponse, localResults, serverProblem] = await Promise.all([
        gamesApi.getById(gameId).catch((error: any) => {
          // Silently handle 401 errors (unauthorized) - expected when user is not authenticated
          if (error?.response?.status === 401) {
            return null;
          }
          return null;
        }),
        ResultsStorage.getResults(gameId),
        ResultsStorage.getServerProblem(gameId),
      ]);

      if (session !== this.sessionEpoch) return;
      if (!gameResponse) {
        // If no game response (e.g., 401), set initialized to false and return
        useGameResultsStore.setState({ 
          initialized: false, 
          loading: false,
          game: null,
          canEdit: false,
        });
        return;
      }

      const game = gameResponse.data;
      const viewer = { id: userId, isAdmin: isGlobalAdmin };
      const canEdit = canUserEditResults(game, viewer);
      const gameState = this.getGameState(game, viewer);

      useGameResultsStore.setState({ game, canEdit, gameState, serverProblem });

      if (serverProblem && localResults?.rounds) {
        useGameResultsStore.setState({ rounds: localResults.rounds, resultsVersion: localResults.resultsVersion ?? null,
          initialized: true, loading: false, expandedRoundIds: localResults.rounds.slice(-1).map(r => r.id) });
        return;
      }
      const resultsStatus = game.resultsStatus || 'NONE';
      
      if (resultsStatus === 'NONE' && canEdit) {
        const emptyResults = await resultsApi.getGameResults(gameId);
        if (session !== this.sessionEpoch) return;
        const resultsVersion = emptyResults?.data?.resultsVersion ?? null;
        const emptyData: LocalResults = {
          gameId,
          rounds: [],
          resultsVersion,
        };
        await ResultsStorage.saveResults(emptyData);
        useGameResultsStore.setState({ 
          gameId,
          userId,
          rounds: [], 
          resultsVersion,
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
          if (session !== this.sessionEpoch) return;
          useGameResultsStore.setState({ resultsVersion: resultsResponse?.data?.resultsVersion ?? null });
          if (resultsResponse?.data) {
            const serverRounds = this.convertServerResultsToState(resultsResponse.data, t).rounds;
            // If we have existing rounds in store for this game, prefer them over server
            // This prevents overwriting rounds that were just added locally (skip when force-reloading after remote edits).
            if (hasExistingRounds && !force) {
              rounds = currentStoreState.rounds;
              // Still save to local storage for consistency
              const localData: LocalResults = {
                gameId,
                rounds,
                lastSyncedAt: Date.now(),
              };
              await ResultsStorage.saveResults({ ...localData, resultsVersion: resultsResponse.data.resultsVersion });
            } else {
              rounds = serverRounds;
              const localData: LocalResults = {
                gameId,
                rounds,
                lastSyncedAt: Date.now(),
              };
              await ResultsStorage.saveResults({ ...localData, resultsVersion: resultsResponse.data.resultsVersion });
            }
            await ResultsStorage.setServerProblem(gameId, false);
            useGameResultsStore.setState({ serverProblem: false });
          } else if (hasExistingRounds) {
            // Server returned no data but we have rounds in store, use store
            rounds = currentStoreState.rounds;
          }
        } catch (error) {
          console.warn('Failed to load server results, using local:', error);
          if (hasExistingRounds && !force) {
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
        !force && latestStoreState.gameId === gameId && latestStoreState.rounds.length > 0;

      const finalRounds = shouldKeepLatestRounds ? latestStoreState.rounds : rounds;
      const lastRoundId = finalRounds.length > 0 ? finalRounds[finalRounds.length - 1].id : null;
      const finalExpandedRoundIds = lastRoundId ? [lastRoundId] : [];

      if (session !== this.sessionEpoch) return;
      useGameResultsStore.setState({
        gameId,
        userId,
        rounds: finalRounds,
        initialized: true,
        loading: false,
        expandedRoundIds: finalExpandedRoundIds,
      });
    } catch (error) {
      console.error('Failed to initialize game results:', error);
      useGameResultsStore.setState({ loading: false });
      throw error;
          }
  }

  private serverWrites: Promise<unknown> = Promise.resolve();
  private sessionEpoch = 0;
  private localMutationEpoch = 0;
  private pendingLocalMutations = 0;
  private remoteReloadEpoch = 0;

  beginLocalMutation(): number {
    this.pendingLocalMutations += 1;
    this.localMutationEpoch += 1;
    return this.localMutationEpoch;
  }

  endLocalMutation(): void {
    this.pendingLocalMutations = Math.max(0, this.pendingLocalMutations - 1);
  }

  async reloadFromRemote(): Promise<void> {
    const startState = this.getState();
    if (!startState.gameId || !startState.userId || !startState.initialized) return;
    // A successful read does not acknowledge local scores that failed to save.
    if (startState.serverProblem) return;
    if (this.pendingLocalMutations > 0) return;

    const gameId = startState.gameId;
    const userId = startState.userId;
    const mutationAtStart = this.localMutationEpoch;
    this.remoteReloadEpoch += 1;
    const reloadToken = this.remoteReloadEpoch;

    try {
      const [gameResponse, resultsResponse] = await Promise.all([
        gamesApi.getById(gameId).catch((error: any) => {
          if (error?.response?.status === 401) return null;
          console.warn('Failed to reload game for live update:', error);
          return null;
        }),
        resultsApi.getGameResults(gameId).catch((error: any) => {
          console.warn('Failed to reload server results for live update:', error);
          return null;
        }),
      ]);

      const liveState = this.getState();
      if (liveState.gameId !== gameId || liveState.userId !== userId) return;
      if (this.pendingLocalMutations > 0) return;
      if (this.localMutationEpoch !== mutationAtStart) return;
      if (this.remoteReloadEpoch !== reloadToken) return;

      const patch: Partial<GameResultsState> = {};

      if (gameResponse?.data) {
        const game = gameResponse.data;
        patch.game = game;
        const viewer = { id: userId, isAdmin: liveState.isGlobalAdmin };
        patch.canEdit = canUserEditResults(game, viewer);
        patch.gameState = this.getGameState(game, viewer);
      }

      if (resultsResponse?.data) {
        patch.resultsVersion = resultsResponse.data.resultsVersion ?? null;
        const serverRounds = this.convertServerResultsToState(resultsResponse.data, (k) => k).rounds;
        const merged = mergeRoundsPreservingIdentity(liveState.rounds, serverRounds);

        if (merged !== liveState.rounds) {
          patch.rounds = merged;
        }

        const localData: LocalResults = {
          gameId,
          rounds: merged,
          resultsVersion: patch.resultsVersion,
          lastSyncedAt: Date.now(),
        };
        await ResultsStorage.saveResults(localData);
        await ResultsStorage.setServerProblem(gameId, false);
        if (liveState.serverProblem) patch.serverProblem = false;
      }

      if (Object.keys(patch).length > 0) {
        if (this.getState().gameId !== gameId || this.getState().userId !== userId) return;
        if (this.pendingLocalMutations > 0) return;
        if (this.localMutationEpoch !== mutationAtStart) return;
        if (this.remoteReloadEpoch !== reloadToken) return;
        useGameResultsStore.setState(patch);
      }
    } catch (error) {
      console.error('Failed to reload from remote:', error);
    }
  }

  async syncToServer(): Promise<void> {
    await this.serverWrites;
    if (this.pendingLocalMutations > 0) throw new Error(i18n.t('errors.syncPending'));
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;
    if (!state.serverProblem) {
      await this.reloadFromRemote();
      return;
    }
    if (state.syncStatus === 'SYNCING') throw new Error(i18n.t('errors.syncPending'));
    const session = this.sessionEpoch;
    const mutation = this.localMutationEpoch;
    useGameResultsStore.setState({ syncStatus: 'SYNCING' });
    try {
      const result = await resultsApi.syncResults(state.gameId, state.rounds, state.resultsVersion);
      if (session !== this.sessionEpoch) return;
      if (!result?.data?.rounds || !result.data.resultsVersion) throw new Error('Missing sync acknowledgement');
      useGameResultsStore.setState({ resultsVersion: result.data.resultsVersion });
      if (mutation !== this.localMutationEpoch) throw new Error(i18n.t('errors.syncPending'));
      const rounds = this.convertServerResultsToState(result.data, k => k).rounds;
      await ResultsStorage.saveResults({ gameId: state.gameId, rounds, resultsVersion: result.data.resultsVersion, lastSyncedAt: Date.now() });
      await ResultsStorage.setServerProblem(state.gameId, false);
      if (session !== this.sessionEpoch) return;
      useGameResultsStore.setState({ rounds, serverProblem: false, syncStatus: 'SUCCESS' });
    } catch (error) {
      if (session === this.sessionEpoch) {
        useGameResultsStore.setState({ syncStatus: 'FAILED', serverProblem: true });
        await ResultsStorage.setServerProblem(state.gameId!, true);
      }
      throw error;
    }
  }

  private async persistMatch(gameId: string, matchId: string, input: Parameters<typeof resultsApi.updateMatch>[2]) {
    const session = this.sessionEpoch;
    const match = this.getState().rounds.flatMap(r => r.matches).find(m => m.id === matchId);
    const response = await resultsApi.updateMatch(gameId, matchId, { ...input, baseVersion: match?.resultsVersion });
    if (session === this.sessionEpoch && response.data?.resultsVersion) {
      useGameResultsStore.setState(state => ({ rounds: state.rounds.map(r => ({ ...r,
        matches: r.matches.map(m => m.id === matchId ? { ...m, resultsVersion: response.data.resultsVersion } : m),
      })) }));
    }
    return response;
  }

  private async updateLocalAndServer(
    updateFn: () => Promise<void>,
    serverCall: () => Promise<void>
  ): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;

    const mutation = this.beginLocalMutation();
    const session = this.sessionEpoch;
    const localUpdate = updateFn();
    const write = this.serverWrites.then(async () => {
      await localUpdate;
      if (session !== this.sessionEpoch) return;
      await this.saveLocal();
      if (this.getState().serverProblem) return;

      try {
        await serverCall();
      } catch (error) {
        console.error('Server call failed:', error);
        const current = this.getState();
        if (session !== this.sessionEpoch || current.gameId !== state.gameId || current.userId !== state.userId) return;

        if (isRejectedResultsRequest(error)) {
          toast.error(extractApiErrorMessage(error, i18n.t));
          // Only roll back our own edit; overlapping edits must remain recoverable.
          if (this.localMutationEpoch === mutation && this.pendingLocalMutations === 1) {
            useGameResultsStore.setState({ rounds: state.rounds });
            await this.saveLocal();
            return;
          }
        }
        useGameResultsStore.setState({ serverProblem: true });
        await ResultsStorage.setServerProblem(state.gameId!, true);
      }
    });
    this.serverWrites = write.catch(() => undefined);
    try {
      await write;
    } finally {
      this.endLocalMutation();
      if (session === this.sessionEpoch && this.pendingLocalMutations === 0 && !this.getState().serverProblem) {
        await this.reloadFromRemote();
      }
    }
  }

  private async saveLocal(): Promise<void> {
    const state = this.getState();
    if (!state.gameId) return;

    const localData: LocalResults = {
            gameId: state.gameId,
      rounds: state.rounds,
      resultsVersion: state.resultsVersion,
    };
    await ResultsStorage.saveResults(localData);
  }

  async initializeDefaultRound(): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit || !state.game) return;
    if (state.rounds.length > 0) return;
    await this.addRound();
  }

  async initializePresetMatches(): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit || !state.game) return;
    if (state.rounds.length > 0) return;

    const playingParticipants = state.game.participants.filter(p => p.status === 'PLAYING');
    if (!isPresetResultsRoster(playingParticipants.length)) return;

    await this.addRound();
  }

  async createAllFivePlayerCombinations(playerIds: string[]): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit || !state.game) return;
    if (
      !canCreateAllFivePlayerCombinations(
        playerIds.length,
        Boolean(state.game.hasFixedTeams),
        state.rounds,
      )
    ) {
      return;
    }

    const combinations = buildFivePlayerAllMatchCombinations(playerIds);
    if (combinations.length === 0) return;

    const rules = getRules(state.game);
    const initialSets = initialSetsForRules(rules);
    const sortedCourts = [...(state.game.gameCourts ?? [])].sort((a, b) => a.order - b.order);
    const roundId = state.rounds.length === 1 ? state.rounds[0].id : createId();

    const matches: Match[] = combinations.map((combo, index) => ({
      id: createId(),
      teamA: [...combo.teamA],
      teamB: [...combo.teamB],
      sets: initialSets.map((set) => ({ ...set })),
      courtId: sortedCourts[index % sortedCourts.length]?.courtId,
    }));

    useGameResultsStore.setState({
      rounds: [{ id: roundId, matches }],
      expandedRoundIds: [roundId],
      editingMatchId: null,
    });

    useGameResultsStore.setState({ serverProblem: true });
    await ResultsStorage.setServerProblem(state.gameId!, true);
    await this.saveLocal();
    await this.syncToServer();
  }

  async cleanup() {
    this.sessionEpoch += 1;
    this.remoteReloadEpoch += 1;
    useGameResultsStore.setState({
      gameId: null,
      userId: null,
      isGlobalAdmin: false,
      game: null,
      rounds: [],
      gameState: null,
      canEdit: false,
      loading: false,
      initialized: false,
      expandedRoundIds: [],
      editingMatchId: null,
      syncStatus: 'IDLE',
      serverProblem: false,
      resultsVersion: null,
    });
  }

  getGameResults(): { rounds: Round[] } {
    const state = this.getState();
    return { rounds: state.rounds };
  }

  async addRound(): Promise<void> {
    await this.serverWrites;
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit || !state.game) return;
    if (state.serverProblem) throw new Error(i18n.t('errors.syncRequired'));
    const session = this.sessionEpoch;
    this.beginLocalMutation();

    try {
      const res = await resultsApi.generateRound(state.gameId);
      if (session !== this.sessionEpoch) return;
      const roundPayload = res.data?.round;
      if (!roundPayload) {
        throw new Error('No round in generate response');
      }
      const converted = this.convertServerResultsToState({ rounds: [roundPayload as any] }, (k) => k).rounds[0];
      if (!converted) {
        throw new Error('Failed to parse generated round');
      }

      useGameResultsStore.setState(current => ({
        rounds: [...current.rounds.filter(r => r.id !== converted.id), converted],
        expandedRoundIds: [converted.id],
      }));
      await this.saveLocal();
    } catch (error) {
      console.error('Failed to generate round:', error);
      if (session === this.sessionEpoch && !isRejectedResultsRequest(error)) {
        await ResultsStorage.setServerProblem(state.gameId!, true);
        useGameResultsStore.setState({ serverProblem: true });
      }
      throw error;
    } finally {
      this.endLocalMutation();
      if (session === this.sessionEpoch && !this.getState().serverProblem) await this.reloadFromRemote();
    }
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
          expandedRoundIds: state.expandedRoundIds.filter(id => id !== roundId),
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
    const rules = getRules(state.game);
    const initialSets = initialSetsForRules(rules);

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
        const created = await resultsApi.getGameResults(state.gameId!);
        const fresh = convertServerResultsToRounds(created.data).flatMap(r => r.matches).find(m => m.id === newMatchId);
        useGameResultsStore.setState(current => ({ rounds: current.rounds.map(r => ({ ...r, matches: r.matches.map(m => m.id === newMatchId ? { ...m, resultsVersion: fresh?.resultsVersion } : m) })) }));
        const putRes = await this.persistMatch(state.gameId!, newMatchId, {
          teamA: newMatch.teamA,
          teamB: newMatch.teamB,
          sets: newMatch.sets,
          courtId: newMatch.courtId,
        });
        this.toastIfLiveScoringCleared(putRes);
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
    if (!match || !state.game) return;

    const participantCount = state.game.participants.filter(p => p.status === 'PLAYING').length;
    const maxPerTeam = maxPlayersPerTeamForGame(state.game, participantCount);
    if (match[team].length >= maxPerTeam) return;

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
        const putRes = await this.persistMatch(state.gameId!, matchId, {
          teamA: team === 'teamA' ? [...match.teamA, playerId] : match.teamA,
          teamB: team === 'teamB' ? [...match.teamB, playerId] : match.teamB,
          sets: match.sets,
          courtId: match.courtId,
        });
        this.toastIfLiveScoringCleared(putRes);
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
        const putRes = await this.persistMatch(state.gameId!, matchId, {
          teamA: team === 'teamA' ? match.teamA.filter(id => id !== playerId) : match.teamA,
          teamB: team === 'teamB' ? match.teamB.filter(id => id !== playerId) : match.teamB,
          sets: match.sets,
          courtId: match.courtId,
        });
        this.toastIfLiveScoringCleared(putRes);
      }
    );
  }

  async updateMatch(roundId: string, matchId: string, match: {
    teamA: string[];
    teamB: string[];
    sets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean; role?: import('@/utils/matchSetRole').MatchSetRole }>;
    courtId?: string;
    metadata?: Record<string, unknown>;
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
      const orderErr = validateSupplementalSetOrder(match.sets.map((s) => parseMatchSetRole(s.role)));
      if (orderErr) {
        throw new Error(orderErr);
      }

      const { official, supplemental } = splitOfficialAndSupplementalSets(match.sets);
      if (supplemental.some((s) => s.isTieBreak)) {
        throw new Error('Extra sets cannot be tie-breaks');
      }

      if (fixedNumberOfSets > 0 && official.length > fixedNumberOfSets) {
        throw new Error(`Cannot have more than ${fixedNumberOfSets} official sets`);
      }

      for (let i = 0; i < match.sets.length; i++) {
        const set = match.sets[i];
        if (isSupplementalMatchSet(set)) {
          if (set.teamA < 0 || set.teamB < 0 || set.teamA > 9999 || set.teamB > 9999) {
            throw new Error('Invalid extra set scores');
          }
          continue;
        }

        const scoreError = validateSetScores(set.teamA, set.teamB, state.game);
        if (scoreError) {
          throw new Error(scoreError);
        }

        const officialIndex = official.indexOf(set);
        const indexForFixed = officialIndex >= 0 ? officialIndex : i;
        const indexError = validateSetIndexAgainstFixed(indexForFixed, fixedNumberOfSets);
        if (indexError) {
          throw new Error(indexError);
        }

        if (set.isTieBreak) {
          const tieBreakError = validateTieBreak(
            indexForFixed,
            official,
            fixedNumberOfSets,
            set.isTieBreak,
            state.game.ballsInGames || false
          );
          if (tieBreakError) {
            throw new Error(tieBreakError);
          }
        }
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
                        ...(match.metadata !== undefined ? { metadata: match.metadata } : {}),
                      }
                    : m
                ),
              }
            : r
        );
        useGameResultsStore.setState({ rounds: newRounds });
      },
      async () => {
        const putRes = await this.persistMatch(state.gameId!, matchId, match);
        this.toastIfLiveScoringCleared(putRes);
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
        const putRes = await this.persistMatch(state.gameId!, matchId, {
          teamA: match.teamA,
          teamB: match.teamB,
          sets: match.sets,
          courtId,
        });
        this.toastIfLiveScoringCleared(putRes);
      }
    );
  }

  setExpandedRoundIds(ids: string[]): void {
    useGameResultsStore.setState({ expandedRoundIds: ids });
  }

  toggleRoundExpanded(roundId: string): void {
    useGameResultsStore.setState((state) => {
      const has = state.expandedRoundIds.includes(roundId);
      const next = has
        ? state.expandedRoundIds.filter(id => id !== roundId)
        : [...state.expandedRoundIds, roundId];
      return { expandedRoundIds: next };
    });
  }

  setEditingMatchId(matchId: string | null): void {
    useGameResultsStore.setState({ editingMatchId: matchId });
  }

  updateGame(game: Game): void {
    const state = this.getState();
    if (!state.userId) return;
    
    const viewer = { id: state.userId, isAdmin: state.isGlobalAdmin };
    const canEdit = canUserEditResults(game, viewer);
    const gameState = this.getGameState(game, viewer);
    
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
      expandedRoundIds: [],
      editingMatchId: null,
    });
  }

  private convertServerResultsToState(serverResults: any, _t: (key: string) => string): { rounds: Round[] } {
    return { rounds: convertServerResultsToRounds(serverResults) };
  }

  applyRemoteMatchTimerSnapshot(gameId: string, matchId: string, snapshot: MatchTimerSnapshot): void {
    const state = this.getState();
    if (state.gameId !== gameId) return;
    let found = false;
    const newRounds = state.rounds.map((r) => ({
      ...r,
      matches: r.matches.map((m) => {
        if (m.id !== matchId) return m;
        found = true;
        return { ...m, timer: snapshot };
      }),
    }));
    if (!found) return;
    useGameResultsStore.setState({ rounds: newRounds });
    void this.saveLocal();
  }

  async refreshMatchTimerSnapshot(matchId: string): Promise<void> {
    const state = this.getState();
    if (!state.gameId) return;
    try {
      const res = await matchTimerApi.getSnapshot(state.gameId, matchId);
      const snap = res.data?.snapshot;
      if (snap) this.applyRemoteMatchTimerSnapshot(state.gameId, matchId, snap);
    } catch {
      /* ignore */
    }
  }

  async transitionMatchTimer(roundId: string, matchId: string, action: MatchTimerAction): Promise<void> {
    const state = this.getState();
    if (!state.gameId || !state.userId || !state.canEdit) return;
    const game = state.game;
    if (!game || !isGameMatchTimerEnabled(game)) return;

    const round = state.rounds.find((r) => r.id === roundId);
    const match = round?.matches.find((m) => m.id === matchId);
    if (!round || !match) return;

    const cap = game.matchTimedCapMinutes ?? 15;
    const prevRounds = state.rounds;
    const optimistic = applyOptimisticTimerTransition(match.timer, action, cap, Date.now());
    const optimisticRounds = prevRounds.map((r) =>
      r.id !== roundId
        ? r
        : {
            ...r,
            matches: r.matches.map((m) => (m.id !== matchId ? m : { ...m, timer: optimistic })),
          }
    );
    useGameResultsStore.setState({ rounds: optimisticRounds });
    await this.saveLocal();

    if (state.serverProblem) return;

    try {
      const res = await matchTimerApi.transition(state.gameId, matchId, action);
      const snap = res.data?.snapshot;
      if (snap) {
        const latest = useGameResultsStore.getState().rounds;
        const merged = latest.map((r) =>
          r.id !== roundId
            ? r
            : {
                ...r,
                matches: r.matches.map((m) => (m.id !== matchId ? m : { ...m, timer: snap })),
              }
        );
        useGameResultsStore.setState({ rounds: merged, serverProblem: false });
        await ResultsStorage.setServerProblem(state.gameId, false);
        await this.saveLocal();
      }
    } catch (e) {
      console.error('Match timer transition failed:', e);
      const serverProblem = this.getState().serverProblem || !isRejectedResultsRequest(e);
      if (isRejectedResultsRequest(e)) {
        toast.error(extractApiErrorMessage(e, i18n.t));
      }
      useGameResultsStore.setState({ rounds: prevRounds, serverProblem });
      await ResultsStorage.setServerProblem(state.gameId, serverProblem);
      await this.saveLocal();
    }
  }

  private getGameState(game: Game, viewer: Pick<User, 'id' | 'isAdmin'>): GameState {
    const canEdit = canUserEditResults(game, viewer);

    if (!canUserSeeGame(game, viewer)) {
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

    const playingParticipants = game.participants?.filter((p) => p.status === 'PLAYING') || [];
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
