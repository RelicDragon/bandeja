import { ReactNode } from 'react';
import { Header } from './Header';
import { useHeaderStore } from '@/store/headerStore';
import { useNavigationStore } from '@/store/navigationStore';

interface MainLayoutProps {
  children: ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  const { showGameTypeModal } = useHeaderStore();
  const { bottomTabsVisible } = useNavigationStore();
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="relative z-50">
        <Header />
      </div>
      <main 
        className={`transition-all duration-300 ${showGameTypeModal ? 'blur-sm' : ''}`} 
        style={{ 
          paddingTop: `calc(4rem + env(safe-area-inset-top))`, 
          paddingBottom: bottomTabsVisible ? 'calc(5rem + env(safe-area-inset-bottom))' : '1.5rem',
          paddingLeft: `max(0.5rem, env(safe-area-inset-left))`,
          paddingRight: `max(0.5rem, env(safe-area-inset-right))`
        }}
      >
        <div className="container mx-auto px-2 py-4">{children}</div>
      </main>
    </div>
  );
};

