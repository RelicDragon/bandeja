import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resultsApi } from '@/api/results';
import { gamesApi } from '@/api/games';
import { LiveScoreShell } from '@/components/liveScoring';
import { socketService } from '@/services/socketService';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useNetworkStore } from '@/utils/networkStatus';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import { useWakeScreenForLiveScoring } from '@/hooks/useWakeScreenForLiveScoring';
import { parseMatchLiveEnvelope } from '@/types/matchLiveScoring';
import type { Game } from '@/types';
import type { SetResult } from '@/types/gameResults';
import { getRules } from '@/utils/scoring';
import {
  advanceLiveSet,
  cancelPendingGameWin,
  confirmPendingGameWin,
  createInitialLiveScoringState,
  parseLiveScoringState,
  scoreLivePoint,
  unscoreLivePoint,
  type LiveScoringActionResult,
  type LiveScoringState,
  type LiveTeamSide,
} from '@/utils/liveScoring';

type RawMatch = {
  id: string;
  metadata?: unknown;
  sets?: SetResult[];
  teams?: Array<{
    teamNumber: number;
    players?: Array<{ userId?: string; user?: { firstName?: string; lastName?: string } }>;
  }>;
};

function labelForTeam(match: RawMatch, side: 1 | 2): string {
  const team = match.teams?.find((t) => t.teamNumber === side);
  const names =
    team?.players
      ?.map((p) => [p.user?.firstName, p.user?.lastName].filter(Boolean).join(' ').trim() || p.userId)
      .filter(Boolean) ?? [];
  return names.length ? names.join(' · ') : side === 1 ? 'Team A' : 'Team B';
}

