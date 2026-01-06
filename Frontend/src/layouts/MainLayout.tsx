import { ReactNode } from 'react';
import { Header } from './Header';
import { useHeaderStore } from '@/store/headerStore';
import { useNavigationStore } from '@/store/navigationStore';

interface MainLayoutProps {
  children: ReactNode;
  showChatFilter?: boolean;
  onChatFilterToggle?: () => void;
}

export const MainLayout = ({ 
  children, 
  showChatFilter, 
  onChatFilterToggle
}: MainLayoutProps) => {
  const { showGameTypeModal, showChatFilter: globalShowChatFilter, showContacts, contactsHeight } = useHeaderStore();
  const { currentPage } = useNavigationStore();
  const isChatFilterActive = showChatFilter !== undefined ? showChatFilter : globalShowChatFilter;
  const isTabControllerVisible = currentPage === 'home' && !isChatFilterActive;
  const contactsVisible = showContacts;
  const contactsHeightPx = contactsVisible ? contactsHeight : 0;
  const tabControllerHeight = isTabControllerVisible ? '3.5rem' : '0';
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="relative z-50">
        <Header 
          showChatFilter={showChatFilter}
          onChatFilterToggle={onChatFilterToggle}
        />
      </div>
      <main 
        className={`transition-all duration-300 ${showGameTypeModal ? 'blur-sm' : ''}`} 
        style={{ 
          paddingTop: `calc(4rem + ${contactsHeightPx}px + ${tabControllerHeight} + env(safe-area-inset-top))`, 
          paddingBottom: '1.5rem' 
        }}
      >
        <div className="container mx-auto px-2 py-4">{children}</div>
      </main>
    </div>
  );
};

