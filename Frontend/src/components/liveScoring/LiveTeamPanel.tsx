import type { LiveTeamSide } from '@/utils/liveScoring';

type LiveTeamPanelProps = {
  side: LiveTeamSide;
  label: string;
  games: number;
  point?: string;
  tv?: boolean;
  disabled?: boolean;
  onScore?: (side: LiveTeamSide) => void;
  onUndo?: (side: LiveTeamSide) => void;
};

export const LiveTeamPanel = ({ side, label, games, point, tv, disabled, onScore, onUndo }: LiveTeamPanelProps) => {
  const sideLabel = side === 'teamA' ? 'Team A' : 'Team B';
  return (
    <section
      className={
        tv
          ? 'flex min-h-0 flex-1 flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-white/5 p-5 text-center'
          : 'flex min-h-[12rem] flex-col rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900'
      }
    >
      <div className={tv ? 'text-sm uppercase tracking-[0.3em] text-white/50' : 'text-xs uppercase tracking-wide opacity-60'}>
        {sideLabel}
      </div>
      <div className={tv ? 'mt-3 text-[clamp(1.4rem,5vw,4rem)] font-black leading-tight' : 'mt-2 text-xl font-bold'}>
        {label}
      </div>
      <div className="mt-auto flex w-full items-end justify-center gap-4 pt-6">
        <div>
          <div className={tv ? 'text-[clamp(4rem,16vw,13rem)] font-black leading-none' : 'text-7xl font-black leading-none'}>
            {games}
          </div>
          {point ? (
            <div className={tv ? 'mt-2 text-[clamp(1.7rem,5vw,5rem)] font-bold text-white/80' : 'mt-2 text-3xl font-bold'}>
              {point}
            </div>
          ) : null}
        </div>
      </div>
      {!tv ? (
        <div className="mt-5 grid w-full grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            className="rounded-2xl bg-primary-600 py-5 text-lg font-black text-white active:scale-[0.99] disabled:opacity-50"
            disabled={disabled}
            onClick={() => onScore?.(side)}
          >
            + Point
          </button>
          <button
            type="button"
            className="rounded-2xl border border-gray-300 px-4 text-sm font-semibold dark:border-gray-700"
            disabled={disabled}
            onClick={() => onUndo?.(side)}
          >
            Undo
          </button>
        </div>
      ) : null}
    </section>
  );
};
