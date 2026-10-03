import { Pencil, Trophy, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import type { Game } from '@/types';
import { ParticipantSetupTags } from '../ParticipantSetupTags';

/**
 * Title, setup tags and the seat count. The fill bar that used to live here is
 * the seat strip now — it also carries who is coming.
 */
export function RosterHeader({
  game,
  playingCount,
  canEditParticipantsSetup,
  onEditMaxParticipants,
  subline,
}: {
  game: Game;
  playingCount: number;
  canEditParticipantsSetup: boolean;
  onEditMaxParticipants?: () => void;
  /** Overrides the "N spots left" line (ledger mode). */
  subline?: string;
}) {
  const { t } = useTranslation();
  const maxCount = game.maxParticipants;
  const showLevelRange =
    typeof game.minLevel === 'number' && typeof game.maxLevel === 'number' && game.entityType !== 'BAR';
  const isBar = game.entityType === 'BAR';
  const isFull = !isBar && maxCount > 0 && playingCount >= maxCount;
  const editable = canEditParticipantsSetup && Boolean(onEditMaxParticipants);

  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/50 dark:text-primary-400">
        {showLevelRange ? <Trophy size={18} aria-hidden /> : <Users size={18} aria-hidden />}
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
        {subline ? (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subline}</p>
        ) : !isBar ? (
          <p
            className={`mt-0.5 text-xs ${
              isFull ? 'font-medium text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {isFull
              ? t('games.participantsFull')
              : t('games.participantsSpotsLeft', { count: maxCount - playingCount })}
          </p>
        ) : null}
      </div>
      {editable ? (
        <motion.button
          type="button"
          onClick={onEditMaxParticipants}
          whileTap={{ scale: 0.96 }}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary-600 px-2.5 py-1.5 text-xs font-semibold tabular-nums text-white shadow-sm shadow-primary-600/25 transition-colors hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
        >
          <Pencil size={13} aria-hidden />
          {playingCount}/{maxCount}
        </motion.button>
      ) : (
        <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {isBar ? playingCount : `${playingCount}/${maxCount}`}
        </span>
      )}
    </div>
  );
}
