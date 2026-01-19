import { ReactNode, useState, useEffect } from 'react';
import { Header } from './Header';
import { useNavigationStore } from '@/store/navigationStore';

interface MainLayoutProps {
  children: ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  const { bottomTabsVisible, currentPage } = useNavigationStore();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isDesktopChats = isDesktop && currentPage === 'chats';
  const shouldAddBottomPadding = bottomTabsVisible && !isDesktopChats;
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="relative z-50">
        <Header />
      </div>
      <main 
        style={{ 
          paddingTop: `calc(4rem + env(safe-area-inset-top))`, 
          paddingBottom: shouldAddBottomPadding ? 'calc(5rem + env(safe-area-inset-bottom))' : '1.5rem',
          paddingLeft: `max(0.5rem, env(safe-area-inset-left))`,
          paddingRight: `max(0.5rem, env(safe-area-inset-right))`
        }}
      >
        <div className="container mx-auto px-2 py-4">{children}</div>
      </main>
    </div>
  );
};

