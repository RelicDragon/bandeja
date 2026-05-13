import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resultsApi } from '@/api/results';
import { gamesApi } from '@/api/games';
import { socketService } from '@/services/socketService';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { parseMatchLiveEnvelope } from '@/types/matchLiveScoring';
import {
  buildSnapshotFromServerMatch,
  formatMatchTimerMs,
  isGameMatchTimerEnabled,
  liveElapsedMs,
  type MatchTimerSnapshot,
} from '@/utils/matchTimer';
import type { BasicUser, Game, Gender } from '@/types';
import type { SetResult } from '@/types/gameResults';
import { getRules } from '@/utils/scoring';
import { createInitialLiveScoringState, parseLiveScoringState, type LiveScoringState } from '@/utils/liveScoring';

export type RawMatch = {
  id: string;
  metadata?: unknown;
  sets?: SetResult[];
  timerStatus?: string;
  timerStartedAt?: string | null;
  timerPausedAt?: string | null;
  timerElapsedMs?: number;
  timerCapMinutes?: number | null;
  teams?: Array<{
    teamNumber: number;
    players?: Array<{
      userId?: string;
      user?: {
        id?: string;
        firstName?: string;
        lastName?: string;
        avatar?: string | null;
        level?: unknown;
        socialLevel?: unknown;
        gender?: string;
        approvedLevel?: unknown;
        isTrainer?: unknown;
      };
    }>;
  }>;
};

export function labelForTeam(match: RawMatch, side: 1 | 2): string {
  const team = match.teams?.find((t) => t.teamNumber === side);
  const names =
    team?.players
      ?.map((p) => [p.user?.firstName, p.user?.lastName].filter(Boolean).join(' ').trim() || p.userId)
      .filter(Boolean) ?? [];
  return names.length ? names.join(' · ') : side === 1 ? 'Team A' : 'Team B';
}

const DEFAULT_GENDER: Gender = 'PREFER_NOT_TO_SAY';

export function liveBoardPlayersForTeam(match: RawMatch, side: 1 | 2): BasicUser[] {
  const team = match.teams?.find((t) => t.teamNumber === side);
  return (team?.players ?? [])
    .map((p) => p.user)
    .filter((u): u is NonNullable<typeof u> => Boolean(u?.id))
    .map((u) => ({
      id: u.id as string,
      firstName: u.firstName ?? undefined,
      lastName: u.lastName ?? undefined,
      avatar: u.avatar ?? null,
      level: typeof u.level === 'number' ? u.level : Number(u.level) || 0,
      socialLevel: typeof u.socialLevel === 'number' ? u.socialLevel : Number(u.socialLevel) || 0,
      gender: (u.gender as Gender) || DEFAULT_GENDER,
      approvedLevel: Boolean(u.approvedLevel),
      isTrainer: Boolean(u.isTrainer),
    }));
}

export type LiveMatchBoardOptions = {
  spectatorToken?: string | null;
};

