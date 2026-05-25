import type { ReactNode } from 'react';
import type { EntityType } from '@/types';
import { STORY_SLIDE_SAFE_BOTTOM } from '../storyViewerLayout';
import { StorySlideBackdrop } from './StorySlideBackdrop';

type StoryActivitySlideShellProps = {
  entityType: EntityType;
  backdropUrl?: string | null;
  children: ReactNode;
};

export function StoryActivitySlideShell({
  entityType,
  backdropUrl,
  children,
}: StoryActivitySlideShellProps) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <StorySlideBackdrop entityType={entityType} backdropUrl={backdropUrl} variant="promo" />
      <div
        className={`relative flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto overscroll-contain px-4 py-3 ${STORY_SLIDE_SAFE_BOTTOM}`}
      >
        <div className="my-auto w-full max-w-[min(100%,20rem)] max-h-full shrink-0 rounded-3xl border border-white/30 bg-white/15 p-5 text-center shadow-[0_12px_48px_rgba(0,0,0,0.35)] backdrop-blur-lg ring-1 ring-white/15">
          {children}
        </div>
      </div>
    </div>
  );
}
