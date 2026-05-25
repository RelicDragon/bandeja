import type { ReactNode } from 'react';
import type { EntityType } from '@/types';
import { StorySlideBackdrop } from './StorySlideBackdrop';

type StoryResultSlideShellProps = {
  entityType: EntityType;
  backdropUrl?: string | null;
  children: ReactNode;
};

export function StoryResultSlideShell({
  entityType,
  backdropUrl,
  children,
}: StoryResultSlideShellProps) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <StorySlideBackdrop entityType={entityType} backdropUrl={backdropUrl} variant="result" />
      <div className="relative flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto overscroll-contain px-3.5 py-3">
        {children}
      </div>
    </div>
  );
}
