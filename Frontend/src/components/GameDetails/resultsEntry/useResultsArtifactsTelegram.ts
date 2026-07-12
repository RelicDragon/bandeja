import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { gamesApi } from '@/api';
import { Game } from '@/types';
import type { Round } from '@/types/gameResults';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useGamePhotosStore } from '@/store/gamePhotosStore';
import {
  canAccessResultsTelegramActions,
  getGameOwnerIsPremium,
  getPhotoGenerationsMax,
  hasCachedResultsSummary,
  hasEnteredResultsForTelegram,
  hasGamePhotoForTelegram,
  isAnyArtifactGenerating,
  mergeGameResultsArtifactsFields,
} from '@/utils/gameResultsArtifacts.util';
import { canManageGamePhotos } from '@shared/gamePhotos/permissions';

interface UseResultsArtifactsTelegramParams {
  currentGame: Game | null;
  rounds: Round[];
  user: { id: string; isAdmin?: boolean } | null;
  onGameUpdate: (game: Game) => void;
}

export function useResultsArtifactsTelegram({
  currentGame,
  rounds,
  user,
  onGameUpdate,
}: UseResultsArtifactsTelegramParams) {
  const { t } = useTranslation();
  const [isSendingToTelegram, setIsSendingToTelegram] = useState(false);
  const [isStartingArtifactGeneration, setIsStartingArtifactGeneration] = useState(false);
  const [isTelegramSummaryModalOpen, setIsTelegramSummaryModalOpen] = useState(false);
  const [telegramSummary, setTelegramSummary] = useState('');
  const [showResendConfirm, setShowResendConfirm] = useState(false);
  const [showNoPhotosConfirm, setShowNoPhotosConfirm] = useState(false);
  const [isResettingTelegram, setIsResettingTelegram] = useState(false);

  const artifactGenerationInFlightRef = useRef(false);
  const wasArtifactGeneratingRef = useRef(false);
  const currentGameRef = useRef(currentGame);
  currentGameRef.current = currentGame;

  const lastGamePhotoAdded = useSocketEventsStore((s) => s.lastGamePhotoAdded);
  const lastGameUpdate = useSocketEventsStore((s) => s.lastGameUpdate);
  const loadGamePhotos = useGamePhotosStore((s) => s.loadGamePhotos);

  const hasResultsEntered = useMemo(() => {
    if (currentGame && hasEnteredResultsForTelegram(currentGame)) return true;
    if (!rounds || rounds.length === 0) return false;
    return rounds.some((round) =>
      round.matches?.some((match) =>
        match.sets?.some((set) => set.teamA > 0 || set.teamB > 0)
      )
    );
  }, [currentGame, rounds]);

  const canUseResultsTelegram = useMemo(
    () => canAccessResultsTelegramActions(currentGame, user),
    [currentGame, user]
  );

  const canManagePhotos = useMemo(
    () => (currentGame && user ? canManageGamePhotos(currentGame, { id: user.id, isAdmin: user.isAdmin }) : false),
    [currentGame, user]
  );

  const hasPhotosForTelegramPost = useMemo(
    () => (currentGame ? hasGamePhotoForTelegram(currentGame) : false),
    [currentGame]
  );

  const hasCachedSummary = useMemo(
    () => hasCachedResultsSummary(currentGame?.resultsSummaryText),
    [currentGame?.resultsSummaryText]
  );

  const isArtifactsGenerating = useMemo(
    () =>
      isAnyArtifactGenerating(currentGame?.resultsArtifacts, {
        hasSummaryText: hasCachedSummary,
        hasGamePhoto: hasPhotosForTelegramPost,
      }),
    [currentGame?.resultsArtifacts, hasCachedSummary, hasPhotosForTelegramPost]
  );

  const showSendToTelegramButton = useMemo(() => {
    if (!currentGame || !hasResultsEntered || !canUseResultsTelegram) return false;
    return !currentGame.resultsSentToTelegram;
  }, [currentGame, hasResultsEntered, canUseResultsTelegram]);

  const showSentToTelegramHint = useMemo(() => {
    if (!currentGame || !hasResultsEntered || !canUseResultsTelegram) return false;
    return Boolean(currentGame.resultsSentToTelegram);
  }, [currentGame, hasResultsEntered, canUseResultsTelegram]);

  const photoGenerationsMaxFallback = useMemo(
    () => getPhotoGenerationsMax(getGameOwnerIsPremium(currentGame)),
    [currentGame]
  );

  const applyArtifactsPollPayload = useCallback(
    (
      artifacts: NonNullable<Game['resultsArtifacts']>,
      summaryText?: string | null,
      photoFields?: { photosCount?: number; mainPhotoId?: string | null }
    ) => {
      const game = currentGameRef.current;
      if (!game) return;
      onGameUpdate(
        mergeGameResultsArtifactsFields(game, {
          ...game,
          resultsArtifacts: artifacts,
          ...(summaryText !== undefined ? { resultsSummaryText: summaryText } : {}),
          ...(photoFields?.photosCount !== undefined
            ? { photosCount: photoFields.photosCount }
            : {}),
          ...(photoFields?.mainPhotoId !== undefined
            ? { mainPhotoId: photoFields.mainPhotoId }
            : {}),
        })
      );
    },
    [onGameUpdate]
  );

  const applyArtifactsStatusPayload = useCallback(
    (payload: {
      artifacts: NonNullable<Game['resultsArtifacts']>;
      resultsSummaryText?: string | null;
    }) => {
      applyArtifactsPollPayload(payload.artifacts, payload.resultsSummaryText);
    },
    [applyArtifactsPollPayload]
  );

  const refreshGamePhotosFromServer = useCallback(
    async (gameId: string) => {
      await loadGamePhotos(gameId).catch(() => {});
      try {
        const response = await gamesApi.getById(gameId);
        const game = currentGameRef.current;
        if (response.data && game?.id === gameId) {
          onGameUpdate(mergeGameResultsArtifactsFields(game, response.data));
        }
      } catch {
        // ignore refresh errors
      }
    },
    [loadGamePhotos, onGameUpdate]
  );

  useEffect(() => {
    if (!currentGame?.id || currentGame.resultsStatus !== 'FINAL') return;
    void loadGamePhotos(currentGame.id).catch(() => {});
  }, [currentGame?.id, currentGame?.resultsStatus, loadGamePhotos]);

  useEffect(() => {
    if (!currentGame?.id || !lastGamePhotoAdded || lastGamePhotoAdded.gameId !== currentGame.id) {
      return;
    }
    void refreshGamePhotosFromServer(currentGame.id);
  }, [currentGame?.id, lastGamePhotoAdded, refreshGamePhotosFromServer]);

  useEffect(() => {
    if (!currentGame?.id || !lastGameUpdate || lastGameUpdate.gameId !== currentGame.id) return;
    const updated = lastGameUpdate.game;
    const prev = currentGameRef.current;
    if (!prev) return;
    const photosChanged =
      (updated.photosCount ?? 0) !== (prev.photosCount ?? 0) ||
      updated.mainPhotoId !== prev.mainPhotoId ||
      (updated.mainPhoto?.id ?? null) !== (prev.mainPhoto?.id ?? null);
    if (photosChanged) {
      void refreshGamePhotosFromServer(currentGame.id);
    }
  }, [currentGame?.id, lastGameUpdate, refreshGamePhotosFromServer]);

  useEffect(() => {
    const shouldPoll = isArtifactsGenerating || isStartingArtifactGeneration;
    if (!currentGame?.id || !shouldPoll) return;

    const gameId = currentGame.id;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await gamesApi.getResultsArtifactsStatus(gameId);
        if (cancelled || !response.data) return;
        applyArtifactsStatusPayload(response.data);

        const stillGenerating = isAnyArtifactGenerating(response.data.artifacts, {
          hasSummaryText: hasCachedResultsSummary(response.data.resultsSummaryText),
        });
        if (wasArtifactGeneratingRef.current && !stillGenerating) {
          void refreshGamePhotosFromServer(gameId);
        }
        wasArtifactGeneratingRef.current = stillGenerating;
      } catch {
        // ignore polling errors
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    currentGame?.id,
    isArtifactsGenerating,
    isStartingArtifactGeneration,
    applyArtifactsStatusPayload,
    refreshGamePhotosFromServer,
  ]);

  const startArtifactGeneration = async (
    request: (gameId: string) => ReturnType<typeof gamesApi.prepareResultsArtifactPhoto>
  ) => {
    if (
      !currentGame ||
      artifactGenerationInFlightRef.current ||
      isStartingArtifactGeneration ||
      isArtifactsGenerating
    ) {
      return;
    }

    artifactGenerationInFlightRef.current = true;
    setIsStartingArtifactGeneration(true);
    try {
      const response = await request(currentGame.id);
      const payload = response.data;
      if (payload?.resultsArtifacts) {
        applyArtifactsPollPayload(payload.resultsArtifacts, payload.resultsSummaryText, {
          photosCount: payload.photosCount,
          mainPhotoId: payload.mainPhotoId,
        });
      }
      try {
        const status = await gamesApi.getResultsArtifactsStatus(currentGame.id);
        if (status.data) {
          applyArtifactsStatusPayload(status.data);
        }
      } catch {
        // follow-up poll will retry
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        t('gameResults.prepareResultsFailed');
      toast.error(errorMessage);
    } finally {
      artifactGenerationInFlightRef.current = false;
      setIsStartingArtifactGeneration(false);
    }
  };

  const handleGenerateResultsPhoto = () =>
    void startArtifactGeneration(gamesApi.prepareResultsArtifactPhoto);

  const openTelegramSummaryModal = useCallback(async () => {
    const game = currentGameRef.current;
    if (!game || isSendingToTelegram || isArtifactsGenerating || isStartingArtifactGeneration) {
      return;
    }

    const cachedSummary = game.resultsSummaryText?.trim();
    if (cachedSummary) {
      setTelegramSummary(cachedSummary);
      setIsTelegramSummaryModalOpen(true);
      return;
    }

    setIsSendingToTelegram(true);
    try {
      const response = await gamesApi.prepareTelegramSummary(game.id);
      if (response.data?.summary) {
        setTelegramSummary(response.data.summary);
        setIsTelegramSummaryModalOpen(true);
      } else {
        throw new Error('No summary received');
      }
    } catch (error: unknown) {
      console.error('Failed to prepare Telegram summary:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        t('gameResults.prepareTextFailed') ||
        'Failed to prepare text';
      toast.error(errorMessage);
    } finally {
      setIsSendingToTelegram(false);
    }
  }, [isSendingToTelegram, isArtifactsGenerating, isStartingArtifactGeneration, t]);

  const handleSendToTelegram = () => {
    if (!currentGame || isSendingToTelegram) return;
    if (currentGame.resultsStatus !== 'FINAL') {
      toast.error(
        t('gameResults.sendToTelegramFailed') ||
          'Game must be finalized before sending results to Telegram'
      );
      return;
    }
    if (!hasPhotosForTelegramPost) {
      setShowNoPhotosConfirm(true);
      return;
    }
    void openTelegramSummaryModal();
  };

  const handleConfirmNoPhotos = () => {
    setShowNoPhotosConfirm(false);
    void openTelegramSummaryModal();
  };

  const handleSendSummaryToTelegram = async (summaryText: string) => {
    const game = currentGameRef.current;
    if (!game) return;

    await gamesApi.sendResultsToTelegram(game.id, summaryText);
    setIsTelegramSummaryModalOpen(false);

    onGameUpdate({
      ...game,
      resultsSentToTelegram: true,
    });
  };

  const handleResendConfirm = async () => {
    const game = currentGameRef.current;
    if (!game) return;
    setIsResettingTelegram(true);
    try {
      await gamesApi.resetTelegramResultsSent(game.id);
      const updated = { ...game, resultsSentToTelegram: false };
      onGameUpdate(updated);
      setShowResendConfirm(false);
      const hasPhotos = (updated.photosCount || 0) > 0 || !!updated.mainPhotoId;
      if (!hasPhotos) {
        setShowNoPhotosConfirm(true);
      } else {
        await openTelegramSummaryModal();
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(err?.response?.data?.message || err?.message || t('errors.generic'));
    } finally {
      setIsResettingTelegram(false);
    }
  };

  return {
    isSendingToTelegram,
    isStartingArtifactGeneration,
    isTelegramSummaryModalOpen,
    setIsTelegramSummaryModalOpen,
    telegramSummary,
    showResendConfirm,
    setShowResendConfirm,
    showNoPhotosConfirm,
    setShowNoPhotosConfirm,
    isResettingTelegram,
    hasCachedSummary,
    hasPhotosForTelegramPost,
    canManagePhotos,
    photoGenerationsMaxFallback,
    showSendToTelegramButton,
    showSentToTelegramHint,
    handleSendToTelegram,
    handleConfirmNoPhotos,
    handleSendSummaryToTelegram,
    handleResendConfirm,
    handleGenerateResultsPhoto,
  };
}

export type ResultsArtifactsTelegramController = ReturnType<typeof useResultsArtifactsTelegram>;
