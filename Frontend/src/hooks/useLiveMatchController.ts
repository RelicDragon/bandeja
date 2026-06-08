import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resultsApi } from '@/api/results';
import { resolveRallyCourtForPlugin } from '@/components/liveScoring/courtRegistry';
import { useLiveMatchBoardState, liveBoardPlayersForTeam } from '@/hooks/useLiveMatchBoardState';
import { useAuthStore } from '@/store/authStore';
import { useResolvedAppAppearance } from '@/store/themeStore';
import { isGameMatchTimerEnabled } from '@/utils/matchTimer';
import {
  supportsMatchTimerPointsRallyFreeze,
  supportsTimedOpenEndedRallyFreeze,
} from '@shared/timedCustomPresets';
import { playersPerMatchOf } from '@/utils/matchFormat';
import {
  applyOptionalDeciderFormat,
  clearTimedClassicSetLock,
  freezeTimedSetAtPartialScore,
  optionalDeciderChoicePending,
  parseLiveBoardTheme,
  scoreLivePoint,
  unscoreLivePoint,
  type LiveBoardTheme,
  type LiveMatchCourtOrientation,
  type LiveOptionalDeciderFormat,
  type LivePointsServeRotation,
  type LiveScoringState,
  type LiveTeamSide,
} from '@/utils/liveScoring';
import {
  clearLetPending,
  opponentTeam,
  withLetPending,
} from '@shared/officiatingEnforcement';
import { officiatingIsStrict } from '@shared/officiatingLevel';
import {
  computeServeGuideSnapshotByPlugin,
  resolveLiveScoringPlugin,
} from '@/liveScoring/registry';
import { isLiveMatchCompleteForScoring, isLiveScoringInputLocked } from '@/utils/scoring/matchWinner';
import { canScoreLivePoint } from './liveMatchController/canScoreLivePoint';
import { liveScoringClosedByMatchMetadata } from './liveMatchController/liveScoringClosed';
import { persistLiveScoringPatch } from './liveMatchController/persistLiveScoring';
import { buildScorePointMutation } from './liveMatchController/scorePointAction';
import {
  resolveShareBoardThemeParam,
  useLiveMatchShareUrls,
} from './liveMatchController/useLiveMatchShareUrls';
import type { CanScoreResult, UseLiveMatchControllerOptions, UseLiveMatchControllerReturn } from './liveMatchController/types';

export type { CanScoreResult, UseLiveMatchControllerOptions, UseLiveMatchControllerReturn } from './liveMatchController/types';

