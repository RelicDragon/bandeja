import { PlayerAvatar } from '@/components';
import type { BasicUser } from '@/types';
import type { LiveTeamSide } from '@/utils/liveScoring';

function lineName(p: BasicUser): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id;
}

type LiveServeSetupTeamCardProps = {
  side: LiveTeamSide;
  label: string;
  players: BasicUser[];
  selected: boolean;
  onSelect: () => void;
};

export function LiveServeSetupTeamCard({ side, label, players, selected, onSelect }: LiveServeSetupTeamCardProps) {
  const roster = players.length ? players : [null];

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onSelect}
      className={`group flex w-full min-w-0 overflow-hidden rounded-2xl border text-left shadow-sm transition-all active:scale-[0.99] ${
        selected
          ? 'border-primary-500/80 bg-gradient-to-br from-primary-50 via-white to-primary-50/60 ring-2 ring-primary-500/25 dark:border-primary-500/50 dark:from-primary-950/50 dark:via-gray-900 dark:to-primary-950/30 dark:ring-primary-400/20'
          : 'border-gray-200/90 bg-white hover:border-gray-300 hover:shadow-md dark:border-gray-700/90 dark:bg-gray-900/80 dark:hover:border-gray-600'
      }`}
    >
      <span
        className={`flex w-7 shrink-0 items-center justify-center border-r ${
          selected
            ? 'border-primary-200/80 bg-primary-100/70 dark:border-primary-800/60 dark:bg-primary-950/60'
            : 'border-gray-200/80 bg-gray-50/90 dark:border-gray-700/80 dark:bg-gray-800/50'
        }`}
      >
        <span
          className={`select-none whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.18em] [writing-mode:vertical-lr] rotate-180 ${
            selected ? 'text-primary-800 dark:text-primary-200' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {label}
        </span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-2 py-2">
        {roster.map((p, i) => (
          <div key={p?.id ?? `empty-${side}-${i}`} className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-visible">
              <PlayerAvatar
                player={p}
                showName={false}
                inlineFace
                inlineFacePlain
                inlineFaceSize="sm"
                asDiv
                subscribePresence={false}
              />
            </div>
            <span
              className={`min-w-0 flex-1 truncate text-xs leading-tight ${
                selected ? 'font-semibold text-gray-900 dark:text-gray-50' : 'font-medium text-gray-800 dark:text-gray-100'
              }`}
            >
              {p ? lineName(p) : '—'}
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}
