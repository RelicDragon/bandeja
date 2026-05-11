import type { LiveScoringState, LiveTeamSide } from '@/utils/liveScoring';

type LiveScoreCenterProps = {
  state: LiveScoringState;
  pointCenter: string;
  revision: number;
  saving?: boolean;
  error?: string | null;
  onConfirmGameWin: () => void;
  onCancelGameWin: () => void;
  onSetFirstServer: (side: LiveTeamSide) => void;
  onNextSet: () => void;
  canAdvanceSet: boolean;
};

export const LiveScoreCenter = ({
  state,
  pointCenter,
  revision,
  saving,
  error,
  onConfirmGameWin,
  onCancelGameWin,
  onSetFirstServer,
  onNextSet,
  canAdvanceSet,
}: LiveScoreCenterProps) => {
  const pendingSide = state.classic?.pendingGameWinConfirmSide;
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-2 text-xs opacity-60">
        <span>Live scoring on</span>
        <span>rev {revision}</span>
      </div>
      <div className="mt-5 text-center">
        <div className="text-sm uppercase tracking-wide opacity-60">Set {state.activeSetIndex + 1}</div>
        <div className="mt-1 text-3xl font-black">{state.mode === 'classic' ? pointCenter || 'Game' : 'Points'}</div>
        <div className="mt-2 text-xs opacity-60">{saving ? 'Syncing…' : 'Synced when online'}</div>
      </div>

      {pendingSide ? (
        <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <div className="text-sm font-semibold">
            Confirm game for {pendingSide === 'teamA' ? 'Team A' : 'Team B'}?
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="rounded-xl bg-amber-600 py-3 text-sm font-bold text-white" onClick={onConfirmGameWin}>
              Confirm
            </button>
            <button type="button" className="rounded-xl border border-amber-300 py-3 text-sm font-bold" onClick={onCancelGameWin}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <div className="text-xs uppercase tracking-wide opacity-60">First server</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`rounded-xl border py-3 text-sm font-semibold ${
              state.firstServerTeam === 'teamA' ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-300 dark:border-gray-700'
            }`}
            onClick={() => onSetFirstServer('teamA')}
          >
            Team A
          </button>
          <button
            type="button"
            className={`rounded-xl border py-3 text-sm font-semibold ${
              state.firstServerTeam === 'teamB' ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-300 dark:border-gray-700'
            }`}
            onClick={() => onSetFirstServer('teamB')}
          >
            Team B
          </button>
        </div>
      </div>

      <button
        type="button"
        className="mt-5 w-full rounded-2xl border border-gray-300 py-3 text-sm font-bold disabled:opacity-40 dark:border-gray-700"
        disabled={saving || !canAdvanceSet}
        onClick={onNextSet}
      >
        Next set
      </button>

      {error ? <p className="mt-4 text-xs text-red-500">{error}</p> : null}
    </section>
  );
};
