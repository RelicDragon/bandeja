import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Edit, Loader2, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfirmationModal } from '@/components';
import { MatchCard } from '@/components/gameResults/MatchCard';
import { ScoreEntryModal } from '@/components/gameResults';
import type { ScoreEntrySaveHandler } from '@/components/gameResults/scoreEntry/useScoreEntryState';
import { gamesApi } from '@/api';
import { resultsApi, type RoundData } from '@/api/results';
import type { BasicUser, Game } from '@/types';
import type { Match, Round } from '@/types/gameResults';
import { useAuthStore } from '@/store/authStore';
import { useGameResultsEngine } from '@/hooks/useGameResultsEngine';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import { useModalManager } from '@/hooks/useModalManager';
import { useSetEntryOperations } from '@/components/GameDetails/resultsEntry/useSetEntryOperations';
import { GameResultsEngine } from '@/services/gameResultsEngine';
import {
  claimLeagueResultsEngine,
  releaseLeagueResultsEngine,
  useLeagueResultsEngineOwner,
} from '@/services/leagueResultsEngineSession';
import { canEnterResults, getFinishText } from '@/utils/gameResultsHelpers';
import { canUserEditResults } from '@/utils/gameResults';
import { isParticipantPlaying } from '@/utils/participantStatus';
import { isSupplementalMatchSet, type MatchSetRole } from '@/utils/matchSetRole';
import {
  canFinishLeagueFixtureResults,
  canReopenLeagueFixtureResults,
  canStartLeagueFixtureResults,
  firstEditableSetIndex,
} from '@/utils/leagueGameCardResults.util';
import { resolveLeagueGameCardTeams } from '@/utils/leagueGameCardTeams.util';
import {
  convertServerResultsToRounds,
  pendingLeagueFixtureMatch,
} from '@/utils/serverResultsToRounds';
import { bracketMatchStatusFromGame } from '@/utils/leagueBracketMatchStatus';
import { useLeagueFixtureResultsEntryForGame } from '@/hooks/useLeagueFixtureResultsLive';
import { useLeagueFixtureResultsCache } from '@/services/leagueFixtureResultsCache';

interface LeagueGameCardResultsProps {
  game: Game;
  allRounds?: RoundData[] | null;
  liveRounds?: Round[] | null;
  onResultsChanged?: () => void;
}

