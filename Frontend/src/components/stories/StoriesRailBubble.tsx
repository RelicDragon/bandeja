import { Plus } from 'lucide-react';
import type { BasicUser } from '@/types';
import { StoryBubbleFace } from './StoryBubbleFace';

type StoriesRailBubbleProps = {
  user: BasicUser;
  label: string;
  hasUnseen: boolean;
  previewThumbnailUrl?: string | null;
  isSelf?: boolean;
  isCreate?: boolean;
  onClick: () => void;
};

export function StoriesRailBubble({
  user,
  label,
  hasUnseen,
  previewThumbnailUrl,
  isSelf = false,
  isCreate = false,
  onClick,
}: StoriesRailBubbleProps) {
  const ringClass = hasUnseen
    ? 'bg-[conic-gradient(from_45deg,#ec4899,#8b5cf6,#3b82f6,#ec4899)] p-[2.5px]'
    : 'bg-gray-300 dark:bg-gray-600 p-[2px]';

  const face = (
    <div className="rounded-full bg-white dark:bg-gray-900 p-[2px]">
      <StoryBubbleFace user={user} thumbnailUrl={isCreate ? undefined : previewThumbnailUrl} />
    </div>
  );

  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 shrink-0 min-w-[4.5rem]">
      {isCreate ? (
        <div className="relative pr-1 pb-1">
          <div className={`rounded-full overflow-hidden ${ringClass}`}>{face}</div>
          <span
            className="absolute bottom-0 right-0 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-green-500 text-white dark:border-gray-900"
            aria-hidden
          >
            <Plus size={12} strokeWidth={3} />
          </span>
        </div>
      ) : (
        <div className={`rounded-full overflow-hidden ${ringClass}`}>{face}</div>
      )}
      <span
        className={`text-[11px] leading-tight text-center max-w-[4.5rem] truncate ${
          isSelf ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'
        }`}
      >
        {label}
      </span>
    </button>
  );
}
