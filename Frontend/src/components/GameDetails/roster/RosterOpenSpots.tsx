import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { UserPlus, UserRound } from 'lucide-react';
import { OpenSpotRow } from '@/features/spot-opened/OpenSpotRow';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { OPEN_SPOT_ROW_LIMIT } from './rosterModel';

/**
 * PRD 347 — a freed PLAYING seat is a visible hole in the roster, for every
 * viewer. Someone who can invite gets one "Invite player" row carrying the
 * count; everyone else sees up to {@link OPEN_SPOT_ROW_LIMIT} dashed rows, or
 * one summarising line beyond that.
 */
export function RosterOpenSpots({
  count,
  onInvite,
}: {
  count: number;
  onInvite?: () => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  if (count <= 0) return null;

  if (onInvite) {
    return (
      <motion.li
        layout={!reduceMotion}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        className="list-none"
      >
        <button
          type="button"
          onClick={onInvite}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl border-2 border-dashed border-primary-300 bg-primary-50/70 p-2 text-start transition-colors hover:border-primary-400 hover:bg-primary-100/70 active:scale-[0.99] dark:border-primary-700 dark:bg-primary-950/30 dark:hover:bg-primary-900/30"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/60 dark:text-primary-300">
            <UserPlus size={16} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-primary-700 dark:text-primary-300">
              {t('games.invitePlayer')}
            </span>
            <span className="block text-[11px] text-primary-600/80 dark:text-primary-400/80">
              {t('games.participantsSpotsLeft', { count })}
            </span>
          </span>
        </button>
      </motion.li>
    );
  }

  if (count <= OPEN_SPOT_ROW_LIMIT) {
    return (
      <>
        {Array.from({ length: count }, (_, slot) => (
          <li key={`open-spot-${slot}`} className="list-none">
            <OpenSpotRow index={slot} />
          </li>
        ))}
      </>
    );
  }

  return (
    <li className="flex min-h-11 list-none items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 p-2 dark:border-gray-600">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500"
      >
        <UserRound size={16} />
      </span>
      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {t('games.participantsSpotsLeft', { count })}
      </span>
    </li>
  );
}
