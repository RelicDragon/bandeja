import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resultsApi } from '@/api/results';
import { gamesApi } from '@/api/games';
import { socketService } from '@/services/socketService';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useNetworkStore } from '@/utils/networkStatus';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import { useWakeScreenForLiveScoring } from '@/hooks/useWakeScreenForLiveScoring';
import { parseMatchLiveEnvelope, type MatchLiveScoringEnvelopeV1 } from '@/types/matchLiveScoring';

type RawMatch = {
  id: string;
  metadata?: unknown;
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
  const [rawMatch, setRawMatch] = useState<RawMatch | null>(null);
  const [live, setLive] = useState<MatchLiveScoringEnvelopeV1 | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [showTvChrome, setShowTvChrome] = useState(!tv);

  const lastLive = useSocketEventsStore((s) => s.lastMatchLiveScoringUpdated);

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
        setLive(null);
        setRevision(0);
        return;
      }
      setRawMatch(found);
      const env = parseMatchLiveEnvelope((found.metadata as Record<string, unknown> | undefined)?.liveScoring);
      setLive(env);
      setRevision(env?.revision ?? 0);
      setNote(typeof env?.state?.note === 'string' ? (env.state.note as string) : '');
    } catch (e) {
      setError('Failed to load');
      setRawMatch(null);
    } finally {
      setLoading(false);
    }
  }, [gameId, matchId, t]);

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
      setLive(null);
      setRevision(0);
      setNote('');
      return;
    }
    const env = parseMatchLiveEnvelope(lastLive.liveScoring);
    if (env) {
      setLive(env);
      setRevision(env.revision);
      setNote(typeof env.state?.note === 'string' ? (env.state.note as string) : '');
    }
  }, [lastLive, gameId, matchId]);

  const persistNote = async () => {
    if (!gameId || !matchId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await resultsApi.patchMatchLiveScoring(gameId, matchId, {
        state: { note },
        baseRevision: revision,
        clientMessageId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`,
      });
      const env = res.data?.liveScoring;
      if (env) {
        setLive(env);
        setRevision(env.revision);
      }
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: { revision?: number } } };
      const rev409 = ax.response?.data?.revision;
      if (ax.response?.status === 409 && typeof rev409 === 'number') {
        setRevision(rev409);
        setError('Out of date — try again.');
      } else {
        setError('Save failed');
      }
    } finally {
      setSaving(false);
    }
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
        ) : (
          <>
            {tv ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-2">
                <div className="text-[clamp(1.5rem,6vw,3rem)] font-semibold leading-tight">{teamALabel}</div>
                <div className="text-[clamp(3rem,14vw,8rem)] font-black tracking-tight opacity-90">vs</div>
                <div className="text-[clamp(1.5rem,6vw,3rem)] font-semibold leading-tight">{teamBLabel}</div>
                {live?.state && Object.keys(live.state).length > 0 ? (
                  <pre className="text-left text-[clamp(0.75rem,2.5vw,1.1rem)] opacity-70 max-w-[90vw] overflow-x-auto">
                    {JSON.stringify(live.state, null, 0)}
                  </pre>
                ) : (
                  <div className="text-sm opacity-50">—</div>
                )}
              </div>
            ) : (
              <>
                <div
                  className={`grid gap-3 ${isLandscape ? 'grid-cols-2 flex-1' : 'grid-cols-1'}`}
                >
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-900">
                    <div className="text-xs uppercase tracking-wide opacity-60 mb-1">Team A</div>
                    <div className="text-lg font-semibold">{teamALabel}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-900">
                    <div className="text-xs uppercase tracking-wide opacity-60 mb-1">Team B</div>
                    <div className="text-lg font-semibold">{teamBLabel}</div>
                  </div>
                </div>

                <section className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-900">
                  <div className="text-sm opacity-70 mb-2">
                    {t('gameDetails.liveScore')} · rev {revision}
                  </div>
                  <label className="block text-xs opacity-60 mb-1">Demo field (synced)</label>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
                    placeholder="Note"
                  />
                  <button
                    type="button"
                    className="mt-3 w-full rounded-xl bg-primary-600 text-white py-3 text-sm font-semibold disabled:opacity-50"
                    disabled={saving}
                    onClick={() => void persistNote()}
                  >
                    {saving ? '…' : 'Save'}
                  </button>
                  {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};
