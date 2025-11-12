import { ReactNode } from 'react';
import { Header } from './Header';
import { useHeaderStore } from '@/store/headerStore';

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
  const { showGameTypeModal } = useHeaderStore();
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="relative z-50">
        <Header 
          showChatFilter={showChatFilter}
          onChatFilterToggle={onChatFilterToggle}
        />
      </div>
      <main className={`transition-all duration-300 ${showGameTypeModal ? 'blur-sm' : ''}`} style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top))', paddingBottom: '1.5rem' }}>
        <div className="container mx-auto px-2 py-4">{children}</div>
      </main>
    </div>
  );
};

