import { ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Header } from './Header';
import { useNavigationStore } from '@/store/navigationStore';
import { useAuthStore } from '@/store/authStore';
import { useDesktop } from '@/hooks/useDesktop';
import { useIsLandscape } from '@/hooks/useIsLandscape';

interface MainLayoutProps {
  children: ReactNode;
}

const INIT_SHELL_DURATION_MS = 400;

export const MainLayout = ({ children }: MainLayoutProps) => {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const {
    bottomTabsVisible,
    currentPage,
    chatsFilter,
    activeTab,
    findViewMode,
    initShellAnimationPlayed,
    setInitShellAnimationPlayed,
    gameDetailsOccludesSideChat,
  } = useNavigationStore(
    useShallow((s) => ({
      bottomTabsVisible: s.bottomTabsVisible,
      currentPage: s.currentPage,
      chatsFilter: s.chatsFilter,
      activeTab: s.activeTab,
      findViewMode: s.findViewMode,
      initShellAnimationPlayed: s.initShellAnimationPlayed,
      setInitShellAnimationPlayed: s.setInitShellAnimationPlayed,
      gameDetailsOccludesSideChat: s.gameDetailsOccludesSideChat,
    }))
  );
  const isDesktop = useDesktop();
  const isGameDetailsPage = location.pathname.match(/^\/games\/[^/]+$/);
  const isUserProfilePage = location.pathname.match(/^\/user-profile\/[^/]+$/);
  const shouldHideHeader = !user && (isGameDetailsPage || isUserProfilePage);
  const isHomeInit = location.pathname === '/' && !initShellAnimationPlayed;

  useEffect(() => {
    if (!isHomeInit) return;
    const t = setTimeout(() => setInitShellAnimationPlayed(true), INIT_SHELL_DURATION_MS + 50);
    return () => clearTimeout(t);
  }, [isHomeInit, setInitShellAnimationPlayed]);

  const isDesktopChats = isDesktop && currentPage === 'chats';
  const isGameDetailsPath = location.pathname.match(/^\/games\/[^/]+$/) && !location.pathname.includes('/chat');
  const isLandscape = useIsLandscape();
  const isGameDetailsWidePath =
    (isDesktop || isLandscape) && currentPage === 'gameDetails' && isGameDetailsPath;
  const isDesktopGameDetailsSplitView = isGameDetailsWidePath && !gameDetailsOccludesSideChat;
  const isGameDetailsTableFullBleed = isGameDetailsWidePath && gameDetailsOccludesSideChat;
  const isDesktopCalendarSplitView = isDesktop && (
    (currentPage === 'my' && activeTab === 'calendar') ||
    (currentPage === 'find' && findViewMode === 'calendar')
  );
  const isOnSpecificChatRoute = location.pathname.includes('/user-chat/') ||
                                 location.pathname.includes('/group-chat/') ||
                                 location.pathname.includes('/channel-chat/') ||
                                 location.pathname.match(/^\/bugs\/[^/]+$/);
  const isOnBugsListPage = chatsFilter === 'bugs' && !isOnSpecificChatRoute;
  const isDesktopChatsSplitView = isDesktopChats && !isOnBugsListPage;
  const anySplitView = isDesktopChatsSplitView || isDesktopGameDetailsSplitView || isDesktopCalendarSplitView;
  const gameDetailsWideBleedChrome = isGameDetailsTableFullBleed;
  const userProfileFullBleed = !!isUserProfilePage;
  const shouldAddBottomPadding =
    bottomTabsVisible &&
    !isDesktopChats &&
    !isDesktopGameDetailsSplitView &&
    !isGameDetailsTableFullBleed &&
    !isDesktopCalendarSplitView;
  const isUserTeamRoute = /^\/user-team\/[^/]+$/.test(location.pathname);

  return (
    <div
      className={`bg-gray-50 dark:bg-gray-900 ${isUserTeamRoute ? 'flex min-h-screen flex-col' : 'min-h-screen'}`}
    >
      {!shouldHideHeader && (
        <div className="relative z-50">
          <Header animateEntry={isHomeInit} />
        </div>
      )}
      <main
        className={isUserTeamRoute ? 'flex min-h-0 flex-1 flex-col' : undefined}
        style={{
          paddingTop: shouldHideHeader ? '0' : anySplitView || gameDetailsWideBleedChrome ? '0' : `calc(4rem + env(safe-area-inset-top))`,
          paddingBottom: shouldAddBottomPadding ? 'calc(5rem + env(safe-area-inset-bottom))' : '1.5rem',
          paddingLeft: anySplitView || userProfileFullBleed || gameDetailsWideBleedChrome ? '0' : `max(0.5rem, env(safe-area-inset-left))`,
          paddingRight: anySplitView || userProfileFullBleed || gameDetailsWideBleedChrome ? '0' : `max(0.5rem, env(safe-area-inset-right))`,
        }}
      >
        {anySplitView || gameDetailsWideBleedChrome ? (
          children
        ) : isUserTeamRoute ? (
          <div className="container mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-2 py-1">
            {children}
          </div>
        ) : (
          <div className={`container mx-auto py-4 ${isUserProfilePage ? 'px-0' : 'px-2'}`}>{children}</div>
        )}
      </main>
    </div>
  );
};

