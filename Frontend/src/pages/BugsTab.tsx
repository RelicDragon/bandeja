import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BugList } from '@/components/bugs/BugList';
import { GameChat } from './GameChat';
import { MessageCircle } from 'lucide-react';
import { useNavigationStore } from '@/store/navigationStore';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { SplitViewLeftPanel, SplitViewRightPanel } from '@/components/SplitViewPanels';
import { useDesktop } from '@/hooks/useDesktop';
import { useSplitViewTab } from '@/hooks/useSplitViewTab';

export const BugsTab = () => {
  const { t } = useTranslation();
  const { bottomTabsVisible } = useNavigationStore();
  const isDesktop = useDesktop();

  const { selectedId: selectedBugId, isTransitioning, handleSelect: handleBugSelect } = useSplitViewTab({
    parseIdFromPath: (path: string) => {
      if (path.includes('/bugs/') && path.includes('/chat')) {
        const match = path.match(/\/bugs\/([^/]+)\/chat/);
        return match && match[1] ? match[1] : null;
      }
      return null;
    },
    buildPath: (bugId: string) => `/bugs/${bugId}/chat`,
    listPath: '/bugs',
    isDesktop,
  });

  const emptyState = useMemo(() => (
    <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
      <MessageCircle size={80} className="mb-6 opacity-30" />
      <p className="text-xl font-medium mb-2">
        {t('bug.selectBug', { defaultValue: 'Select a bug to view chat' })}
      </p>
      <p className="text-sm">
        {t('bug.selectBugHint', { defaultValue: 'Choose a bug from the list' })}
      </p>
    </div>
  ), [t]);

  const leftPanel = useMemo(() => (
    <SplitViewLeftPanel bottomTabsVisible={bottomTabsVisible}>
      <BugList 
        onBugSelect={handleBugSelect} 
        isDesktop={true} 
        selectedBugId={selectedBugId} 
      />
    </SplitViewLeftPanel>
  ), [handleBugSelect, selectedBugId, bottomTabsVisible]);

  const rightPanel = useMemo(() => (
    <SplitViewRightPanel 
      selectedId={selectedBugId}
      isTransitioning={isTransitioning}
      emptyState={emptyState}
    >
      <GameChat
        key={`bug-${selectedBugId}`}
        isEmbedded={true}
        chatId={selectedBugId!}
        chatType="bug"
      />
    </SplitViewRightPanel>
  ), [selectedBugId, isTransitioning, emptyState]);

  if (isDesktop) {
    return (
      <div className="fixed inset-0 top-[calc(4rem+env(safe-area-inset-top))] overflow-hidden">
        <ResizableSplitter
          defaultLeftWidth={40}
          minLeftWidth={250}
          maxLeftWidth={600}
          leftPanel={leftPanel}
          rightPanel={rightPanel}
        />
      </div>
    );
  }

  if (selectedBugId) {
    return (
      <GameChat
        isEmbedded={false}
        chatId={selectedBugId}
        chatType="bug"
      />
    );
  }

  return (
    <div className="space-y-4">
      <BugList onBugSelect={handleBugSelect} isDesktop={false} />
    </div>
  );
};
