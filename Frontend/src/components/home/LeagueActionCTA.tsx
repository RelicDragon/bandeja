import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Trophy } from 'lucide-react';
import type { Game } from '@/types';
import { AnimatedMount } from '@/components/motion/AnimatedMount';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { YourLeaguesHomeSection } from './YourLeaguesHomeSection';

interface LeagueActionCTAProps {
  /** The user's games array — hubs are derived from this (no leagues store). */
  games: Game[];
  gamesUnreadCounts?: Record<string, number>;
  /** Number of active league-season hubs (panelCounts.leagues). */
  leagueCount: number;
}

/**
 * Animated, earned league CTA for the My-tab action grid.
 *
 * - Collapsed: a button with an attention-grabbing pulse + two expanding rings
 *   (same recipe as `SubscriptionsNudgeButton`). Rings stop once expanded.
 * - Tap: animately expands {@link YourLeaguesHomeSection} inline using the
 *   canonical panel transition; chevron rotates 180°.
 *
 * Rendered by the grid only when `leagueCount > 0` — there is no empty state.
 */
export function LeagueActionCTA({ games, gamesUnreadCounts, leagueCount }: LeagueActionCTAProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const panelTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.21, 0.47, 0.32, 0.98] as const };

  return (
    <div className="mb-3">
      <AnimatedMount layout>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="my-tab-leagues-panel"
          data-testid="play-leagues-cta"
          className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-amber-500/5 px-4 py-3 text-start shadow-sm transition-all hover:border-amber-500/70 hover:shadow-md active:scale-[0.99] dark:border-amber-500/30 dark:from-amber-500/15 dark:to-amber-500/5"
        >
          <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center text-amber-600 dark:text-amber-400">
            {!expanded && !reduceMotion && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="absolute h-9 w-9 rounded-full border-2 border-current opacity-0 animate-ring-1" />
                <div className="absolute h-9 w-9 rounded-full border-2 border-current opacity-0 animate-ring-2" />
              </div>
            )}
            {!expanded && !reduceMotion && (
              <Trophy className="h-5 w-5 animate-bell-pulse relative z-10" strokeWidth={2.5} />
            )}
            {(expanded || reduceMotion) && (
              <Trophy className="h-5 w-5 relative z-10" strokeWidth={2.5} />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight text-foreground">
              {t('home.leaguesCta')}
            </span>
            <span className="block truncate text-xs leading-snug text-muted-foreground">
              {t('home.leaguesCtaHint')}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {leagueCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/90 px-1.5 text-[11px] font-bold leading-none text-white dark:bg-amber-600">
                {leagueCount}
              </span>
            )}
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              strokeWidth={2.5}
              aria-hidden
            />
          </span>
        </button>
      </AnimatedMount>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id="my-tab-leagues-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={panelTransition}
            className="overflow-hidden"
          >
            <div className="pt-2">
              <YourLeaguesHomeSection
                games={games}
                gamesUnreadCounts={gamesUnreadCounts}
                embedded
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
