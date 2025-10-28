import { ReactNode } from 'react';
import { Header } from './Header';
import { useHeaderStore } from '@/store/headerStore';

interface MainLayoutProps {
  children: ReactNode;
  showChatFilter?: boolean;
  onChatFilterToggle?: () => void;
  // Profile page props
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="relative z-50">
        <Header 
          showChatFilter={showChatFilter}
          onChatFilterToggle={onChatFilterToggle}
          profileEditMode={profileEditMode}
          onProfileEditModeToggle={onProfileEditModeToggle}
          onProfileSaveChanges={onProfileSaveChanges}
          profileSaveDisabled={profileSaveDisabled}
        />
      </div>
      <main className={`pt-16 pb-6 transition-all duration-300 ${showGameTypeModal ? 'blur-sm' : ''}`}>
        <div className="container mx-auto px-4 py-6">{children}</div>
      </main>
    </div>
  );
};

