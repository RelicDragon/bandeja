import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Game } from '@/types';
import { useMyTabPanelCounts } from '@/hooks/useMyTabPanelCounts';
import { MyTabBookingsSection } from '@/components/booktime/MyTabBookingsSection';
import { UserTeamsHomeSection } from './UserTeamsHomeSection';
import { YourLeaguesHomeSection } from './YourLeaguesHomeSection';

type MyTabPanelId = 'bookings' | 'teams' | 'leagues';

interface MyTabPanelSwitcherProps {
  games: Game[];
  gamesUnreadCounts?: Record<string, number>;
}

const PANELS: MyTabPanelId[] = ['bookings', 'teams', 'leagues'];

export function MyTabPanelSwitcher({ games, gamesUnreadCounts = {} }: MyTabPanelSwitcherProps) {
  const { t } = useTranslation();
  const [activePanel, setActivePanel] = useState<MyTabPanelId | null>(null);
  const panelCounts = useMyTabPanelCounts(games);
  const reduceMotion = useReducedMotion();
  const panelTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.21, 0.47, 0.32, 0.98] as const };

  const panelLabels: Record<MyTabPanelId, string> = {
    bookings: t('club.booktime.tabBookings'),
    teams: t('teams.title'),
    leagues: t('home.yourLeagues', { defaultValue: 'Leagues' }),
  };

  const handlePanelClick = useCallback((panel: MyTabPanelId) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }, []);

  return (
    <div className="mb-3 max-w-md mx-auto md:-mx-4 md:max-w-none">
      <div className="flex gap-2" role="group" aria-label={t('home.myTabPanels', { defaultValue: 'Bookings, teams, and leagues' })}>
        {PANELS.map((panel) => {
          const isActive = activePanel === panel;
          const count = panelCounts[panel];
          return (
            <button
              key={panel}
              type="button"
              aria-pressed={isActive}
              onClick={() => handlePanelClick(panel)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-2 text-sm font-medium transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                isActive
                  ? 'border-primary-600 bg-primary-600 text-white shadow-lg shadow-primary-600/30'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-primary-500'
              }`}
            >
              <span>{panelLabels[panel]}</span>
              {count > 0 ? (
                <span
                  className={`inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-900/5 text-gray-600 dark:bg-white/10 dark:text-gray-300'
                  }`}
                >
                  {count > 99 ? '99+' : count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {activePanel ? (
          <motion.div
            key={activePanel}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={panelTransition}
          >
            <div className="pt-3">
              {activePanel === 'bookings' ? (
                <MyTabBookingsSection />
              ) : activePanel === 'teams' ? (
                <UserTeamsHomeSection embedded />
              ) : (
                <YourLeaguesHomeSection
                  games={games}
                  gamesUnreadCounts={gamesUnreadCounts}
                  embedded
                />
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
