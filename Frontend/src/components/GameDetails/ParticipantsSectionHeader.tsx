import { LayoutGrid, List, Pencil, Trophy, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import type { Game } from '@/types';
import { ParticipantSetupTags } from './ParticipantSetupTags';

type ParticipantsSectionHeaderProps = {
  game: Game;
  playingCount: number;
  maxCount: number;
  viewMode: 'carousel' | 'list';
  canEditParticipantsSetup: boolean;
  onToggleViewMode: () => void;
  onEditMaxParticipants?: () => void;
};

export const ParticipantsSectionHeader = ({
  game,
  playingCount,
  maxCount,
  viewMode,
  canEditParticipantsSetup,
  onToggleViewMode,
  onEditMaxParticipants,
}: ParticipantsSectionHeaderProps) => {
  const { t } = useTranslation();
  const showLevelRange =
    typeof game.minLevel === 'number' &&
    typeof game.maxLevel === 'number' &&
    game.entityType !== 'BAR';
  const isBar = game.entityType === 'BAR';
  const isFull = !isBar && maxCount > 0 && playingCount >= maxCount;
  const fillRatio = isBar ? 1 : maxCount > 0 ? Math.min(playingCount / maxCount, 1) : 0;
  const fillPercent = Math.round(fillRatio * 100);

  return (
    <div className="mb-2 space-y-2">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/50 dark:text-primary-400">
          {showLevelRange ? <Trophy size={18} /> : <Users size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h2 className="section-title">
              {showLevelRange
                ? `${t('games.level')} ${game.minLevel!.toFixed(1)}–${game.maxLevel!.toFixed(1)}`
                : t('games.participants')}
            </h2>
            <ParticipantSetupTags
              game={game}
              canEdit={canEditParticipantsSetup}
              onEditMaxParticipants={onEditMaxParticipants}
            />
          </div>
          {!isBar && (
            <p
              className={`mt-0.5 text-xs ${
                isFull
                  ? 'font-medium text-green-600 dark:text-green-400'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {playingCount === maxCount
                ? t('games.participantsFull')
                : t('games.participantsSpotsLeft', { count: maxCount - playingCount })}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800/80">
            <button
              type="button"
              onClick={() => viewMode !== 'carousel' && onToggleViewMode()}
              className={`rounded-md p-1.5 transition-all duration-200 ${
                viewMode === 'carousel'
                  ? 'bg-white text-primary-600 shadow-sm dark:bg-gray-900 dark:text-primary-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              title={t('games.carouselView', { defaultValue: 'Carousel view' })}
              aria-pressed={viewMode === 'carousel'}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => viewMode !== 'list' && onToggleViewMode()}
              className={`rounded-md p-1.5 transition-all duration-200 ${
                viewMode === 'list'
                  ? 'bg-white text-primary-600 shadow-sm dark:bg-gray-900 dark:text-primary-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              title={t('games.listView', { defaultValue: 'List view' })}
              aria-pressed={viewMode === 'list'}
            >
              <List size={16} />
            </button>
          </div>
          {canEditParticipantsSetup && onEditMaxParticipants ? (
            <motion.button
              type="button"
              onClick={onEditMaxParticipants}
              whileTap={{ scale: 0.96 }}
              className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-primary-600/25 transition-colors hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
            >
              <Pencil size={13} />
              {playingCount}/{maxCount}
            </motion.button>
          ) : (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {isBar ? playingCount : `${playingCount}/${maxCount}`}
            </span>
          )}
        </div>
      </div>
      {!isBar && maxCount > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <motion.div
            className={`h-full rounded-full bg-gradient-to-r ${
              isFull
                ? 'from-green-400 to-green-600 dark:from-green-500 dark:to-green-400'
                : 'from-primary-400 to-primary-600 dark:from-primary-500 dark:to-primary-400'
            }`}
            initial={false}
            animate={{ width: `${fillPercent}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
      )}
    </div>
  );
};