export function useLiveMatchBoardState(gameId: string, matchId: string, options?: LiveMatchBoardOptions) {
  const spectatorToken = options?.spectatorToken ?? null;
  const [gameTitle, setGameTitle] = useState('');
  const [game, setGame] = useState<Game | null>(null);
  const [rawMatch, setRawMatch] = useState<RawMatch | null>(null);
  const [liveState, setLiveState] = useState<LiveScoringState | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timerSnap, setTimerSnap] = useState<MatchTimerSnapshot | undefined>();
  const [timerNow, setTimerNow] = useState(() => Date.now());

  const lastLive = useSocketEventsStore((s) => s.lastMatchLiveScoringUpdated);
  const lastTimer = useSocketEventsStore((s) => s.lastMatchTimerUpdated);
  const rules = useMemo(() => getRules(game), [game]);
  const revisionRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);

  useEffect(() => {
    const fromHttp =
      rawMatch?.id === matchId ? buildSnapshotFromServerMatch(rawMatch) : undefined;
    if (lastTimer && lastTimer.gameId === gameId && lastTimer.matchId === matchId) {
      setTimerSnap(lastTimer.snapshot);
      return;
    }
    setTimerSnap(fromHttp);
  }, [rawMatch, lastTimer, gameId, matchId]);

  useEffect(() => {
    if (!timerSnap || timerSnap.status !== 'RUNNING') return;
    const id = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timerSnap]);

  const load = useCallback(async () => {
    if (!gameId || !matchId) return;
    setLoading(true);
    setError(null);
    if (spectatorToken && spectatorToken.length > 4096) {
      setError('Invalid spectator link');
      setRawMatch(null);
      setLiveState(null);
      setRevision(0);
      setLoading(false);
      return;
    }
    try {
      const [gr, gameRes] = await Promise.all([
        spectatorToken
          ? resultsApi.getGameResultsForSpectator(gameId, spectatorToken)
          : resultsApi.getGameResults(gameId),
        spectatorToken ? Promise.resolve(null) : gamesApi.getById(gameId).catch(() => null),
      ]);
      const gamePayload = gameRes?.data as { name?: string } | undefined;
      const spectatorGame = gr.data as Game | undefined;
      setGame(spectatorToken ? spectatorGame ?? null : ((gameRes?.data as Game | undefined) ?? null));
      setGameTitle(gamePayload?.name || (spectatorGame as { name?: string } | undefined)?.name || '');

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
      const rulesSource = (spectatorToken ? spectatorGame : gameRes?.data) as Game | undefined;
      setLiveState(
        env ? parseLiveScoringState(env.state, getRules(rulesSource), found.sets) : createInitialLiveScoringState(getRules(rulesSource), found.sets)
      );
      setRevision(env?.revision ?? 0);
    } catch {
      setError('Failed to load');
      setRawMatch(null);
    } finally {
      setLoading(false);
    }
  }, [gameId, matchId, spectatorToken]);

  const refreshMatchLiveFromServer = useCallback(async () => {
    if (!gameId || !matchId) return;
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const gr = spectatorToken
        ? await resultsApi.getGameResultsForSpectator(gameId, spectatorToken)
        : await resultsApi.getGameResults(gameId);
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
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [gameId, matchId, game, spectatorToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!gameId || spectatorToken) return;
    void socketService.joinGameRoom(gameId).catch(() => {});
    return () => {
      socketService.leaveGameRoom(gameId);
    };
  }, [gameId, spectatorToken]);

  useEffect(() => {
    if (spectatorToken || !gameId || !matchId) return;
    return socketService.onConnect(() => {
      void refreshMatchLiveFromServer();
    });
  }, [spectatorToken, gameId, matchId, refreshMatchLiveFromServer]);

  useEffect(() => {
    if (!spectatorToken) return;
    const id = window.setInterval(() => {
      void refreshMatchLiveFromServer();
    }, 3500);
    return () => clearInterval(id);
  }, [spectatorToken, refreshMatchLiveFromServer]);

  useEffect(() => {
    if (!lastLive || lastLive.gameId !== gameId || lastLive.matchId !== matchId || spectatorToken) return;
    if (lastLive.liveScoring === null) {
      setLiveState(rawMatch ? createInitialLiveScoringState(rules, rawMatch.sets) : null);
      setRevision(0);
      return;
    }
    const env = parseMatchLiveEnvelope(lastLive.liveScoring);
    if (env) {
      if (env.revision <= revisionRef.current) return;
      setLiveState(parseLiveScoringState(env.state, rules, rawMatch?.sets));
      setRevision(env.revision);
    }
  }, [lastLive, gameId, matchId, rawMatch, rules, spectatorToken]);

  const timerDisplay = useMemo(() => {
    if (!timerSnap || !isGameMatchTimerEnabled(game)) return null;
    return formatMatchTimerMs(liveElapsedMs(timerSnap, timerNow));
  }, [timerSnap, game, timerNow]);

  return {
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
    load,
    refreshMatchLiveFromServer,
    timerDisplay,
    timerSnap,
  };
}
