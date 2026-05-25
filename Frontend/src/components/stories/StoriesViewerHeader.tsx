import { X } from 'lucide-react';
import type { BasicUser } from '@/types';
import { formatRelativeTime } from '@/utils/dateFormat';
import { StoryBubbleFace } from './StoryBubbleFace';
import { STORY_VIEWER_ICON_BTN } from './storyViewerIconBtn';

type StoriesViewerHeaderProps = {
  user: BasicUser;
  createdAt?: string;
  onClose: () => void;
};

export function StoriesViewerHeader({ user, createdAt, onClose }: StoriesViewerHeaderProps) {
  const timeLabel = createdAt ? formatRelativeTime(createdAt) : '';

  return (
    <div className="flex items-center justify-between gap-2 px-3 pb-3 pointer-events-none">
      <div className="flex min-w-0 items-center gap-2 pointer-events-auto">
        <StoryBubbleFace user={user} size="header" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white drop-shadow">
            {[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}
          </p>
          {timeLabel ? <p className="text-xs text-white/80 drop-shadow">{timeLabel}</p> : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className={`pointer-events-auto ${STORY_VIEWER_ICON_BTN}`}
      >
        <X size={28} className="text-white" strokeWidth={1.75} />
      </button>
    </div>
  );
}
