import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from './Header';
import { useNavigationStore } from '@/store/navigationStore';
import { useAuthStore } from '@/store/authStore';
import { useDesktop } from '@/hooks/useDesktop';

interface MainLayoutProps {
  children: ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const { bottomTabsVisible, currentPage, chatsFilter } = useNavigationStore();
  const isDesktop = useDesktop();
  const isGameDetailsPage = location.pathname.match(/^\/games\/[^/]+$/);
  const shouldHideHeader = !user && isGameDetailsPage;

  const isDesktopChats = isDesktop && currentPage === 'chats';
  const isDesktopGameDetails = isDesktop && currentPage === 'gameDetails';
  const isGameDetailsPath = location.pathname.match(/^\/games\/[^/]+$/) && !location.pathname.includes('/chat');
  const isOnSpecificChatRoute = location.pathname.includes('/user-chat/') || 
                                 location.pathname.includes('/group-chat/') || 
                                 location.pathname.includes('/channel-chat/');
  const isOnBugsListPage = chatsFilter === 'bugs' && !isOnSpecificChatRoute;
  const isDesktopChatsSplitView = isDesktopChats && !isOnBugsListPage;
  const isDesktopGameDetailsSplitView = isDesktopGameDetails && isGameDetailsPath;
  const shouldAddBottomPadding = bottomTabsVisible && !isDesktopChats && !isDesktopGameDetailsSplitView;
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {!shouldHideHeader && (
        <div className="relative z-50">
          <Header />
        </div>
      )}
      <main 
        style={{ 
          paddingTop: shouldHideHeader ? '0' : ((isDesktopChatsSplitView || isDesktopGameDetailsSplitView) ? '0' : `calc(4rem + env(safe-area-inset-top))`), 
          paddingBottom: shouldAddBottomPadding ? 'calc(5rem + env(safe-area-inset-bottom))' : '1.5rem',
          paddingLeft: (isDesktopChatsSplitView || isDesktopGameDetailsSplitView) ? '0' : `max(0.5rem, env(safe-area-inset-left))`,
          paddingRight: (isDesktopChatsSplitView || isDesktopGameDetailsSplitView) ? '0' : `max(0.5rem, env(safe-area-inset-right))`
        }}
      >
        {(isDesktopChatsSplitView || isDesktopGameDetailsSplitView) ? children : <div className="container mx-auto px-2 py-4">{children}</div>}
      </main>
    </div>
  );
};

