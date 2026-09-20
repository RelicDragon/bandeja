import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import type { PairEntry } from '@/api/pairs';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CountUpNumber } from '@/components/ui/CountUpNumber';
import { PairAvatars, type PairAvatarsRing } from './PairAvatars';
import { memberDisplayName, usePairFormatters } from './pairFormat';

export interface PairPodiumProps {
  /** Already ordered; only the first three are drawn. */
  pairs: PairEntry[];
  onOpen: (entry: PairEntry) => void;
}

const RINGS: PairAvatarsRing[] = ['gold', 'silver', 'bronze'];
/** 1st is tallest. Heights are inline styles so the ratio holds at 375 px. */
const HEIGHTS = [124, 108, 96];
const STAGGER_MS = 80;

/**
 * The top three pairs, tallest first.
 *
 * Cards are buttons and read "Number 1, Marko and Ana, 72 percent win rate,
 * 18 games". They rise into place with an 80 ms staggered spring; under
 * reduced motion they are simply there, with no stagger and no transform.
 */
export const PairPodium = memo(({ pairs, onOpen }: PairPodiumProps) => {
  const { t } = useTranslation();
  const formatters = usePairFormatters();
  const prefersReducedMotion = usePrefersReducedMotion();

  const top = pairs.slice(0, 3);
  if (top.length === 0) return null;

  return (
    <ol className="flex items-end justify-center gap-2" data-testid="pair-podium">
      {top.map((entry, index) => {
        const nameA = memberDisplayName(entry.userA);
        const nameB = memberDisplayName(entry.userB);
        const gamesLabel = t('pairs.gamesCount', { count: entry.games });

        return (
          <li key={entry.pairId} className="flex min-w-0 flex-1 justify-center">
            <motion.button
              type="button"
              data-testid="pair-podium-card"
              data-pair-id={entry.pairId}
              onClick={() => onOpen(entry)}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : {
                      type: 'spring',
                      stiffness: 260,
                      damping: 24,
                      delay: (index * STAGGER_MS) / 1000,
                    }
              }
              style={{ height: HEIGHTS[index] }}
              className={`flex w-full min-w-0 flex-col items-center justify-end gap-1 rounded-2xl border px-1.5 pb-2 pt-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                entry.isViewerPair
                  ? 'border-sky-300 bg-sky-50 dark:border-sky-500/60 dark:bg-sky-500/10'
                  : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
              }`}
              aria-label={t('pairs.aria.podium', {
                rank: formatters.count(entry.rank),
                names: t('pairs.names.spoken', { first: nameA, second: nameB }),
                winRate: formatters.percentNumber(entry.winRate),
                games: gamesLabel,
              })}
            >
              <PairAvatars
                userA={entry.userA}
                userB={entry.userB}
                size={index === 0 ? 40 : 34}
                overlap={index === 0 ? 16 : 14}
                ring={RINGS[index]}
              />
              <span
                className="line-clamp-2 min-w-0 text-[11px] font-medium leading-tight text-gray-700 dark:text-gray-200"
                aria-hidden
              >
                {nameA}
                <br />
                {nameB}
              </span>
              <span
                className="text-lg font-bold leading-none tabular-nums text-gray-900 dark:text-white"
                aria-hidden
              >
                <CountUpNumber value={entry.winRate} format={formatters.percent} />
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400" aria-hidden>
                {gamesLabel}
              </span>
            </motion.button>
          </li>
        );
      })}
    </ol>
  );
});

PairPodium.displayName = 'PairPodium';
