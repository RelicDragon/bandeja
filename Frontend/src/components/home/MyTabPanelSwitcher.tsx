import { useMemo, useState } from 'react';
import { List, Ticket, Trophy, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Game } from '@/types';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import { useMyTabPanelCounts } from '@/hooks/useMyTabPanelCounts';
import { useMyTabBooktime } from '@/hooks/useMyTabBooktime';
import { MyTabBookingsSection } from '@/components/booktime/MyTabBookingsSection';
import { UserTeamsHomeSection } from './UserTeamsHomeSection';
import { YourLeaguesHomeSection } from './YourLeaguesHomeSection';
import { readMyGamesViewMode } from '@/utils/myGamesViewStorage';
import type { MyGamesViewMode } from '@/utils/myGamesViewStorage';

type MyTabSwitchId = 'bookings' | 'list' | 'teams' | 'leagues';
type MyTabPanelId = 'bookings' | 'teams' | 'leagues';

interface MyTabPanelSwitcherProps {
  games: Game[];
  gamesUnreadCounts?: Record<string, number>;
  onMyGamesViewModeChange: (mode: MyGamesViewMode) => void;
}

function isPanelId(id: MyTabSwitchId): id is MyTabPanelId {
  return id === 'bookings' || id === 'teams' || id === 'leagues';
}

export function MyTabPanelSwitcher({
  games,
  gamesUnreadCounts = {},
  onMyGamesViewModeChange,
}: MyTabPanelSwitcherProps) {
  const { t } = useTranslation();
  const [activeSwitch, setActiveSwitch] = useState<MyTabSwitchId | null>(() =>
    readMyGamesViewMode() === 'list' ? 'list' : null,
  );
  const booktime = useMyTabBooktime();
  const panelCounts = useMyTabPanelCounts(games, booktime);
  const reduceMotion = useReducedMotion();
  const panelTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.21, 0.47, 0.32, 0.98] as const };

  const tabs = useMemo<SegmentedSwitchTab[]>(
    () => [
      {
        id: 'bookings',
        label: t('club.booktime.tabBookings'),
        icon: Ticket,
        badge: panelCounts.bookings,
      },
      {
        id: 'list',
        label: t('games.listView'),
        icon: List,
      },
      {
        id: 'teams',
        label: t('teams.title'),
        icon: Users,
        badge: panelCounts.teams,
      },
      {
        id: 'leagues',
        label: t('home.yourLeagues', { defaultValue: 'Leagues' }),
        icon: Trophy,
        badge: panelCounts.leagues,
      },
    ],
    [panelCounts.bookings, panelCounts.leagues, panelCounts.teams, t],
  );

  const activePanel = activeSwitch && isPanelId(activeSwitch) ? activeSwitch : null;

  const handleSwitchChange = (id: string | null) => {
    if (id === 'bookings' || id === 'teams' || id === 'leagues' || id === 'list') {
      setActiveSwitch(id);
      onMyGamesViewModeChange(id === 'list' ? 'list' : 'calendar');
      return;
    }
    setActiveSwitch(null);
    onMyGamesViewModeChange('calendar');
  };

  return (
    <div className="mb-3 max-w-md mx-auto md:-mx-4 md:max-w-none">
      <div className="flex justify-center">
        <SegmentedSwitch
          tabs={tabs}
          activeId={activeSwitch}
          onChange={handleSwitchChange}
          showOnlyActiveTabText
          allowDeselect
          badgeStyle="inline"
          layoutId="myTabPanelSwitcher"
          activeLabelMaxWidth={120}
          ariaLabel={t('home.myTabPanels', { defaultValue: 'Bookings, list, teams, and leagues' })}
        />
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
                <MyTabBookingsSection booktime={booktime} />
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
