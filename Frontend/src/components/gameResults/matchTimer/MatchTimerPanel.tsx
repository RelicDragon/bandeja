import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Pause, Play, RotateCcw, Square } from 'lucide-react';
import type { Match } from '@/types/gameResults';
import type { Game } from '@/types';
import {
  formatMatchTimerMs,
  isGameMatchTimerEnabled,
  liveElapsedMs,
  type MatchTimerAction,
} from '@/utils/matchTimer';

type GameTimerFields = Pick<Game, 'scoringPreset' | 'matchTimedCapMinutes'>;

interface MatchTimerPanelProps {
  match: Match;
  game: GameTimerFields;
  roundId: string;
  gameId: string;
  canControl: boolean;
  onTransition: (roundId: string, matchId: string, action: MatchTimerAction) => void | Promise<void>;
}

export function MatchTimerPanel({
  match,
  game,
  roundId,
  gameId,
  canControl,
  onTransition,
}: MatchTimerPanelProps) {
  const { t } = useTranslation('gameResults');
  const [, setTick] = useState(0);
  const capToastRef = useRef(false);

  useEffect(() => {
    if (match.timer?.status !== 'RUNNING') return;
    const id = window.setInterval(() => setTick((x) => x + 1), 500);
    return () => window.clearInterval(id);
  }, [match.timer?.status, match.id]);

  useEffect(() => {
    if (match.timer?.capJustNotified) {
      if (!capToastRef.current) {
        capToastRef.current = true;
        toast.error(t('matchTimer.capReached'));
      }
    } else {
      capToastRef.current = false;
    }
  }, [match.timer?.capJustNotified, t]);

  if (!gameId || !isGameMatchTimerEnabled(game)) return null;

  const snap = match.timer;
  const now = Date.now();
  const elapsed = snap ? liveElapsedMs(snap, now) : 0;
  const capMs = (game.matchTimedCapMinutes ?? 0) * 60_000;
  const overCap = capMs > 0 && elapsed >= capMs && snap?.status === 'RUNNING';

  const run = useCallback(
    (a: MatchTimerAction) => {
      void onTransition(roundId, match.id, a);
    },
    [onTransition, roundId, match.id]
  );

  const st = snap?.status ?? 'IDLE';

  return (
    <div
      className="mb-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200/80 bg-zinc-50/90 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900/50"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`font-mono tabular-nums tracking-tight ${overCap ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-zinc-800 dark:text-zinc-100'}`}
      >
        {formatMatchTimerMs(elapsed)}
        {capMs > 0 ? (
          <span className="ml-1 font-normal text-zinc-500 dark:text-zinc-400">
            / {formatMatchTimerMs(capMs)}
          </span>
        ) : null}
      </div>
      {canControl ? (
        <div className="flex items-center gap-0.5">
          {(st === 'IDLE' || st === 'STOPPED') && (
            <button
              type="button"
              title={t('matchTimer.start')}
              onClick={() => run('start')}
              className="rounded-md p-1.5 text-emerald-600 transition hover:bg-emerald-500/10 dark:text-emerald-400"
            >
              <Play className="h-4 w-4" fill="currentColor" />
            </button>
          )}
          {st === 'RUNNING' && (
            <>
              <button
                type="button"
                title={t('matchTimer.pause')}
                onClick={() => run('pause')}
                className="rounded-md p-1.5 text-amber-600 transition hover:bg-amber-500/10 dark:text-amber-400"
              >
                <Pause className="h-4 w-4" />
              </button>
              <button
                type="button"
                title={t('matchTimer.stop')}
                onClick={() => run('stop')}
                className="rounded-md p-1.5 text-zinc-600 transition hover:bg-zinc-500/10 dark:text-zinc-300"
              >
                <Square className="h-4 w-4" />
              </button>
            </>
          )}
          {st === 'PAUSED' && (
            <>
              <button
                type="button"
                title={t('matchTimer.resume')}
                onClick={() => run('resume')}
                className="rounded-md p-1.5 text-emerald-600 transition hover:bg-emerald-500/10 dark:text-emerald-400"
              >
                <Play className="h-4 w-4" fill="currentColor" />
              </button>
              <button
                type="button"
                title={t('matchTimer.stop')}
                onClick={() => run('stop')}
                className="rounded-md p-1.5 text-zinc-600 transition hover:bg-zinc-500/10 dark:text-zinc-300"
              >
                <Square className="h-4 w-4" />
              </button>
            </>
          )}
          {st !== 'IDLE' && (
            <button
              type="button"
              title={t('matchTimer.reset')}
              onClick={() => run('reset')}
              className="rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-500/10 dark:text-zinc-400"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