function playerNames(players: ReturnType<typeof liveBoardPlayersForTeam>): string[] {
  return players.map((p) => [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id);
}

export function useLiveMatchController(
  gameId: string,
  matchId: string,
  options: UseLiveMatchControllerOptions = {}
): UseLiveMatchControllerReturn {
  const { tv = false, themeParam = null, spectatorToken = null, pathname = '', locationSearch = '' } = options;
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const resolvedAppAppearance = useResolvedAppAppearance();
  const [mintedSpectatorToken, setMintedSpectatorToken] = useState<string | null>(null);
  const spectatorFetchToken = isAuthenticated ? null : spectatorToken || mintedSpectatorToken || null;
  const effectiveSpectatorToken = spectatorToken || mintedSpectatorToken;

  const boardTheme = useMemo((): LiveBoardTheme => {
    if (themeParam === 'light' || themeParam === 'dark') return parseLiveBoardTheme(themeParam);
    if (tv) return 'dark';
    return resolvedAppAppearance === 'dark' ? 'dark' : 'light';
  }, [themeParam, tv, resolvedAppAppearance]);

  const shareBoardThemeParam = resolveShareBoardThemeParam(resolvedAppAppearance);

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

  const { controlUrl, spectatorTvUrl, broadcastShareUrl } = useLiveMatchShareUrls({
    gameId,
    matchId,
    pathname,
    locationSearch,
    effectiveSpectatorToken,
    shareBoardThemeParam,
  });

  const [saving, setSaving] = useState(false);
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

  const playersPerMatch = useMemo(() => playersPerMatchOf(game ?? {}), [game]);
  const teamAPlayers = useMemo(
    () => (rawMatch ? liveBoardPlayersForTeam(rawMatch, 1, game) : []),
    [rawMatch, game]
  );
  const teamBPlayers = useMemo(
    () => (rawMatch ? liveBoardPlayersForTeam(rawMatch, 2, game) : []),
    [rawMatch, game]
  );

  const scoreCtx = useMemo(
    () => ({ game, teamAPlayers, teamBPlayers, playersPerMatch }),
    [game, teamAPlayers, teamBPlayers, playersPerMatch]
  );

  const plugin = useMemo(() => {
    if (!game || !rules) return null;
    return resolveLiveScoringPlugin(game.sport, game.scoringPreset ?? rules.preset, game.metadata);
  }, [game, rules]);

  const courtComponent = useMemo(
    () => (plugin ? resolveRallyCourtForPlugin(plugin) : null),
    [plugin]
  );

  const serveGuide = useMemo(() => {
    if (!liveState || !rules || !plugin) return null;
    return computeServeGuideSnapshotByPlugin(
      plugin,
      liveState,
      rules,
      playerNames(teamAPlayers),
      playerNames(teamBPlayers),
      playersPerMatch
    );
  }, [liveState, rules, plugin, teamAPlayers, teamBPlayers, playersPerMatch]);

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
    if (liveState.mode === 'points') {
      const rallyFreeze =
        supportsTimedOpenEndedRallyFreeze(game.scoringPreset, rules.totalPointsPerSet) ||
        supportsMatchTimerPointsRallyFreeze(
          game.matchTimerEnabled,
          game.scoringPreset,
          rules.totalPointsPerSet
        );
      if (rallyFreeze) {
        const row = liveState.sets[liveState.activeSetIndex];
        return Boolean(row && (row.teamA > 0 || row.teamB > 0));
      }
    }
    return false;
  }, [liveState, rules, game, timerSnap, tv, isAuthenticated]);

  const canTimedSetUnlock = Boolean(liveState?.timedClassicSetLocked && !tv && isAuthenticated);

  const persistLiveState = useCallback(
    async (nextState: LiveScoringState, baseRevision: number) => {
      if (!gameId || !matchId || !isAuthenticated) return;
      savingRef.current = true;
      setSaving(true);
      setError(null);
      const opId =
        gestureOpIdRef.current ??
        (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `op-${Date.now()}`);
      const result = await persistLiveScoringPatch({
        gameId,
        matchId,
        nextState,
        baseRevision,
        opId,
        rules: rulesRef.current,
        rawMatchSets: rawMatchSetsRef.current,
      });
      if (result.ok) {
        setLiveState(result.state);
        setRevision(result.revision);
        gestureOpIdRef.current = null;
      } else if (result.conflict) {
        if (result.state && result.revision != null) {
          setLiveState(result.state);
          setRevision(result.revision);
          setError(null);
          gestureOpIdRef.current = null;
        } else {
          if (result.revision != null) setRevision(result.revision);
          await refreshMatchLiveFromServer();
          setError(t('gameDetails.liveScoring.syncConflictRetry'));
        }
      } else {
        setError(result.message);
        gestureOpIdRef.current = null;
        if (result.refresh) await refreshMatchLiveFromServer();
      }
      savingRef.current = false;
      setSaving(false);
    },
    [gameId, matchId, isAuthenticated, setLiveState, setRevision, setError, refreshMatchLiveFromServer, t]
  );

  const applyLiveAction = useCallback(
    (result: { changed: boolean; state: LiveScoringState }) => {
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

  useEffect(() => {
    if (!liveState || !rules || !game || liveState.timedClassicSetLocked) return;
    if (!timerSnap?.capJustNotified || timerSnap.status !== 'RUNNING') return;
    const rallyFreeze =
      supportsTimedOpenEndedRallyFreeze(game.scoringPreset, rules.totalPointsPerSet) ||
      supportsMatchTimerPointsRallyFreeze(
        game.matchTimerEnabled,
        game.scoringPreset,
        rules.totalPointsPerSet
      );
    if (!rallyFreeze || liveState.mode !== 'points') return;
    const row = liveState.sets[liveState.activeSetIndex];
    if (!row || (row.teamA === 0 && row.teamB === 0)) return;
    applyLiveAction(
      freezeTimedSetAtPartialScore(liveState, rules, game.scoringPreset, game.matchTimerEnabled)
    );
  }, [timerSnap?.capJustNotified, timerSnap?.status, liveState, rules, game, applyLiveAction]);

  const canScore = useCallback(
    (team: LiveTeamSide): CanScoreResult =>
      canScoreLivePoint(
        liveStateRef.current,
        rulesRef.current,
        rawMatch,
        scoreCtx,
        team,
        savingRef.current,
        isAuthenticated
      ),
    [rawMatch, scoreCtx, isAuthenticated]
  );

  const scorePoint = useCallback(
    (side: LiveTeamSide) => {
      const gate = canScore(side);
      if (!gate.ok) {
        if (gate.toastKey) setError(t(gate.toastKey));
        return;
      }
      const s = liveStateRef.current;
      const r = rulesRef.current;
      if (!s || !r) return;
      applyLiveAction(buildScorePointMutation(s, side, r));
    },
    [canScore, applyLiveAction, setError, t]
  );

  const unscorePoint = useCallback(
    (side: LiveTeamSide) => {
      const s = liveStateRef.current;
      const r = rulesRef.current;
      if (!s || savingRef.current || !isAuthenticated || !r) return;
      if (isLiveMatchCompleteForScoring(s.sets, r)) return;
      applyLiveAction(unscoreLivePoint(s, side, r));
    },
    [isAuthenticated, applyLiveAction]
  );

  const applyOptionalDecider = useCallback(
    (format: LiveOptionalDeciderFormat) => {
      const s = liveStateRef.current;
      const r = rulesRef.current;
      if (!s || !r || savingRef.current || !isAuthenticated) return;
      applyLiveAction(applyOptionalDeciderFormat(s, r, format));
    },
    [isAuthenticated, applyLiveAction]
  );

  const kitchenFault = useCallback(
    (faultingTeam: LiveTeamSide) => {
      const s = liveStateRef.current;
      const r = rulesRef.current;
      if (!s || savingRef.current || !isAuthenticated || !r) return;
      if (isLiveScoringInputLocked(s.sets, s.activeSetIndex, r)) return;
      applyLiveAction(scoreLivePoint(s, opponentTeam(faultingTeam), r));
    },
    [isAuthenticated, applyLiveAction]
  );

  const letPending = useCallback(() => {
    const s = liveStateRef.current;
    const r = rulesRef.current;
    if (!s || savingRef.current || !isAuthenticated || !r) return;
    if (!officiatingIsStrict(r.officiatingLevel)) return;
    applyLiveAction({ state: withLetPending(s), changed: true });
  }, [isAuthenticated, applyLiveAction]);

  const letReplay = useCallback(() => {
    const s = liveStateRef.current;
    if (!s || savingRef.current || !isAuthenticated) return;
    applyLiveAction({ state: clearLetPending(s), changed: true });
  }, [isAuthenticated, applyLiveAction]);

  const serviceFault = useCallback(() => {
    const s = liveStateRef.current;
    const r = rulesRef.current;
    if (!s || savingRef.current || !isAuthenticated || !r || !game) return;
    if (isLiveScoringInputLocked(s.sets, s.activeSetIndex, r)) return;
    const p = resolveLiveScoringPlugin(game.sport, game.scoringPreset ?? r.preset, game.metadata);
    const snap = computeServeGuideSnapshotByPlugin(
      p,
      s,
      r,
      playerNames(teamAPlayers),
      playerNames(teamBPlayers),
      playersPerMatch
    );
    const server = snap?.serverTeam ?? s.firstServerTeam ?? 'teamA';
    applyLiveAction(scoreLivePoint(s, opponentTeam(server), r));
  }, [isAuthenticated, applyLiveAction, game, teamAPlayers, teamBPlayers, playersPerMatch]);

  const serveSetupComplete = useCallback(
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

  const skipServeGuide = useCallback(() => {
    const s = liveStateRef.current;
    const r = rulesRef.current;
    if (!s || !r || savingRef.current || !isAuthenticated) return;
    if (isLiveScoringInputLocked(s.sets, s.activeSetIndex, r)) return;
    applyLiveAction({ state: { ...s, serveGuideSkipped: true }, changed: true });
  }, [isAuthenticated, applyLiveAction]);

  const timedFreeze = useCallback(() => {
    const s = liveStateRef.current;
    const r = rulesRef.current;
    if (!s || !r || savingRef.current || !isAuthenticated) return;
    applyLiveAction(freezeTimedSetAtPartialScore(s, r, game?.scoringPreset, game?.matchTimerEnabled));
  }, [game?.scoringPreset, game?.matchTimerEnabled, isAuthenticated, applyLiveAction]);

  const timedUnlock = useCallback(() => {
    const s = liveStateRef.current;
    if (!s || savingRef.current || !isAuthenticated) return;
    applyLiveAction(clearTimedClassicSetLock(s));
  }, [isAuthenticated, applyLiveAction]);

  return {
    game,
    match: rawMatch,
    gameTitle,
    liveState,
    rules,
    revision,
    loading,
    error,
    boardTheme,
    tvMode: tv,
    plugin,
    courtComponent,
    playersByTeam: { teamA: teamAPlayers, teamB: teamBPlayers },
    playersPerMatch,
    timerDisplay,
    timerSnap,
    refresh: refreshMatchLiveFromServer,
    saving,
    scorePoint,
    unscorePoint,
    applyOptionalDecider,
    kitchenFault,
    letPending,
    letReplay,
    serviceFault,
    serveSetupComplete,
    skipServeGuide,
    timedFreeze,
    timedUnlock,
    canScore,
    serveGuide,
    scoringLocked,
    liveMatchStatusNote,
    showOptionalDeciderSheet,
    canTimedSetFreeze,
    canTimedSetUnlock,
    shareBoardThemeParam,
    effectiveSpectatorToken,
    spectatorTvUrl,
    broadcastShareUrl,
    controlUrl,
    mintedSpectatorToken,
  };
}
