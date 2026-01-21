import { ReactNode } from 'react';
import { BottomTabBar } from './navigation/BottomTabBar';

interface SplitViewLeftPanelProps {
  children: ReactNode;
  bottomTabsVisible?: boolean;
}

export const SplitViewLeftPanel = ({ children, bottomTabsVisible }: SplitViewLeftPanelProps) => (
  <div className="h-full border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col relative">
    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
      {children}
    </div>
    {bottomTabsVisible && (
      <div className="absolute bottom-0 left-0 right-0 flex justify-center">
        <BottomTabBar containerPosition={true} />
      </div>
    )}
  </div>
);

interface SplitViewRightPanelProps {
  children: ReactNode;
  emptyState: ReactNode;
  selectedId: string | null;
  isTransitioning: boolean;
}

export const SplitViewRightPanel = ({ children, emptyState, selectedId, isTransitioning }: SplitViewRightPanelProps) => (
  <div className="h-full bg-gray-50 dark:bg-gray-900 relative">
    {selectedId ? (
      <div className={`absolute inset-0 transition-opacity duration-150 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
        {children}
      </div>
    ) : (
      emptyState
    )}
  </div>
);
