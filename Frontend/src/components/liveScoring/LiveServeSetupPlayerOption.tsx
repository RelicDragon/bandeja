import { PlayerAvatar } from '@/components';
import type { BasicUser } from '@/types';

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
        selected
          ? 'border-primary-500/80 bg-gradient-to-br from-primary-50 via-white to-primary-50/60 ring-2 ring-primary-500/25 dark:border-primary-500/50 dark:from-primary-950/50 dark:via-gray-900 dark:to-primary-950/30 dark:ring-primary-400/20'
          : 'border-gray-200/90 bg-white hover:border-gray-300 dark:border-gray-700/90 dark:bg-gray-900/80 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-visible">
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
          selected ? 'font-semibold text-gray-900 dark:text-gray-50' : 'font-medium text-gray-800 dark:text-gray-100'
        }`}
      >
        {lineName(player)}
      </span>
    </button>
  );
}
