import { useEffect, useMemo, useState } from 'react';
import { Calendar, Ticket, Trophy, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Game } from '@/types';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import { useMyTabPanelCounts } from '@/hooks/useMyTabPanelCounts';
import { useMyTabClubBookings } from '@/hooks/useMyTabClubBookings';
import { useUserTeamsBootstrap } from '@/hooks/useUserTeamsBootstrap';
import { MyTabBookingsSection } from '@/components/booktime/MyTabBookingsSection';
import { UserTeamsHomeSection } from './UserTeamsHomeSection';
import { YourLeaguesHomeSection } from './YourLeaguesHomeSection';

type MyTabPanelId = 'bookings' | 'teams' | 'leagues';

const CALENDAR_TOGGLE_IDS = ['calendar'] as const;
const CALENDAR_TOGGLE_ON = ['calendar'] as const;
const CALENDAR_TOGGLE_OFF: string[] = [];

interface MyTabPanelSwitcherProps {
  games: Game[];
  gamesUnreadCounts?: Record<string, number>;
  calendarVisible: boolean;
  onCalendarVisibleChange: (visible: boolean) => void;
}

export function MyTabPanelSwitcher({
  games,
  gamesUnreadCounts = {},
  calendarVisible,
  onCalendarVisibleChange,
}: MyTabPanelSwitcherProps) {
  const { t } = useTranslation();
  const [activeSwitch, setActiveSwitch] = useState<MyTabPanelId | null>(null);
  const booktime = useMyTabClubBookings();
  const { reloadMyClubs } = booktime;
  useUserTeamsBootstrap();
  const panelCounts = useMyTabPanelCounts(games, booktime);

  useEffect(() => {
    if (activeSwitch !== 'bookings') return;
    void reloadMyClubs();
  }, [activeSwitch, reloadMyClubs]);
  const reduceMotion = useReducedMotion();
  const panelTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.21, 0.47, 0.32, 0.98] as const };

  const hasLeagues = panelCounts.leagues > 0;

  const tabs = useMemo<SegmentedSwitchTab[]>(
    () => {
      const base: SegmentedSwitchTab[] = [
        {
          id: 'calendar',
          label: '',
          icon: Calendar,
          ariaLabel: t('games.calendar'),
        },
        {
          id: 'bookings',
          label: t('club.booktime.tabBookings'),
          icon: Ticket,
          badge: panelCounts.bookings,
        },
        {
          id: 'teams',
          label: t('teams.title'),
          icon: Users,
          badge: panelCounts.teams,
        },
      ];
      // Only show the Leagues subtab when the user has at least one league to show.
      if (hasLeagues) {
        base.push({
          id: 'leagues',
          label: t('home.yourLeagues', { defaultValue: 'Leagues' }),
          icon: Trophy,
          badge: panelCounts.leagues,
        });
      }
      return base;
    },
    [panelCounts.bookings, panelCounts.leagues, panelCounts.teams, hasLeagues, t],
  );

  // If the user was viewing Leagues and the last league is removed, fall back to the default view.
  useEffect(() => {
    if (activeSwitch === 'leagues' && !hasLeagues) {
      setActiveSwitch(null);
    }
  }, [activeSwitch, hasLeagues]);

  const handleSwitchChange = (id: string | null) => {
    if (id === 'bookings' || id === 'teams' || id === 'leagues') {
      setActiveSwitch(id);
      return;
    }
    setActiveSwitch(null);
  };

  const handleToggle = (id: string, next: boolean) => {
    if (id === 'calendar') {
      onCalendarVisibleChange(next);
    }
  };

  return (
    <div className="mb-3 max-w-md mx-auto md:-mx-4 md:max-w-none">
      <div className="flex justify-center">
        <SegmentedSwitch
          tabs={tabs}
          activeId={activeSwitch}
          onChange={handleSwitchChange}
          toggleIds={CALENDAR_TOGGLE_IDS}
          activeToggleIds={calendarVisible ? CALENDAR_TOGGLE_ON : CALENDAR_TOGGLE_OFF}
          onToggle={handleToggle}
          showOnlyActiveTabText
          allowDeselect
          badgeStyle="inline"
          layoutId="myTabPanelSwitcher"
          activeLabelMaxWidth={120}
          ariaLabel={t('home.myTabPanels', {
            defaultValue: 'Calendar, bookings, teams, and leagues',
          })}
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {activeSwitch ? (
          <motion.div
            key={activeSwitch}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={panelTransition}
          >
            <div className="pt-3">
              {activeSwitch === 'bookings' ? (
                <MyTabBookingsSection booktime={booktime} />
              ) : activeSwitch === 'teams' ? (
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
