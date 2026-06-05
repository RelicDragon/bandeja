import { PlayerAvatar } from '@/components';
import type { BasicUser } from '@/types';
import type { LiveTeamSide } from '@/utils/liveScoring';
import { SERVE_GOLDEN_HIGHLIGHT, SERVE_SETUP_SELECTED, SERVE_SETUP_UNSELECTED } from './serveCourtHighlight';

function lineName(p: BasicUser): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id;
}

type LiveServeSetupTeamCardProps = {
  side: LiveTeamSide;
  label: string;
  players: BasicUser[];
  selected: boolean;
  singlesMode?: boolean;
  /** When set, golden ring on this roster row (first server in doubles). */
  servingPlayerIndex?: number | null;
  onSelect: () => void;
};

export function LiveServeSetupTeamCard({
  side,
  label,
  players,
  selected,
  singlesMode = false,
  servingPlayerIndex = null,
  onSelect,
}: LiveServeSetupTeamCardProps) {
  const roster = players.length ? players : [null];
  const solo = singlesMode && roster.length === 1 && roster[0];
  const displayLabel = solo ? lineName(roster[0]!) : label;

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={displayLabel}
      onClick={onSelect}
      className={`group flex w-full min-w-0 overflow-hidden rounded-2xl border text-left shadow-sm transition-all active:scale-[0.99] ${
        selected ? SERVE_SETUP_SELECTED : `${SERVE_SETUP_UNSELECTED} hover:shadow-md`
      }`}
    >
      {!solo ? (
        <span
          className={`flex w-7 shrink-0 items-center justify-center border-r ${
            selected
              ? 'border-amber-200/80 bg-amber-100/70 dark:border-amber-800/60 dark:bg-amber-950/60'
              : 'border-gray-200/80 bg-gray-50/90 dark:border-gray-700/80 dark:bg-gray-800/50'
          }`}
        >
          <span
            className={`select-none whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.18em] [writing-mode:vertical-lr] rotate-180 ${
              selected ? 'text-amber-800 dark:text-amber-200' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {label}
          </span>
        </span>
      ) : null}
      <div className={`flex min-w-0 flex-1 flex-col justify-center gap-1 ${solo ? 'px-3 py-3' : 'px-2 py-2'}`}>
        {roster.map((p, i) => (
          <div key={p?.id ?? `empty-${side}-${i}`} className="flex min-w-0 items-center gap-2">
            <div
              className={`flex shrink-0 items-center justify-center overflow-visible ${solo ? 'h-9 w-9' : 'h-7 w-7'} ${servingPlayerIndex === i ? `rounded-full ${SERVE_GOLDEN_HIGHLIGHT}` : ''}`}
            >
              <PlayerAvatar
                player={p}
                showName={false}
                inlineFace
                inlineFacePlain
                inlineFaceSize={solo ? 'md' : 'sm'}
                asDiv
                subscribePresence={false}
              />
            </div>
            {!solo ? (
              <span
                className={`min-w-0 flex-1 truncate text-xs leading-tight ${
                  selected ? 'font-semibold text-amber-900 dark:text-amber-100' : 'font-medium text-gray-800 dark:text-gray-100'
                }`}
              >
                {p ? lineName(p) : '—'}
              </span>
            ) : (
              <span
                className={`min-w-0 flex-1 truncate text-sm leading-tight ${
                  selected ? 'font-bold text-amber-900 dark:text-amber-100' : 'font-semibold text-gray-800 dark:text-gray-100'
                }`}
              >
                {displayLabel}
              </span>
            )}
          </div>
        ))}
      </div>
    </button>
  );
}
