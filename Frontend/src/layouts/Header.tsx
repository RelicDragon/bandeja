import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Bell, ArrowLeft, User, BarChart3, GitCompare, Users, Star } from 'lucide-react';
import { useHeaderStore } from '@/store/headerStore';
import { useNavigationStore } from '../store/navigationStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { useDesktop } from '@/hooks/useDesktop';
import { useAuthStore } from '@/store/authStore';
import { handleBack } from '@/utils/backNavigation';
import { parseLocation, placeToPageType } from '@/utils/urlSchema';
import {
  HomeHeaderContent,
  GameDetailsHeaderContent,
  GameModeToggle,
  MyGamesTabController,
  LeaderboardTabController
} from '@/components';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import { GameSubscriptionsHeaderContent } from '@/components/headerContent/GameSubscriptionsHeaderContent';
import { MarketplaceCreateHeaderContent } from '@/components/headerContent/MarketplaceCreateHeaderContent';
import { MarketplaceTabController } from '@/components/headerContent/MarketplaceTabController';
import { ChatsTabController } from '@/components/headerContent/ChatsTabController';
import { FindTabController } from '@/components/headerContent/FindTabController';

interface HeaderProps {
  animateEntry?: boolean;
}

export const Header = ({ animateEntry = false }: HeaderProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const { pendingInvites, isNewInviteAnimating } = useHeaderStore();
  const { gameDetailsCanAccessChat, setBounceNotifications, profileActiveTab, setProfileActiveTab } = useNavigationStore();
  const isDesktop = useDesktop();

  const parsed = useMemo(
    () => parseLocation(location.pathname, location.search),
    [location.pathname, location.search]
  );
  const currentPage = placeToPageType(parsed.place);

  const isGameDetailsPath = location.pathname.match(/^\/games\/[^/]+$/) && !location.pathname.includes('/chat');
  const isGameDetailsSplitView = currentPage === 'gameDetails' && isDesktop && isGameDetailsPath;
  
  const isGameDetailsPage = location.pathname.match(/^\/games\/[^/]+$/);
  const shouldHideHeader = !user && isGameDetailsPage;
  const isMarketplaceList = location.pathname === '/marketplace' || location.pathname === '/marketplace/my';

  useBackButtonHandler();

  const handleBackClick = () => {
    handleBack(navigate);
  };

  const handleNotificationsClick = async () => {
    setBounceNotifications(true);
    navigate('/', { replace: true });
  };

  if (shouldHideHeader) {
    return null;
  }

  return (
    <>
      <motion.header
        className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 fixed top-0 right-0 left-0 z-40 shadow-lg transition-all duration-300"
        style={{ paddingTop: 'env(safe-area-inset-top)', height: `calc(4rem + env(safe-area-inset-top))` }}
        initial={animateEntry ? { y: '-100%' } : false}
        animate={{ y: 0 }}
        transition={animateEntry ? { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } : { duration: 0 }}
      >
        <div className="h-16 px-4 flex items-center gap-4" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
          <div className="flex-1 min-w-0 flex items-center gap-3">
            {(currentPage === 'my' || currentPage === 'find' || currentPage === 'chats' || currentPage === 'profile' || currentPage === 'leaderboard' || (currentPage === 'marketplace' && isMarketplaceList)) ? null : (
              <button
                onClick={handleBackClick}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg font-medium transition-all duration-200 hover:scale-105 active:scale-110 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border-0 outline-none focus:border-0 focus:outline-none focus:ring-0 focus:shadow-none focus:bg-transparent focus:text-current  focus:transform focus:box-border active:border-0 active:outline-none active:ring-0 active:shadow-none active:bg-transparent active:text-current"
              >
                <ArrowLeft size={20} />
                {!(currentPage === 'marketplace' && (location.pathname === '/marketplace/create' || location.pathname.match(/^\/marketplace\/[^/]+\/edit$/))) && t('common.back')}
              </button>
            )}

            {currentPage === 'marketplace' && isMarketplaceList && (
              <MarketplaceTabController />
            )}
            {currentPage === 'marketplace' && (location.pathname === '/marketplace/create' || location.pathname.match(/^\/marketplace\/[^/]+\/edit$/)) && (
              <MarketplaceCreateHeaderContent />
            )}
            
            {pendingInvites > 0 && (
              <button
                onClick={handleNotificationsClick}
                className={`relative p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 hover:scale-105 active:scale-110 border-0 outline-none focus:border-0 focus:outline-none focus:ring-0 focus:shadow-none focus:bg-transparent focus:text-current focus:transform focus:box-border active:border-0 active:outline-none active:ring-0 active:shadow-none active:bg-transparent active:text-current ${
                  isNewInviteAnimating ? 'animate-pulse animate-bounce' : ''
                }`}
              >
                <Bell size={20} className="text-gray-600 dark:text-gray-400" />
                <span className={`absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center transition-all duration-300 ${
                  isNewInviteAnimating ? 'animate-ping scale-110' : ''
                }`}>
                  {pendingInvites}
                </span>
              </button>
            )}

            {currentPage === 'my' && <MyGamesTabController />}
            {currentPage === 'find' && <FindTabController />}
            {currentPage === 'chats' && <ChatsTabController />}
            {currentPage === 'profile' && (
              <SegmentedSwitch
                tabs={[
                  { id: 'general', label: t('profile.general') || 'General', icon: User },
                  { id: 'statistics', label: t('profile.statistics') || 'Statistics', icon: BarChart3 },
                  { id: 'comparison', label: t('profile.comparison') || 'Comparison', icon: GitCompare },
                  { id: 'followers', label: t('profile.community') || 'Community', icon: Users },
                  ...(user?.isTrainer ? [{ id: 'reviews', label: t('profile.review') || 'Review', icon: Star }] : []),
                ] as SegmentedSwitchTab[]}
                activeId={profileActiveTab}
                onChange={(id) => setProfileActiveTab(id as 'general' | 'statistics' | 'comparison' | 'followers' | 'reviews')}
                titleInActiveOnly={true}
                layoutId="profile-subtabs"
              />
            )}
            {currentPage === 'leaderboard' && <LeaderboardTabController />}
          </div>

          <div className="flex-shrink-0 min-w-28 flex items-center justify-end gap-4">
            {(currentPage === 'my' || currentPage === 'find' || currentPage === 'chats' || currentPage === 'profile' || currentPage === 'leaderboard' || (currentPage === 'marketplace' && isMarketplaceList)) && (
              <HomeHeaderContent />
            )}

            {currentPage === 'gameDetails' && (
              <GameDetailsHeaderContent canAccessChat={gameDetailsCanAccessChat && !isGameDetailsSplitView} />
            )}

            {currentPage === 'gameSubscriptions' && (
              <GameSubscriptionsHeaderContent />
            )}
          </div>
        </div>
      </motion.header>
      {currentPage !== 'profile' && <GameModeToggle />}
    </>
  );
};
