import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus, UserRound } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { rowStatusLabelKey, type RosterRowModel } from './rosterModel';
import { RosterAvatar } from './RosterAvatar';
import { STATUS_TONE } from './rosterTones';

/**
 * Two seats read as a matchup, not as a half-empty list: two faces with "vs"
 * between them, each with its attendance dot and answer. Replaces the seat strip.
 */

function Side({
  row,
  index,
  canInvite,
  onInvite,
  onLegend,
}: {
  row: RosterRowModel | undefined;
  index: number;
  canInvite: boolean;
  onInvite?: () => void;
  onLegend?: () => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const enter = {
    initial: reduceMotion ? false : ({ opacity: 0, x: index === 0 ? -12 : 12 } as const),
    animate: { opacity: 1, x: 0 },
    transition: reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 260, damping: 24 },
  };

  if (!row) {
    const content = (
      <>
        <span
          className={`flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-dashed ${
            canInvite
              ? 'border-primary-300 bg-primary-50 text-primary-500 dark:border-primary-700 dark:bg-primary-950/40 dark:text-primary-400'
              : 'border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'
          }`}
        >
          {canInvite ? <Plus size={20} aria-hidden /> : <UserRound size={20} aria-hidden />}
        </span>
        <span className="mt-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
          {canInvite ? t('games.invitePlayer') : t('spots.roster.openSpot')}
        </span>
      </>
    );
    return (
      <motion.div {...enter} className="flex min-w-0 flex-1 flex-col items-center">
        {canInvite && onInvite ? (
          <button type="button" onClick={onInvite} className="flex min-h-11 flex-col items-center">
            {content}
          </button>
        ) : (
          content
        )}
      </motion.div>
    );
  }

  return (
    <motion.div {...enter} className="flex min-w-0 flex-1 flex-col items-center text-center">
      <RosterAvatar
        user={row.user}
        attendance={row.attendance}
        isCurrentUser={row.isViewer}
        size="lg"
        onLegend={onLegend}
      />
      <p className="mt-1.5 max-w-full truncate text-sm font-semibold text-gray-900 dark:text-white">
        {row.isViewer ? t('attendance.roster.you') : row.user.firstName}
      </p>
      {row.attendance ? (
        <p className={`text-[11px] ${STATUS_TONE[row.attendance]}`}>
          {t(rowStatusLabelKey(row) ?? '')}
        </p>
      ) : null}
    </motion.div>
  );
}

export function RosterFaceOff({
  rows,
  canInvite,
  onInvite,
  onLegend,
}: {
  rows: RosterRowModel[];
  canInvite: boolean;
  onInvite?: () => void;
  onLegend?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 flex items-start gap-2 rounded-2xl bg-gradient-to-b from-gray-50 to-transparent px-2 pb-1 pt-3 dark:from-gray-800/60">
      <Side row={rows[0]} index={0} canInvite={canInvite} onInvite={onInvite} onLegend={onLegend} />
      <span
        aria-hidden
        className="mt-4 shrink-0 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500"
      >
        {t('gameResults.vs')}
      </span>
      <Side row={rows[1]} index={1} canInvite={canInvite} onInvite={onInvite} onLegend={onLegend} />
    </div>
  );
}