export function LeagueGameCardResults({
  game: gameProp,
  allRounds,
  liveRounds,
  onResultsChanged,
}: LeagueGameCardResultsProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isLandscape = useIsLandscape();
  const { modal, openModal, closeModal } = useModalManager();
  const [attached, setAttached] = useState(false);
  const [localGame, setLocalGame] = useState(gameProp);
  const [busy, setBusy] = useState(false);
  const [showAnnouncedConfirm, setShowAnnouncedConfirm] = useState(false);
  const isOwner = useLeagueResultsEngineOwner(gameProp.id);
  const engineEnabled = attached && isOwner;

  const parentProvidesLive = liveRounds !== undefined;
  const selfEntry = useLeagueFixtureResultsEntryForGame(gameProp, !parentProvidesLive);
  const parentEntry = useLeagueFixtureResultsCache((s) =>
    parentProvidesLive ? s.entries[gameProp.id] : undefined,
  );
  const cacheEntry = parentProvidesLive ? parentEntry : selfEntry;

  const engine = useGameResultsEngine({
    gameId: engineEnabled ? gameProp.id : undefined,
    userId: user?.id,
    enabled: engineEnabled,
    preemptLeagueClaim: false,
  });

  useEffect(() => {
    setLocalGame(gameProp);
  }, [gameProp]);

  useEffect(() => {
    if (!isOwner && attached) {
      setAttached(false);
      closeModal();
    }
  }, [isOwner, attached, closeModal]);

  useEffect(() => {
    return () => {
      releaseLeagueResultsEngine(gameProp.id);
    };
  }, [gameProp.id]);

  const liveCacheRounds = cacheEntry?.rounds ?? null;

  const currentGame = useMemo(() => {
    const base =
      engineEnabled && engine.initialized && engine.game?.id === gameProp.id
        ? engine.game
        : localGame;
    const status = cacheEntry?.resultsStatus ?? base.resultsStatus;
    if (status === base.resultsStatus) return base;
    return { ...base, resultsStatus: status };
  }, [engineEnabled, engine.initialized, engine.game, gameProp.id, localGame, cacheEntry?.resultsStatus]);

  const snapshotRounds = useMemo(() => {
    if (liveRounds && liveRounds.length > 0) return liveRounds;
    if (liveCacheRounds && liveCacheRounds.length > 0) return liveCacheRounds;
    if (cacheEntry?.hydrated && cacheEntry.resultsStatus && cacheEntry.resultsStatus !== 'NONE') {
      return liveCacheRounds ?? [];
    }
    return convertServerResultsToRounds(allRounds ? { rounds: allRounds as never } : null);
  }, [liveRounds, liveCacheRounds, cacheEntry, allRounds]);

  const bracketStatus = useMemo(
    () => bracketMatchStatusFromGame(currentGame, { rounds: snapshotRounds }),
    [currentGame, snapshotRounds],
  );

  const nonPlayedFinal = bracketStatus === 'WALKOVER' || bracketStatus === 'FORFEIT';

  const { teamA, teamB } = useMemo(() => resolveLeagueGameCardTeams(currentGame), [currentGame]);

  const players = useMemo(() => {
    const fromParticipants = (currentGame.participants ?? [])
      .filter(isParticipantPlaying)
      .map((p) => p.user)
      .filter(Boolean) as BasicUser[];
    if (fromParticipants.length > 0) return fromParticipants;
    const seen = new Set<string>();
    const merged: BasicUser[] = [];
    for (const p of [...teamA, ...teamB]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      merged.push(p);
    }
    return merged;
  }, [currentGame.participants, teamA, teamB]);

  const engineLive =
    engineEnabled && engine.initialized && engine.game?.id === gameProp.id && engine.rounds.length > 0;

  const rounds: Round[] = engineLive
    ? engine.rounds
    : snapshotRounds.length > 0
      ? snapshotRounds
      : [
          {
            id: `pending-round-${currentGame.id}`,
            matches: [pendingLeagueFixtureMatch(currentGame.id, teamA.map((p) => p.id), teamB.map((p) => p.id))],
          },
        ];

  const canEditResults =
    engineLive &&
    engine.canEdit &&
    currentGame.resultsStatus === 'IN_PROGRESS' &&
    !nonPlayedFinal;

  const canTapScores =
    !nonPlayedFinal &&
    currentGame.resultsStatus === 'IN_PROGRESS' &&
    (canEditResults || canUserEditResults(currentGame, user));

  const showStart = canStartLeagueFixtureResults(currentGame, user, nonPlayedFinal);
  const showFinish = canFinishLeagueFixtureResults(
    currentGame,
    user,
    engineLive ? engine.rounds : rounds,
    nonPlayedFinal,
  );
  const showReopen = canReopenLeagueFixtureResults(currentGame, user, nonPlayedFinal);

  const attachEngine = useCallback(() => {
    claimLeagueResultsEngine(gameProp.id);
    setAttached(true);
  }, [gameProp.id]);

  const writeThroughCache = useCallback(
    (nextRounds: Round[], status?: Game['resultsStatus'] | null) => {
      useLeagueFixtureResultsCache.getState().applyLocalRounds(gameProp.id, nextRounds, status);
    },
    [gameProp.id],
  );

  const updateMatchWithWriteThrough = useCallback(
    async (
      roundId: string,
      matchId: string,
      match: {
        teamA: string[];
        teamB: string[];
        sets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean; role?: MatchSetRole }>;
        courtId?: string;
        metadata?: Record<string, unknown>;
      },
    ) => {
      await engine.updateMatch(roundId, matchId, match);
      const latest = GameResultsEngine.getState();
      if (latest.gameId === gameProp.id && latest.rounds.length > 0) {
        writeThroughCache(latest.rounds, latest.game?.resultsStatus ?? currentGame.resultsStatus);
      }
    },
    [engine, gameProp.id, writeThroughCache, currentGame.resultsStatus],
  );

  const onSupplementalSetAdded = useCallback(
    (roundId: string, matchId: string, setIndex: number) => {
      openModal({ type: 'set', roundId, matchId, setIndex });
    },
    [openModal],
  );

  const setOps = useSetEntryOperations({
    rounds: engineLive ? engine.rounds : rounds,
    updateMatch: updateMatchWithWriteThrough,
    onSupplementalSetAdded,
  });

  const ensureEngineForScoring = useCallback(async () => {
    if (engineLive) return true;
    if (!user?.id) return false;
    if (currentGame.resultsStatus === 'NONE') return false;
    attachEngine();
    await GameResultsEngine.initialize(gameProp.id, user.id, t, {
      force: true,
      isAdmin: user.isAdmin,
    });
    return true;
  }, [attachEngine, currentGame.resultsStatus, engineLive, gameProp.id, t, user]);

  const proceedStart = useCallback(async () => {
    if (!user?.id || busy) return;
    setBusy(true);
    setShowAnnouncedConfirm(false);
    try {
      const startRes = await resultsApi.startResultsEntryWithGeneratedRound(gameProp.id);
      const updated = startRes.data.game;
      setLocalGame(updated);
      attachEngine();
      await GameResultsEngine.initialize(gameProp.id, user.id, t, {
        force: true,
        isAdmin: user.isAdmin,
      });
      GameResultsEngine.updateGame(updated);
      writeThroughCache(GameResultsEngine.getState().rounds, updated.resultsStatus);
      useLeagueFixtureResultsCache.getState().scheduleFetch(gameProp.id, 0);
      toast.success(t('gameResults.resultsEntryStarted') || 'Results entry started');
      onResultsChanged?.();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }, [attachEngine, busy, gameProp.id, onResultsChanged, t, user, writeThroughCache]);

  const handleStart = useCallback(() => {
    if (!user?.id) return;
    if (currentGame.status === 'ANNOUNCED') {
      setShowAnnouncedConfirm(true);
      return;
    }
    void proceedStart();
  }, [currentGame.status, proceedStart, user?.id]);

  const handleFinish = useCallback(async () => {
    if (!user?.id || busy) return;
    setBusy(true);
    try {
      await engine.syncToServer();
      await resultsApi.recalculateOutcomes(gameProp.id);
      const response = await gamesApi.getById(gameProp.id);
      if (response?.data) {
        setLocalGame(response.data);
        engine.updateGame(response.data);
        writeThroughCache(GameResultsEngine.getState().rounds, response.data.resultsStatus);
      }
      toast.success(t('common.saved') || 'Results saved successfully');
      useLeagueFixtureResultsCache.getState().scheduleFetch(gameProp.id, 0);
      closeModal();
      onResultsChanged?.();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }, [busy, closeModal, engine, gameProp.id, onResultsChanged, t, user?.id, writeThroughCache]);

  const handleReopen = useCallback(async () => {
    if (!user?.id || busy) return;
    setBusy(true);
    try {
      await resultsApi.editGameResults(gameProp.id);
      const response = await gamesApi.getById(gameProp.id);
      if (response?.data) {
        setLocalGame(response.data);
        attachEngine();
        await GameResultsEngine.initialize(gameProp.id, user.id, t, {
          force: true,
          isAdmin: user.isAdmin,
        });
        GameResultsEngine.updateGame(response.data);
        writeThroughCache(GameResultsEngine.getState().rounds, response.data.resultsStatus);
      }
      toast.success(t('common.saved') || 'Results ready for editing');
      useLeagueFixtureResultsCache.getState().scheduleFetch(gameProp.id, 0);
      closeModal();
      onResultsChanged?.();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }, [attachEngine, busy, closeModal, gameProp.id, onResultsChanged, t, user, writeThroughCache]);

  const openSet = useCallback(
    async (roundId: string, match: Match, setIndex: number) => {
      const ready = await ensureEngineForScoring();
      if (!ready) return;
      openModal({ type: 'set', roundId, matchId: match.id, setIndex });
    },
    [ensureEngineForScoring, openModal],
  );

  const noopDrag = useCallback((_e: React.DragEvent) => {}, []);

  const setModal = modal?.type === 'set' ? modal : null;
  const setModalRound = setModal ? rounds.find((r) => r.id === setModal.roundId) : null;
  const setModalMatch =
    setModal && setModalRound
      ? setModalRound.matches.find((m) => m.id === setModal.matchId)
      : undefined;

  const canRemoveSet = (() => {
    if (!setModal || !setModalMatch) return false;
    const currentSet = setModalMatch.sets[setModal.setIndex];
    if (!currentSet) return false;
    if (isSupplementalMatchSet(currentSet)) return setModalMatch.sets.length > 1;
    const isLastSet = setModal.setIndex === setModalMatch.sets.length - 1;
    const isZeroZero = currentSet.teamA === 0 && currentSet.teamB === 0;
    return setModalMatch.sets.length > 1 && !(isLastSet && isZeroZero);
  })();

  return (
    <div className="space-y-2">
      {nonPlayedFinal ? (
        <div className="flex justify-center">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              bracketStatus === 'FORFEIT'
                ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-200'
            }`}
          >
            {bracketStatus === 'FORFEIT'
              ? t('gameDetails.bracketMatchForfeitLabel')
              : t('gameDetails.bracketMatchWalkoverLabel')}
          </span>
        </div>
      ) : null}

      {rounds.map((round) =>
        round.matches.map((match, matchIndex) => {
          const teamsReady = canEnterResults(match);
          const showScores =
            currentGame.resultsStatus !== 'NONE' && teamsReady && !nonPlayedFinal;
          return (
            <MatchCard
              key={match.id}
              match={match}
              matchIndex={matchIndex}
              players={players}
              isEditing={false}
              canEditResults={canTapScores}
              draggedPlayer={null}
              showHeaderEditButton={false}
              showDeleteButton={false}
              onRemoveMatch={() => {}}
              onMatchClick={() => {
                if (!canTapScores) return;
                void openSet(round.id, match, firstEditableSetIndex(match.sets));
              }}
              onCancelMatchEdit={() => {}}
              onSetClick={(setIndex) => {
                void openSet(round.id, match, setIndex);
              }}
              onRemovePlayer={() => {}}
              onDragOver={noopDrag}
              onDrop={() => {}}
              onPlayerPlaceholderClick={() => {}}
              canEnterResults={showScores}
              game={currentGame}
              roundId={round.id}
              gameId={canTapScores ? currentGame.id : undefined}
              onMatchTimerTransition={
                canEditResults
                  ? (rid, mid, action) => engine.transitionMatchTimer(rid, mid, action)
                  : undefined
              }
              onAddSupplementalSet={
                canEditResults
                  ? () => {
                      void setOps.addSupplementalSet(round.id, match.id);
                    }
                  : undefined
              }
              embedded
              forceShow
              hideMatchIndex={rounds.length === 1 && round.matches.length === 1}
            />
          );
        }),
      )}

      {showStart ? (
        <div className="flex justify-center pt-0.5">
          <button
            type="button"
            onClick={handleStart}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-emerald-500/30 transition hover:from-green-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
            {t('gameResults.startResultsEntry')}
          </button>
        </div>
      ) : null}

      {showFinish ? (
        <div className="flex justify-center pt-0.5">
          <button
            type="button"
            onClick={() => {
              void (async () => {
                const ready = await ensureEngineForScoring();
                if (!ready) return;
                openModal({ type: 'finish' });
              })();
            }}
            disabled={busy}
            className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/25 transition hover:from-emerald-600 hover:to-green-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {getFinishText(currentGame, t)}
          </button>
        </div>
      ) : null}

      {showReopen ? (
        <div className="flex justify-center pt-0.5">
          <button
            type="button"
            onClick={() => openModal({ type: 'edit' })}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-500 to-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-blue-600 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Edit size={14} />}
            {t('gameResults.editResults', { defaultValue: 'Edit results' })}
          </button>
        </div>
      ) : null}

      {setModal && setModalMatch && typeof document !== 'undefined'
        ? createPortal(
            <ScoreEntryModal
              key={`league-set-${setModal.matchId}-${setModal.setIndex}`}
              isOpen
              layout={isLandscape ? 'columns' : 'stacked'}
              match={setModalMatch}
              setIndex={setModal.setIndex}
              players={players}
              maxTotalPointsPerSet={currentGame.maxTotalPointsPerSet}
              maxPointsPerTeam={currentGame.maxPointsPerTeam}
              fixedNumberOfSets={currentGame.fixedNumberOfSets}
              ballsInGames={currentGame.ballsInGames || false}
              game={currentGame}
              onSave={((matchId, setIndex, teamAScore, teamBScore, isTieBreak, supplementalRole, options) => {
                void setOps.updateSetResult(
                  setModal.roundId,
                  matchId,
                  setIndex,
                  teamAScore,
                  teamBScore,
                  isTieBreak,
                  supplementalRole as Extract<MatchSetRole, 'EXTRA_GAMES' | 'EXTRA_BALLS'> | undefined,
                  options,
                );
              }) satisfies ScoreEntrySaveHandler}
              onRemove={(matchId: string, setIndex: number) => {
                void setOps.removeSet(setModal.roundId, matchId, setIndex);
              }}
              onClose={closeModal}
              canRemove={canRemoveSet}
            />,
            document.body,
          )
        : null}

      <ConfirmationModal
        isOpen={showAnnouncedConfirm}
        title={t('gameResults.confirmAnnouncedGame.title', { defaultValue: 'Game Not Started Yet' })}
        message={t('gameResults.confirmAnnouncedGame.message', {
          defaultValue:
            'This game is still in ANNOUNCED status. Are you sure you want to start entering results now?',
        })}
        confirmText={t('gameResults.confirmAnnouncedGame.confirm', { defaultValue: 'Yes, Continue' })}
        cancelText={t('common.cancel')}
        confirmVariant="primary"
        onConfirm={() => void proceedStart()}
        onClose={() => setShowAnnouncedConfirm(false)}
      />

      <ConfirmationModal
        isOpen={modal?.type === 'finish'}
        title={t('gameResults.finishGameTitle')}
        message={t('gameResults.finishConfirmationMessage')}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmVariant="primary"
        onConfirm={() => void handleFinish()}
        onClose={closeModal}
      />

      <ConfirmationModal
        isOpen={modal?.type === 'edit'}
        title={t('gameResults.editGameTitle')}
        message={t('gameResults.editConfirmationMessage')}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        onConfirm={() => void handleReopen()}
        onClose={closeModal}
      />
    </div>
  );
}
