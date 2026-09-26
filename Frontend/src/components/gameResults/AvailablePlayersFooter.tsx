import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Search, Wand2 } from 'lucide-react';
import { PlayerAvatar } from '@/components';
import { BasicUser } from '@/types';
import { Match } from '@/types/gameResults';
import type { ResultsTeam } from '@/utils/resultsBoardNavigation';

interface TrayDragHandlers {
  onDragStart: (e: React.DragEvent, playerId: string) => void;
  onDragEnd: () => void;
  onTouchStart: (e: TouchEvent, playerId: string) => void;
  onTouchMove: (e: TouchEvent) => void;
  /** Returns true when the touch was a drag, so the tap that follows is ignored. */
  onTouchEnd: (e: TouchEvent) => boolean;
}

interface AvailablePlayersFooterProps extends TrayDragHandlers {
  /** Roster players not yet placed anywhere in this round. */
  availablePlayers: BasicUser[];
  editingMatch: Match;
  maxPlayersPerTeam: number;
  draggedPlayer: string | null;
  targetTeam: ResultsTeam | null;
  onTargetTeamChange: (team: ResultsTeam) => void;
  onPlace: (playerId: string) => void;
  onAutoFill: () => void;
  onSearch: () => void;
}

const TrayPlayer = ({
  player,
  isDragged,
  onPlace,
  onDragStart,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: TrayDragHandlers & { player: BasicUser; isDragged: boolean; onPlace: (playerId: string) => void }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = (e: TouchEvent) => {
      suppressClickRef.current = false;
      onTouchStart(e, player.id);
    };
    const move = (e: TouchEvent) => onTouchMove(e);
    const end = (e: TouchEvent) => {
      if (onTouchEnd(e)) suppressClickRef.current = true;
    };
    el.addEventListener('touchstart', start, { passive: true });
    // Not passive: a started drag cancels the page scroll.
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [player.id, onTouchStart, onTouchMove, onTouchEnd]);

  const label = player.firstName || player.lastName || '—';

  return (
    <button
      ref={ref}
      type="button"
      draggable
      onDragStart={(e) => onDragStart(e, player.id)}
      onDragEnd={onDragEnd}
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        onPlace(player.id);
      }}
      aria-label={[player.firstName, player.lastName].filter(Boolean).join(' ') || label}
      className={`flex w-[4.25rem] shrink-0 flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-[transform,opacity] active:scale-95 ${
        isDragged ? 'opacity-40' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
      }`}
    >
      <PlayerAvatar player={player} asDiv smallLayout fullHideName showName={false} draggable={false} />
      <span className="w-full truncate text-center text-[11px] font-medium text-gray-700 dark:text-gray-200">
        {label}
      </span>
    </button>
  );
};

export const AvailablePlayersFooter = ({
  availablePlayers,
  editingMatch,
  maxPlayersPerTeam,
  draggedPlayer,
  targetTeam,
  onTargetTeamChange,
  onPlace,
  onAutoFill,
  onSearch,
  ...dragHandlers
}: AvailablePlayersFooterProps) => {
  const { t } = useTranslation();

  const teamTabs: { id: ResultsTeam; label: string }[] = [
    { id: 'teamA', label: t('gameResults.teamA') },
    { id: 'teamB', label: t('gameResults.teamB') },
  ];

  return createPortal(
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl rounded-t-3xl border-t border-gray-200/60 bg-white/95 shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.25)] backdrop-blur-md dark:border-gray-700/60 dark:bg-gray-800/95"
      data-results-player-tray
      // Portal clicks bubble to the board, which treats outside taps as "done editing".
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-gray-300/80 dark:bg-gray-600" />
      <div className="flex items-center gap-2 px-4 pt-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-gray-800 dark:text-gray-100">
            {t('gameResults.tapToPlace')}
          </p>
          <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
            {t('gameResults.availableCount', { number: availablePlayers.length })}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label={t('gameResults.tapToPlace')}
          className="flex shrink-0 rounded-full bg-gray-100 p-0.5 dark:bg-gray-700/70"
        >
          {teamTabs.map((tab) => {
            const full = editingMatch[tab.id].length >= maxPlayersPerTeam;
            const active = targetTeam === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={full}
                onClick={() => onTargetTeamChange(tab.id)}
                className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors disabled:opacity-35 ${
                  active
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="scrollbar-hide mt-1 flex gap-1 overflow-x-auto overscroll-x-contain px-3 pt-1 [-webkit-overflow-scrolling:touch]">
        {availablePlayers.map((player) => (
          <TrayPlayer
            key={player.id}
            player={player}
            isDragged={draggedPlayer === player.id}
            onPlace={onPlace}
            {...dragHandlers}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5">
        <button
          type="button"
          onClick={onSearch}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 active:scale-95 dark:text-gray-300 dark:hover:bg-gray-700/60"
        >
          <Search size={16} aria-hidden />
          {t('common.search')}
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onAutoFill}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary-50 px-3.5 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 active:scale-95 dark:bg-primary-950/40 dark:text-primary-300 dark:hover:bg-primary-900/50"
        >
          <Wand2 size={16} aria-hidden />
          {t('gameResults.autoFill')}
        </button>
      </div>
    </motion.div>,
    document.body
  );
};