export const GameLiveMatchPage = () => {
  const { id: gameId = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get('matchId') || '';
  const tv = searchParams.get('tv') === '1';
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isLandscape = useIsLandscape();
  const isOnline = useNetworkStore((s) => s.isOnline);

  const [gameTitle, setGameTitle] = useState<string>('');
  const [game, setGame] = useState<Game | null>(null);
  const [rawMatch, setRawMatch] = useState<RawMatch | null>(null);
  const [liveState, setLiveState] = useState<LiveScoringState | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showTvChrome, setShowTvChrome] = useState(!tv);

  const lastLive = useSocketEventsStore((s) => s.lastMatchLiveScoringUpdated);
  const rules = useMemo(() => getRules(game), [game]);

  useWakeScreenForLiveScoring(Boolean(gameId && matchId && !tv));

  const load = useCallback(async () => {
    if (!gameId || !matchId) return;
    setLoading(true);
    setError(null);
    try {
      const [gr, gameRes] = await Promise.all([
        resultsApi.getGameResults(gameId),
        gamesApi.getById(gameId).catch(() => null),
      ]);
      const gamePayload = gameRes?.data as { name?: string } | undefined;
      setGame((gameRes?.data as Game | undefined) ?? null);
      setGameTitle(gamePayload?.name || t('gameDetails.liveScore'));

      const rounds = gr.data?.rounds as Array<{ matches?: RawMatch[] }> | undefined;
      let found: RawMatch | null = null;
      for (const r of rounds || []) {
        const m = r.matches?.find((x) => x.id === matchId);
        if (m) {
          found = m;
          break;
        }
      }
      if (!found) {
        setError('Match not found');
        setRawMatch(null);
        setLiveState(null);
        setRevision(0);
        return;
      }
      setRawMatch(found);
      const env = parseMatchLiveEnvelope((found.metadata as Record<string, unknown> | undefined)?.liveScoring);
      setLiveState(env ? parseLiveScoringState(env.state, getRules(gameRes?.data as Game | undefined), found.sets) : createInitialLiveScoringState(getRules(gameRes?.data as Game | undefined), found.sets));
      setRevision(env?.revision ?? 0);
    } catch (e) {
      setError('Failed to load');
      setRawMatch(null);
    } finally {
      setLoading(false);
    }
  }, [gameId, matchId, t]);

  const refreshMatchLiveFromServer = useCallback(async () => {
    if (!gameId || !matchId) return;
    try {
      const gr = await resultsApi.getGameResults(gameId);
      const rounds = gr.data?.rounds as Array<{ matches?: RawMatch[] }> | undefined;
      for (const r of rounds || []) {
        const m = r.matches?.find((x) => x.id === matchId);
        if (m) {
          setRawMatch(m);
          const env = parseMatchLiveEnvelope((m.metadata as Record<string, unknown> | undefined)?.liveScoring);
          if (env) {
            setLiveState(parseLiveScoringState(env.state, getRules(game), m.sets));
            setRevision(env.revision);
          }
          return;
        }
      }
    } catch {
      /* ignore */
    }
  }, [gameId, matchId, game]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!gameId) return;
    void socketService.joinGameRoom(gameId).catch(() => {});
    return () => {
      socketService.leaveGameRoom(gameId);
    };
  }, [gameId]);

  useEffect(() => {
    if (!lastLive || lastLive.gameId !== gameId || lastLive.matchId !== matchId) return;
    if (lastLive.liveScoring === null) {
      setLiveState(rawMatch ? createInitialLiveScoringState(rules, rawMatch.sets) : null);
      setRevision(0);
      return;
    }
    const env = parseMatchLiveEnvelope(lastLive.liveScoring);
    if (env) {
      setLiveState(parseLiveScoringState(env.state, rules, rawMatch?.sets));
      setRevision(env.revision);
    }
  }, [lastLive, gameId, matchId, rawMatch, rules]);

  const persistLiveState = async (nextState: LiveScoringState, baseRevision: number) => {
    if (!gameId || !matchId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await resultsApi.patchMatchLiveScoring(gameId, matchId, {
        state: nextState as unknown as Record<string, unknown>,
        baseRevision,
        clientMessageId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`,
      });
      const env = res.data?.liveScoring;
      if (env) {
        setLiveState(parseLiveScoringState(env.state, rules, rawMatch?.sets));
        setRevision(env.revision);
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
          setLiveState(parseLiveScoringState(parsed.state, rules, rawMatch?.sets));
          setRevision(parsed.revision);
        } else {
          setRevision(rev409);
          await refreshMatchLiveFromServer();
        }
        setError('Out of date — try again.');
      } else {
        setError('Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const applyLiveAction = (result: LiveScoringActionResult) => {
    if (!result.changed) return;
    const nextState = result.state;
    const baseRevision = revision;
    setLiveState(nextState);
    void persistLiveState(nextState, baseRevision);
  };

  const handleScore = (side: LiveTeamSide) => {
    if (!liveState || saving) return;
    applyLiveAction(scoreLivePoint(liveState, side, rules));
  };

  const handleUndo = (side: LiveTeamSide) => {
    if (!liveState || saving) return;
    applyLiveAction(unscoreLivePoint(liveState, side, rules));
  };

  const handleConfirmGameWin = () => {
    if (!liveState || saving) return;
    applyLiveAction(confirmPendingGameWin(liveState, rules));
  };

  const handleCancelGameWin = () => {
    if (!liveState || saving) return;
    applyLiveAction(cancelPendingGameWin(liveState));
  };

  const handleSetFirstServer = (side: LiveTeamSide) => {
    if (!liveState || saving) return;
    applyLiveAction({ state: { ...liveState, firstServerTeam: side }, changed: true });
  };

  const handleNextSet = () => {
    if (!liveState || saving) return;
    applyLiveAction(advanceLiveSet(liveState, rules));
  };

  const teamALabel = useMemo(() => (rawMatch ? labelForTeam(rawMatch, 1) : ''), [rawMatch]);
  const teamBLabel = useMemo(() => (rawMatch ? labelForTeam(rawMatch, 2) : ''), [rawMatch]);

  const shellClass = tv
    ? 'min-h-[100dvh] bg-black text-white flex flex-col'
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
      onClick={tv ? () => setShowTvChrome((s) => !s) : undefined}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {!tv || showTvChrome ? (
        <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10 shrink-0">
          <button type="button" className="text-sm opacity-80 hover:opacity-100" onClick={() => navigate(-1)}>
            ←
          </button>
          <div className="text-center text-sm font-medium truncate flex-1">{gameTitle}</div>
          <div
            className={`text-xs rounded-full px-2 py-0.5 ${
              isOnline ? 'bg-emerald-600/30 text-emerald-200' : 'bg-amber-600/30 text-amber-100'
            }`}
          >
            {isOnline ? 'Live' : 'Offline'}
          </div>
        </header>
      ) : null}

      <main
        className={`flex-1 flex ${isLandscape && !tv ? 'flex-row gap-4 px-4' : 'flex-col px-3'} py-4 overflow-auto`}
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
            <LiveScoreShell
              state={liveState}
              teamALabel={teamALabel}
              teamBLabel={teamBLabel}
              revision={revision}
              rules={rules}
              isLandscape={isLandscape}
              tv={tv}
              saving={saving}
              error={error}
              onScore={handleScore}
              onUndo={handleUndo}
              onConfirmGameWin={handleConfirmGameWin}
              onCancelGameWin={handleCancelGameWin}
              onSetFirstServer={handleSetFirstServer}
              onNextSet={handleNextSet}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm opacity-70">No live state</div>
        )}
      </main>
    </div>
  );
};
