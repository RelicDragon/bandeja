import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isLiveScoringInputLocked, isLiveMatchCompleteForScoring } from '@/utils/scoring/matchWinner';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resultsApi } from '@/api/results';
import { LiveOptionalDeciderSheet, LiveScoreShell, LiveTvToolbar } from '@/components/liveScoring';
import { useLiveMatchBoardState, liveBoardPlayersForTeam } from '@/hooks/useLiveMatchBoardState';
import { useAuthStore } from '@/store/authStore';
import { useResolvedAppAppearance } from '@/store/themeStore';
import { isGameMatchTimerEnabled } from '@/utils/matchTimer';
import { supportsTimedOpenEndedRallyFreeze } from '@shared/timedCustomPresets';
import { useNetworkStore } from '@/utils/networkStatus';
import { useWakeScreenForLiveScoring } from '@/hooks/useWakeScreenForLiveScoring';
import { parseMatchLiveEnvelope } from '@/types/matchLiveScoring';
import { resolvePlayersPerMatchForGame } from '@/utils/matchFormat';
import {
  applyOptionalDeciderFormat,
  clearTimedClassicSetLock,
  freezeTimedSetAtPartialScore,
  liveBoardThemeSearchParam,
  optionalDeciderChoicePending,
  parseLiveBoardTheme,
  parseLiveScoringState,
  scoreLivePoint,
  unscoreLivePoint,
  type LiveBoardTheme,
  type LiveOptionalDeciderFormat,
  type LiveScoringActionResult,
  type LiveMatchCourtOrientation,
  type LivePointsServeRotation,
  type LiveScoringState,
  type LiveTeamSide,
} from '@/utils/liveScoring';

function liveScoringClosedByMatchMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const o = metadata as { nonRallyOutcome?: unknown };
  const v = o.nonRallyOutcome;
  return v === 'WALKOVER' || v === 'DEFAULT' || v === 'RETIRED';
}

