import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { PairEntry } from '@/api/pairs';
import { ChemistryChip } from './ChemistryChip';
import { PairAvatars } from './PairAvatars';
import {
  memberDisplayName,
  pairDisplayName,
  pairSummaryLine,
  usePairFormatters,
} from './pairFormat';

export interface PairRowProps {
  entry: PairEntry;
  onOpen: (entry: PairEntry) => void;
  /** Set briefly after "scroll to my pair" so the row flashes. */
  flashing?: boolean;
}

/**
 * One row of the pairs leaderboard.
 *
 * Memoised on purpose: this is a hot list and the only things that change per
 * render are the flash flag and the entry itself. The tap target is a single
 * button; the chemistry chip is a sibling, never a nested button.
 *
 * The viewer's own pairs get a soft sky **inline-start** border (`border-s`),
 * so `ar` puts it on the right edge where the row actually starts.
 */
export const PairRow = memo(({ entry, onOpen, flashing = false }: PairRowProps) => {
  const { t } = useTranslation();
  const formatters = usePairFormatters();
  // "Find my pair" flashes the row. Reduced motion keeps the tint that says
  // *which* row was found and drops the infinite opacity pulse (CONTRACT §7.1).
  const reducedMotion = usePrefersReducedMotion();

  const nameA = memberDisplayName(entry.userA);
  const nameB = memberDisplayName(entry.userB);
  const displayNames = pairDisplayName(nameA, nameB);
  const spokenNames = t('pairs.names.spoken', { first: nameA, second: nameB });
  const gamesLabel = t('pairs.gamesCount', { count: entry.games });

  const ariaLabel =
    entry.chemistry === null
      ? t('pairs.aria.rowNoChemistry', {
          rank: formatters.count(entry.rank),
          names: spokenNames,
          games: gamesLabel,
          winRate: formatters.percentNumber(entry.winRate),
        })
      : t('pairs.aria.row', {
          rank: formatters.count(entry.rank),
          names: spokenNames,
          games: gamesLabel,
          winRate: formatters.percentNumber(entry.winRate),
          chemistry: formatters.signed(entry.chemistry),
        });

  return (
    <li
      data-pair-id={entry.pairId}
      data-testid="pair-row"
      className={`flex items-center gap-1 rounded-xl transition-colors ${
        entry.isViewerPair
          ? 'border-s-4 border-s-sky-300 bg-sky-50/60 dark:border-s-sky-500/70 dark:bg-sky-500/10'
          : 'border-s-4 border-s-transparent'
      } ${
        flashing
          ? `bg-sky-100 dark:bg-sky-500/20 ${reducedMotion ? '' : 'animate-pulse'}`
          : ''
      }`.trim()}
    >
      <button
        type="button"
        onClick={() => onOpen(entry)}
        aria-label={ariaLabel}
        className="flex min-h-[3.5rem] min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-2 text-start transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-gray-800/60"
      >
        <span
          aria-hidden
          className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-gray-500 dark:text-gray-400"
        >
          {formatters.count(entry.rank)}
        </span>
        <PairAvatars userA={entry.userA} userB={entry.userB} size={40} overlap={24} />
        <span className="flex min-w-0 flex-1 flex-col" aria-hidden>
          <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {displayNames}
          </span>
          <span className="truncate text-xs text-gray-500 dark:text-gray-400">
            {pairSummaryLine(gamesLabel, formatters.percent(entry.winRate))}
          </span>
        </span>
      </button>
      <ChemistryChip
        userAId={entry.userA.id}
        userBId={entry.userB.id}
        chemistry={entry.chemistry}
        className="me-1 shrink-0"
      />
    </li>
  );
});

PairRow.displayName = 'PairRow';
