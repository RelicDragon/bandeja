import { PlayerAvatar } from '@/components';
import type { BasicUser } from '@/types';
import { SERVE_GOLDEN_HIGHLIGHT, SERVE_SETUP_SELECTED, SERVE_SETUP_UNSELECTED } from './serveCourtHighlight';

function lineName(p: BasicUser): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id;
}

type LiveServeSetupPlayerOptionProps = {
  player: BasicUser;
  selected: boolean;
  onSelect: () => void;
};

export function LiveServeSetupPlayerOption({ player, selected, onSelect }: LiveServeSetupPlayerOptionProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={lineName(player)}
      onClick={onSelect}
      className={`flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-xl border px-2 py-1.5 text-left transition-all active:scale-[0.99] ${
        selected ? SERVE_SETUP_SELECTED : SERVE_SETUP_UNSELECTED
      }`}
    >
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center overflow-visible ${selected ? `rounded-full ${SERVE_GOLDEN_HIGHLIGHT}` : ''}`}
      >
        <PlayerAvatar
          player={player}
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
          selected ? 'font-semibold text-amber-900 dark:text-amber-100' : 'font-medium text-gray-800 dark:text-gray-100'
        }`}
      >
        {lineName(player)}
      </span>
    </button>
  );
}
