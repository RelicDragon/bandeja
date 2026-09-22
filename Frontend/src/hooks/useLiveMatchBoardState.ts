import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resultsApi } from '@/api/results';
import { gamesApi } from '@/api/games';
import { socketService } from '@/services/socketService';
import { retainGameRoom, releaseGameRoom } from '@/services/gameRoomMembership';
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
import { maxPlayersPerTeamForGame } from '@/utils/matchFormat';
import {
  AUTOMATIC_RECORD_MODE_METADATA_KEY,
  getRules,
  parseAutomaticMatchRecordMode,
} from '@/utils/scoring';
import {
  createInitialLiveScoringState,
  parseLiveScoringState,
  seedAutomaticRecordModeOnState,
  type LiveScoringState,
} from '@/utils/liveScoring';

function hydrateAutomaticLiveState(
  state: LiveScoringState,
  rules: ReturnType<typeof getRules>,
  matchMeta: Record<string, unknown> | undefined,
): LiveScoringState {
  return seedAutomaticRecordModeOnState(
    state,
    rules,
    matchMeta,
    parseAutomaticMatchRecordMode,
    AUTOMATIC_RECORD_MODE_METADATA_KEY,
  );
}

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

function normalizeLiveMatch(match: RawMatch): RawMatch {
  return { ...match, sets: match.sets?.map(set => {
    const raw = set as SetResult & { teamAScore?: number; teamBScore?: number };
    return { ...set, teamA: raw.teamAScore ?? raw.teamA, teamB: raw.teamBScore ?? raw.teamB };
  }) };
}

export function labelForTeam(match: RawMatch, side: 1 | 2): string {
  const team = match.teams?.find((t) => t.teamNumber === side);
  const names =
    team?.players
      ?.map((p) => [p.user?.firstName, p.user?.lastName].filter(Boolean).join(' ').trim() || p.userId)
      .filter(Boolean) ?? [];
  return names.length ? names.join(' · ') : side === 1 ? 'Team A' : 'Team B';
}

const DEFAULT_GENDER: Gender = 'PREFER_NOT_TO_SAY';

