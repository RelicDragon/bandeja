import { ReactNode } from 'react';
import { Header } from './Header';
import { useHeaderStore } from '@/store/headerStore';

interface MainLayoutProps {
  children: ReactNode;
  showChatFilter?: boolean;
  onChatFilterToggle?: () => void;
  profileEditMode?: boolean;
  onProfileEditModeToggle?: () => void;
  onProfileSaveChanges?: () => void;
  profileSaveDisabled?: boolean;
}

export const MainLayout = ({ 
  children, 
  showChatFilter, 
  onChatFilterToggle,
  profileEditMode,
  onProfileEditModeToggle,
  onProfileSaveChanges,
  profileSaveDisabled
}: MainLayoutProps) => {
  const { showGameTypeModal } = useHeaderStore();
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      <div className="relative z-50 safe-area-top">
        <Header 
          showChatFilter={showChatFilter}
          onChatFilterToggle={onChatFilterToggle}
          profileEditMode={profileEditMode}
          onProfileEditModeToggle={onProfileEditModeToggle}
          onProfileSaveChanges={onProfileSaveChanges}
          profileSaveDisabled={profileSaveDisabled}
        />
      </div>
      <main className={`flex-1 pt-16 pb-6 safe-area-bottom transition-all duration-300 ${showGameTypeModal ? 'blur-sm' : ''}`}>
        <div className="container mx-auto px-4 py-6">{children}</div>
      </main>
    </div>
  );
};

