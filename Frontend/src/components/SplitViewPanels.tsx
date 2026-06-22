import { ReactNode } from 'react';
import { BottomTabBar } from './navigation/BottomTabBar';

interface SplitViewLeftPanelProps {
  children: ReactNode;
  bottomTabsVisible?: boolean;
}

export const SplitViewLeftPanel = ({ children, bottomTabsVisible }: SplitViewLeftPanelProps) => (
  <div className="relative h-full min-h-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
    <div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden">
      {children}
    </div>
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-50 flex justify-center transition-opacity duration-150 ${
        bottomTabsVisible ? 'pointer-events-auto opacity-100' : 'opacity-0'
      }`}
      aria-hidden={!bottomTabsVisible}
    >
      <BottomTabBar containerPosition={true} />
    </div>
  </div>
);

interface SplitViewRightPanelProps {
  children: ReactNode;
  emptyState: ReactNode;
  selectedId: string | null;
  /** Full-screen blocking overlay (thread switch uses showOverlay + hideContent=false). */
  showOverlay?: boolean;
  /** Legacy: maps to showOverlay + hideContent=true when showOverlay omitted. */
  isTransitioning?: boolean;
  /** When false, keep children visible under a brief overlay (Phase 1 thread switch). */
  hideContent?: boolean;
}

export const SplitViewRightPanel = ({
  children,
  emptyState,
  selectedId,
  showOverlay: showOverlayProp,
  isTransitioning,
  hideContent = true,
}: SplitViewRightPanelProps) => {
  const showOverlay = showOverlayProp ?? Boolean(isTransitioning);
  const contentHidden = showOverlay && hideContent;

  return (
    <div className="h-full bg-gray-50 dark:bg-gray-900 relative">
      {selectedId ? (
        <div className="absolute inset-0">
          {showOverlay && (
            <div
              className={`absolute inset-0 z-10 bg-gray-50/80 dark:bg-gray-900/80 ${hideContent ? '' : 'pointer-events-none'}`}
              aria-busy="true"
              aria-hidden={hideContent}
            />
          )}
          <div
            className={`absolute inset-0 ${contentHidden ? 'invisible pointer-events-none' : 'opacity-100'}`}
          >
            {children}
          </div>
        </div>
      ) : (
        emptyState
      )}
    </div>
  );
};