export function liveBoardPlayersForTeam(match: RawMatch, side: 1 | 2, game?: Game | null): BasicUser[] {
  const participantCount = (game?.participants ?? []).filter((p) => p.status === 'PLAYING').length;
  const maxPerTeam = maxPlayersPerTeamForGame(game, participantCount || undefined);
  const participantLevelById = new Map(
    (game?.participants ?? [])
      .filter((p) => p.user?.id)
      .map((p) => [p.userId, p.user!.level] as const),
  );
  const team = match.teams?.find((t) => t.teamNumber === side);
  return (team?.players ?? [])
    .map((p) => p.user)
    .filter((u): u is NonNullable<typeof u> => Boolean(u?.id))
    .slice(0, maxPerTeam)
    .map((u) => ({
      id: u.id as string,
      firstName: u.firstName ?? undefined,
      lastName: u.lastName ?? undefined,
      avatar: u.avatar ?? null,
      level:
        participantLevelById.get(u.id as string) ??
        (typeof u.level === 'number' ? u.level : Number(u.level) || 0),
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
  const [matchRoundNumber, setMatchRoundNumber] = useState<number | null>(null);
  const [liveState, setLiveState] = useState<LiveScoringState | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timerSnap, setTimerSnap] = useState<MatchTimerSnapshot | undefined>();
  const [timerNow, setTimerNow] = useState(() => Date.now());

  const lastLive = useSocketEventsStore((s) => s.lastMatchLiveScoringUpdated);
  const lastWatchHint = useSocketEventsStore((s) => s.lastWatchLiveScoringHint);
  const lastTimer = useSocketEventsStore((s) => s.lastMatchTimerUpdated);
  const rules = useMemo(() => getRules(game), [game]);
  const revisionRef = useRef(0);
  const liveWritePendingRef = useRef(false);
  const processedLiveRef = useRef<typeof lastLive>(null);
  const setLiveWritePending = useCallback((pending: boolean) => { liveWritePendingRef.current = pending; }, []);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const scope = `${gameId}:${matchId}:${spectatorToken ?? ''}`;
  const scopeRef = useRef(scope);
  if (scopeRef.current !== scope) {
    scopeRef.current = scope;
    revisionRef.current = 0;
    liveWritePendingRef.current = false;
    processedLiveRef.current = null;
    refreshInFlightRef.current = false;
  }
  const acceptServerState = useCallback((next: LiveScoringState, nextRevision: number) => {
    if (nextRevision < revisionRef.current || (liveWritePendingRef.current && nextRevision === revisionRef.current)) return false;
    revisionRef.current = nextRevision;
    setLiveState(next);
    setRevision(nextRevision);
    return true;
  }, []);
  useEffect(() => {
    revisionRef.current = Math.max(revisionRef.current, revision);
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
      setMatchRoundNumber(null);
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
      if (scopeRef.current !== scope) return;
      const gamePayload = gameRes?.data as { name?: string } | undefined;
      const spectatorGame = gr.data as Game | undefined;
      setGame(spectatorToken ? spectatorGame ?? null : ((gameRes?.data as Game | undefined) ?? null));
      setGameTitle(gamePayload?.name || (spectatorGame as { name?: string } | undefined)?.name || '');

      const rounds = gr.data?.rounds as Array<{ roundNumber?: number; matches?: RawMatch[] }> | undefined;
      let found: RawMatch | null = null;
      let foundRoundNumber: number | null = null;
      for (const [roundIndex, r] of (rounds || []).entries()) {
        const m = r.matches?.find((x) => x.id === matchId);
        if (m) {
          found = m;
          foundRoundNumber =
            typeof r.roundNumber === 'number' && Number.isFinite(r.roundNumber)
              ? r.roundNumber
              : roundIndex + 1;
          break;
        }
      }
      if (!found) {
        setError('Match not found');
        setRawMatch(null);
        setMatchRoundNumber(null);
        setLiveState(null);
        setRevision(0);
        return;
      }
      const incomingRevision = parseMatchLiveEnvelope((found.metadata as Record<string, unknown> | undefined)?.liveScoring)?.revision ?? 0;
      if (incomingRevision < revisionRef.current) return;
      found = normalizeLiveMatch(found);
      setRawMatch(found);
      setMatchRoundNumber(foundRoundNumber);
      const matchMeta = found.metadata as Record<string, unknown> | undefined;
      const env = parseMatchLiveEnvelope(matchMeta?.liveScoring);
      const rulesSource = (spectatorToken ? spectatorGame : gameRes?.data) as Game | undefined;
      const nextRules = getRules(rulesSource);
      const base = env
        ? parseLiveScoringState(env.state, nextRules, found.sets)
        : createInitialLiveScoringState(nextRules, found.sets);
      acceptServerState(hydrateAutomaticLiveState(base, nextRules, matchMeta), env?.revision ?? 0);
    } catch {
      if (scopeRef.current !== scope) return;
      setError('Failed to load');
      setRawMatch(null);
      setMatchRoundNumber(null);
    } finally {
      if (scopeRef.current === scope) setLoading(false);
    }
  }, [gameId, matchId, spectatorToken, scope, acceptServerState]);

  const refreshMatchLiveFromServer = useCallback(async function refresh(): Promise<void> {
    if (!gameId || !matchId) return;
    if (refreshInFlightRef.current) { refreshQueuedRef.current = true; return; }
    refreshInFlightRef.current = true;
    try {
      const gr = spectatorToken
        ? await resultsApi.getGameResultsForSpectator(gameId, spectatorToken)
        : await resultsApi.getGameResults(gameId);
      if (scopeRef.current !== scope) return;
      const rounds = gr.data?.rounds as Array<{ roundNumber?: number; matches?: RawMatch[] }> | undefined;
      for (const [roundIndex, r] of (rounds || []).entries()) {
        const candidate = r.matches?.find((x) => x.id === matchId);
        const m = candidate ? normalizeLiveMatch(candidate) : undefined;
        if (m) {
          const incomingRevision = parseMatchLiveEnvelope((m.metadata as Record<string, unknown> | undefined)?.liveScoring)?.revision ?? 0;
          if (incomingRevision < revisionRef.current) return;
          setRawMatch(m);
          setMatchRoundNumber(
            typeof r.roundNumber === 'number' && Number.isFinite(r.roundNumber)
              ? r.roundNumber
              : roundIndex + 1,
          );
          const matchMeta = m.metadata as Record<string, unknown> | undefined;
          const env = parseMatchLiveEnvelope(matchMeta?.liveScoring);
          {
            const nextRules = getRules(game);
            acceptServerState(
              hydrateAutomaticLiveState(
                env?.state ? parseLiveScoringState(env.state, nextRules, m.sets) : createInitialLiveScoringState(nextRules, m.sets),
                nextRules,
                matchMeta,
              ),
              env?.revision ?? 0,
            );
          }
          return;
        }
      }
    } catch {
      /* ignore */
    } finally {
      if (scopeRef.current === scope) {
        refreshInFlightRef.current = false;
        if (refreshQueuedRef.current) { refreshQueuedRef.current = false; void refresh(); }
      }
    }
  }, [gameId, matchId, game, spectatorToken, scope, acceptServerState]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!gameId || spectatorToken) return;
    void retainGameRoom(gameId).catch(() => {});
    return () => {
      releaseGameRoom(gameId);
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
    if (processedLiveRef.current === lastLive) return;
    processedLiveRef.current = lastLive;
    if (lastLive.liveScoring === null) {
      // Clear notifications carry no revision or scores. Fetch the committed correction.
      void refreshMatchLiveFromServer();
      return;
    }
    const env = parseMatchLiveEnvelope(lastLive.liveScoring);
    if (env?.state === null) { void refreshMatchLiveFromServer(); return; }
    if (env) {
      if (env.revision <= revisionRef.current) return;
      const matchMeta = rawMatch?.metadata as Record<string, unknown> | undefined;
      acceptServerState(
        hydrateAutomaticLiveState(
          parseLiveScoringState(env.state, rules, rawMatch?.sets),
          rules,
          matchMeta,
        ),
        env.revision,
      );
    }
  }, [lastLive, gameId, matchId, rawMatch, rules, spectatorToken, refreshMatchLiveFromServer, acceptServerState]);

  useEffect(() => {
    if (!lastWatchHint || lastWatchHint.gameId !== gameId || lastWatchHint.matchId !== matchId || spectatorToken) {
      return;
    }
    if (lastWatchHint.revision > 0 && lastWatchHint.revision <= revisionRef.current) return;
    void refreshMatchLiveFromServer();
  }, [lastWatchHint, gameId, matchId, spectatorToken, refreshMatchLiveFromServer]);

  const timerDisplay = useMemo(() => {
    if (!timerSnap || !isGameMatchTimerEnabled(game)) return null;
    return formatMatchTimerMs(liveElapsedMs(timerSnap, timerNow));
  }, [timerSnap, game, timerNow]);

  return {
    game,
    gameTitle,
    rawMatch,
    matchRoundNumber,
    liveState,
    setLiveState,
    acceptServerState,
    setLiveWritePending,
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