export const GameLiveMatchPage = () => {
  const { id: gameId = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { pathname, search: locationSearch } = useLocation();
  const matchId = searchParams.get('matchId') || '';
  const tv = searchParams.get('tv') === '1';
  const themeParam = searchParams.get('theme');
  const spectatorToken = searchParams.get('spectatorToken');
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const resolvedAppAppearance = useResolvedAppAppearance();
  const boardTheme = useMemo((): LiveBoardTheme => {
    if (themeParam === 'light' || themeParam === 'dark') return parseLiveBoardTheme(themeParam);
    if (tv) return 'dark';
    return resolvedAppAppearance === 'dark' ? 'dark' : 'light';
  }, [themeParam, tv, resolvedAppAppearance]);
  const shareBoardThemeParam = liveBoardThemeSearchParam(parseLiveBoardTheme(resolvedAppAppearance));
  const [mintedSpectatorToken, setMintedSpectatorToken] = useState<string | null>(null);
  const spectatorFetchToken = isAuthenticated ? null : spectatorToken || mintedSpectatorToken || null;

  const {
    game,
    gameTitle,
    rawMatch,
    liveState,
    setLiveState,
    revision,
    setRevision,
    loading,
    error,
    setError,
    rules,
    refreshMatchLiveFromServer,
    timerDisplay,
    timerSnap,
  } = useLiveMatchBoardState(gameId, matchId, { spectatorToken: spectatorFetchToken });

  const scoringLocked = useMemo(() => {
    if (!liveState || !rules) return false;
    if (liveScoringClosedByMatchMetadata(rawMatch?.metadata)) return true;
    if (optionalDeciderChoicePending(liveState, rules)) return true;
    return isLiveScoringInputLocked(liveState.sets, liveState.activeSetIndex, rules);
  }, [liveState, rawMatch?.metadata, rules]);

  const liveMatchStatusNote = useMemo(() => {
    if (liveScoringClosedByMatchMetadata(rawMatch?.metadata)) {
      return t('gameDetails.liveScoring.scoringClosedSpecialOutcome');
    }
    if (!liveState || !rules) return null;
    if (optionalDeciderChoicePending(liveState, rules)) return t('gameDetails.liveScoring.chooseDeciderFormat');
    if (isLiveMatchCompleteForScoring(liveState.sets, rules)) return t('gameDetails.liveScoring.matchComplete');
    if (liveState.mode === 'points' && isLiveScoringInputLocked(liveState.sets, liveState.activeSetIndex, rules)) {
      return t('gameDetails.liveScoring.pointsBudgetComplete');
    }
    if (liveState.timedClassicSetLocked && liveState.mode === 'points') {
      return t('gameDetails.liveScoring.timedScoringFrozen');
    }
    return null;
  }, [liveState, rawMatch?.metadata, rules, t]);

  const showOptionalDeciderSheet = Boolean(
    liveState && rules && optionalDeciderChoicePending(liveState, rules) && !tv && isAuthenticated
  );

  const canTimedSetFreeze = useMemo(() => {
    if (!liveState || !rules || !game || liveState.timedClassicSetLocked) return false;
    if (!isGameMatchTimerEnabled(game) || timerSnap?.status !== 'STOPPED') return false;
    if (!tv && !isAuthenticated) return false;
    if (liveState.mode === 'classic' && rules.allowIncompleteRegularSetGames) return true;
    if (
      liveState.mode === 'points' &&
      supportsTimedOpenEndedRallyFreeze(game.scoringPreset, rules.totalPointsPerSet)
    ) {
      const row = liveState.sets[liveState.activeSetIndex];
      return Boolean(row && (row.teamA > 0 || row.teamB > 0));
    }
    return false;
  }, [liveState, rules, game, timerSnap, tv, isAuthenticated]);

  const canTimedSetUnlock = Boolean(
    liveState?.timedClassicSetLocked && !tv && isAuthenticated
  );

  const [saving, setSaving] = useState(false);
  const [showTvChrome, setShowTvChrome] = useState(!tv);
  const gestureOpIdRef = useRef<string | null>(null);
  const liveStateRef = useRef<LiveScoringState | null>(null);
  const revisionRef = useRef(revision);
  const savingRef = useRef(saving);
  const rulesRef = useRef(rules);
  const rawMatchSetsRef = useRef(rawMatch?.sets);

  useEffect(() => {
    liveStateRef.current = liveState;
  }, [liveState]);
  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);
  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);
  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);
  useEffect(() => {
    rawMatchSetsRef.current = rawMatch?.sets;
  }, [rawMatch?.sets]);

  useEffect(() => {
    setShowTvChrome(!tv);
  }, [tv]);

  const tvChromeHideRef = useRef<number>(0);

  const controlUrl = useMemo(() => {
    if (typeof window === 'undefined' || !gameId || !matchId) return '';
    try {
      const u = new URL(`${window.location.origin}${pathname}${locationSearch}`);
      u.searchParams.delete('tv');
      return u.toString();
    } catch {
      return '';
    }
  }, [gameId, matchId, pathname, locationSearch]);

  const effectiveSpectatorToken = spectatorToken || mintedSpectatorToken;

  const spectatorTvUrl = useMemo(() => {
    if (typeof window === 'undefined' || !gameId || !matchId || !effectiveSpectatorToken) return '';
    try {
      const u = new URL(`${window.location.origin}/games/${encodeURIComponent(gameId)}/live`);
      u.searchParams.set('matchId', matchId);
      u.searchParams.set('tv', '1');
      u.searchParams.set('theme', shareBoardThemeParam);
      u.searchParams.set('spectatorToken', effectiveSpectatorToken);
      return u.toString();
    } catch {
      return '';
    }
  }, [gameId, matchId, effectiveSpectatorToken, shareBoardThemeParam]);

  const broadcastShareUrl = useMemo(() => {
    if (typeof window === 'undefined' || !gameId || !matchId) return '';
    try {
      const u = new URL(`${window.location.origin}/games/${encodeURIComponent(gameId)}/broadcast`);
      u.searchParams.set('matchId', matchId);
      if (effectiveSpectatorToken) u.searchParams.set('spectatorToken', effectiveSpectatorToken);
      u.searchParams.set('transparent', '1');
      u.searchParams.set('theme', shareBoardThemeParam);
      return u.toString();
    } catch {
      return '';
    }
  }, [gameId, matchId, effectiveSpectatorToken, shareBoardThemeParam]);

  useEffect(() => {
    if (spectatorToken || mintedSpectatorToken || !gameId || !matchId) return;
    if (!tv && !isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await resultsApi.mintLiveSpectatorToken(gameId, matchId);
        const tok = res.data?.token;
        if (!tok || cancelled || tok.length > 4096) return;
        setMintedSpectatorToken(tok);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tv, spectatorToken, mintedSpectatorToken, gameId, matchId, isAuthenticated]);

  useWakeScreenForLiveScoring(Boolean(gameId && matchId));

  const bumpTvChrome = useCallback(() => {
    if (!tv) return;
    setShowTvChrome(true);
    window.clearTimeout(tvChromeHideRef.current);
    tvChromeHideRef.current = window.setTimeout(() => {
      setShowTvChrome(false);
    }, 4200);
  }, [tv]);

  useEffect(() => {
    return () => {
      window.clearTimeout(tvChromeHideRef.current);
    };
  }, []);

  const persistLiveState = useCallback(async (nextState: LiveScoringState, baseRevision: number) => {
    if (!gameId || !matchId || !isAuthenticated) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const opId =
      gestureOpIdRef.current ??
      (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `op-${Date.now()}`);
    try {
      const res = await resultsApi.patchMatchLiveScoring(gameId, matchId, {
        state: nextState as unknown as Record<string, unknown>,
        baseRevision,
        clientMessageId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`,
        opId,
      });
      const env = res.data?.liveScoring;
      if (env) {
        setLiveState(parseLiveScoringState(env.state, rulesRef.current, rawMatchSetsRef.current));
        setRevision(env.revision);
        gestureOpIdRef.current = null;
      }
    } catch (err: unknown) {
      const ax = err as {
        response?: {
          status?: number;
          data?: { revision?: number; liveScoring?: unknown };
        };
      };
      const rev409 = ax.response?.data?.revision;
      const bodyEnv = ax.response?.data?.liveScoring;
      if (ax.response?.status === 409 && typeof rev409 === 'number') {
        const parsed = parseMatchLiveEnvelope(bodyEnv);
        if (parsed) {
          setLiveState(parseLiveScoringState(parsed.state, rulesRef.current, rawMatchSetsRef.current));
          setRevision(parsed.revision);
          setError(null);
          gestureOpIdRef.current = null;
        } else {
          setRevision(rev409);
          await refreshMatchLiveFromServer();
          setError(t('gameDetails.liveScoring.syncConflictRetry'));
        }
      } else {
        const msg =
          ax.response?.data &&
          typeof (ax.response.data as { message?: unknown }).message === 'string'
            ? (ax.response.data as { message: string }).message
            : null;
        setError(msg || 'Save failed');
        gestureOpIdRef.current = null;
        await refreshMatchLiveFromServer();
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [gameId, matchId, isAuthenticated, setLiveState, setRevision, setError, refreshMatchLiveFromServer, t]);

  const applyLiveAction = useCallback(
    (result: LiveScoringActionResult) => {
      if (!result.changed) return;
      gestureOpIdRef.current =
        typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `op-${Date.now()}`;
      const nextState = result.state;
      const baseRevision = revisionRef.current;
      liveStateRef.current = nextState;
      setLiveState(nextState);
      void persistLiveState(nextState, baseRevision);
    },
    [persistLiveState, setLiveState]
  );

  const handleScore = useCallback(
    (side: LiveTeamSide) => {
      const s = liveStateRef.current;
      const r = rulesRef.current;
      if (!s || savingRef.current || !isAuthenticated || !r) return;
      if (optionalDeciderChoicePending(s, r)) return;
      if (isLiveScoringInputLocked(s.sets, s.activeSetIndex, r)) return;
      applyLiveAction(scoreLivePoint(s, side, r));
    },
    [isAuthenticated, applyLiveAction]
  );

  const handleUndo = useCallback(
    (side: LiveTeamSide) => {
      const s = liveStateRef.current;
      const r = rulesRef.current;
      if (!s || savingRef.current || !isAuthenticated || !r) return;
      if (isLiveMatchCompleteForScoring(s.sets, r)) return;
      applyLiveAction(unscoreLivePoint(s, side, r));
    },
    [isAuthenticated, applyLiveAction]
  );

  const handleServeSetupComplete = useCallback(
    (
      side: LiveTeamSide,
      doublesPlayerIndex: number,
      rotation: LivePointsServeRotation,
      courtOrientation: LiveMatchCourtOrientation
    ) => {
      const s = liveStateRef.current;
      const r = rulesRef.current;
      if (!s || !r || savingRef.current || !isAuthenticated) return;
      if (isLiveScoringInputLocked(s.sets, s.activeSetIndex, r)) return;
      applyLiveAction({
        state: {
          ...s,
          firstServerTeam: side,
          firstServerDoublesPlayerIndex: doublesPlayerIndex,
          pointsServeRotation: rotation,
          matchStartCourtEndsSwapped: courtOrientation.endsSwapped || undefined,
          matchStartTeamASidesMirrored: courtOrientation.teamASidesMirrored || undefined,
          matchStartTeamBSidesMirrored: courtOrientation.teamBSidesMirrored || undefined,
        },
        changed: true,
      });
    },
    [isAuthenticated, applyLiveAction]
  );

  const handleOptionalDecider = useCallback(
    (format: LiveOptionalDeciderFormat) => {
      const s = liveStateRef.current;
      const r = rulesRef.current;
      if (!s || !r || savingRef.current || !isAuthenticated) return;
      applyLiveAction(applyOptionalDeciderFormat(s, r, format));
    },
    [isAuthenticated, applyLiveAction]
  );

  const handleTimedFreeze = useCallback(() => {
    const s = liveStateRef.current;
    const r = rulesRef.current;
    if (!s || !r || savingRef.current || !isAuthenticated) return;
    applyLiveAction(freezeTimedSetAtPartialScore(s, r, game?.scoringPreset));
  }, [game?.scoringPreset, isAuthenticated, applyLiveAction]);

  const handleTimedUnlock = useCallback(() => {
    const s = liveStateRef.current;
    if (!s || savingRef.current || !isAuthenticated) return;
    applyLiveAction(clearTimedClassicSetLock(s));
  }, [isAuthenticated, applyLiveAction]);

  const handleSkipServeGuide = useCallback(() => {
    const s = liveStateRef.current;
    const r = rulesRef.current;
    if (!s || !r || savingRef.current || !isAuthenticated) return;
    if (isLiveScoringInputLocked(s.sets, s.activeSetIndex, r)) return;
    applyLiveAction({ state: { ...s, serveGuideSkipped: true }, changed: true });
  }, [isAuthenticated, applyLiveAction]);

  const playersPerMatch = useMemo(() => resolvePlayersPerMatchForGame(game ?? {}), [game]);
  const teamAPlayers = useMemo(() => (rawMatch ? liveBoardPlayersForTeam(rawMatch, 1) : []), [rawMatch]);
  const teamBPlayers = useMemo(() => (rawMatch ? liveBoardPlayersForTeam(rawMatch, 2) : []), [rawMatch]);

  const shellClass = tv
    ? boardTheme === 'light'
      ? 'relative flex min-h-[100dvh] flex-col bg-white text-gray-900'
      : 'relative flex min-h-[100dvh] flex-col bg-black text-white'
    : 'min-h-[100dvh] bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col';

  if (!matchId) {
    return (
      <div className={shellClass}>
        <div className="p-4">Missing matchId</div>
        <Link to={`/games/${gameId}`} className="p-4 text-primary-600">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div
      className={shellClass}
      onPointerDown={tv ? bumpTvChrome : undefined}
      style={{
        paddingTop: tv && !showTvChrome ? 0 : 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {!tv ? (
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
          <button type="button" className="text-sm opacity-80 hover:opacity-100" onClick={() => navigate(-1)}>
            ←
          </button>
          <div className="flex-1 truncate text-center text-sm font-medium">
            {gameTitle.trim() ? gameTitle : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {saving ? (
              <span className="inline-flex h-6 max-w-full shrink-0 items-center justify-center rounded-full border border-primary-400/35 bg-primary-500/12 px-2 text-xs leading-none text-primary-900 dark:border-primary-500/30 dark:bg-primary-500/15 dark:text-primary-100">
                {t('gameDetails.liveScoring.syncing')}
              </span>
            ) : null}
            <div
              className={`inline-flex h-6 shrink-0 items-center justify-center rounded-full border border-transparent px-2 text-xs leading-none ${
                isOnline ? 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-200' : 'bg-amber-600/15 text-amber-900 dark:text-amber-100'
              }`}
            >
              {isOnline ? t('gameDetails.liveTvPillLive') : t('gameDetails.liveTvPillOffline')}
            </div>
          </div>
        </header>
      ) : showTvChrome ? (
        <div className="pointer-events-auto absolute inset-x-0 top-0 z-30 flex justify-center px-2 pt-[env(safe-area-inset-top)]">
          <LiveTvToolbar
            gameId={gameId}
            gameTitle={gameTitle}
            isOnline={isOnline}
            controlUrl={controlUrl}
            broadcastUrl={broadcastShareUrl}
            spectatorUrl={spectatorTvUrl}
            timerDisplay={timerDisplay}
          />
        </div>
      ) : null}

      {tv && !showTvChrome && gameTitle.trim() ? (
        <div
          className={`pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center px-3 pr-[min(12rem,calc(100%-1rem))] pt-[max(0.5rem,env(safe-area-inset-top))]`}
        >
          <div
            className={`min-w-0 max-w-full truncate text-center text-sm font-semibold sm:text-base ${
              boardTheme === 'light' ? 'text-gray-900 drop-shadow-sm' : 'text-white drop-shadow-md'
            }`}
          >
            {gameTitle}
          </div>
        </div>
      ) : null}

      {tv && !showTvChrome ? (
        <div
          className={`pointer-events-none absolute z-20 max-w-[min(11rem,calc(100%-1.5rem))] rounded-full border px-2.5 py-1 text-xs font-medium shadow-md ${
            boardTheme === 'light'
              ? isOnline
                ? 'border-emerald-600/25 bg-emerald-500/15 text-emerald-900'
                : 'border-amber-600/30 bg-amber-500/20 text-amber-950'
              : isOnline
                ? 'border-white/15 bg-emerald-500/20 text-emerald-100'
                : 'border-white/15 bg-amber-500/25 text-amber-50'
          }`}
          style={{
            top: 'max(0.5rem, env(safe-area-inset-top))',
            right: 'max(0.5rem, env(safe-area-inset-right))',
          }}
        >
          {isOnline ? t('gameDetails.liveTvPillLive') : t('gameDetails.liveTvPillOffline')}
        </div>
      ) : null}

      <main
        className={`flex-1 flex flex-col overflow-auto px-3 ${
          tv && !showTvChrome && gameTitle.trim() ? 'pb-4 pt-10 sm:pt-11' : 'py-4'
        }`}
      >
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm opacity-70">…</div>
        ) : error && !rawMatch ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm">
            {error}
            <Link to={`/games/${gameId}`} className="text-primary-400 underline">
              Game
            </Link>
          </div>
        ) : liveState ? (
          <>
            {!tv && (canTimedSetFreeze || canTimedSetUnlock) ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {canTimedSetFreeze ? (
                  <button
                    type="button"
                    className="rounded-lg border border-amber-600/40 bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-950 dark:text-amber-100"
                    onClick={handleTimedFreeze}
                  >
                    {t('gameDetails.liveScoring.timedLockCta')}
                  </button>
                ) : null}
                {canTimedSetUnlock ? (
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium dark:border-gray-600 dark:bg-gray-900"
                    onClick={handleTimedUnlock}
                  >
                    {t('gameDetails.liveScoring.timedUnlockCta')}
                  </button>
                ) : null}
              </div>
            ) : null}
            <LiveScoreShell
              state={liveState}
              teamAPlayers={teamAPlayers}
              teamBPlayers={teamBPlayers}
              revision={revision}
              rules={rules}
              sport={game?.sport}
              scoringPreset={game?.scoringPreset ?? null}
              playersPerMatch={playersPerMatch}
              gameId={gameId}
              boardTheme={boardTheme}
              tv={tv}
              saving={saving}
              error={error}
              statusNote={liveMatchStatusNote}
              scoringLocked={scoringLocked}
              isOnline={isOnline}
              onScore={handleScore}
              onUndo={handleUndo}
              onServeSetupComplete={handleServeSetupComplete}
              onSkipServeGuide={handleSkipServeGuide}
              {...(!tv
                ? { shareTvUrl: spectatorTvUrl, shareBroadcastUrl: broadcastShareUrl }
                : {})}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm opacity-70">No live state</div>
        )}
      </main>

      <LiveOptionalDeciderSheet open={showOptionalDeciderSheet} onChoose={handleOptionalDecider} />

      {liveState ? (
        <div
          className={`pointer-events-none fixed z-[45] tabular-nums ${
            tv
              ? boardTheme === 'light'
                ? 'text-[10px] text-gray-600 opacity-70 sm:text-xs'
                : 'text-[10px] text-white/55 sm:text-xs'
              : 'text-[10px] text-gray-500 opacity-70 dark:text-gray-400 sm:text-xs'
          }`}
          style={{
            bottom: 'max(0.5rem, env(safe-area-inset-bottom))',
            right: 'max(0.5rem, env(safe-area-inset-right))',
          }}
        >
          {t('gameDetails.liveScoring.rev')} {revision}
        </div>
      ) : null}
    </div>
  );
};
