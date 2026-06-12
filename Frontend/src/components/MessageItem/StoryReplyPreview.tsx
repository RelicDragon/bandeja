import React from 'react';
import { useTranslation } from 'react-i18next';
import { CircleDashed } from 'lucide-react';
import type { StoryReplyInfo } from '@/api/chat';

interface StoryReplyPreviewProps {
  storyReply: StoryReplyInfo;
  currentUserId?: string;
  isOwnMessage: boolean;
  onImageClick?: (url: string) => void;
  onVideoOpen?: (videoUrl: string, posterUrl: string) => void;
  className?: string;
}

export const StoryReplyPreview: React.FC<StoryReplyPreviewProps> = ({
  storyReply,
  currentUserId,
  isOwnMessage,
  onImageClick,
  onVideoOpen,
  className = '',
}) => {
  const { t } = useTranslation();

  const viewerOwnsStory = currentUserId === storyReply.ownerUserId;
  const label = viewerOwnsStory
    ? t('chat.storyReply.toYourStory', { defaultValue: 'Replied to your story' })
    : isOwnMessage
      ? t('chat.storyReply.youToTheirStory', { defaultValue: 'You replied to their story' })
      : t('chat.storyReply.toTheirStory', { defaultValue: 'Replied to a story' });

  const thumbnail = storyReply.thumbnailUrl ?? storyReply.mediaUrl;
  const canOpenVideo = storyReply.mediaType === 'VIDEO' && !!storyReply.mediaUrl;
  const canOpenImage =
    storyReply.mediaType === 'IMAGE' && !!storyReply.mediaUrl
      ? storyReply.mediaUrl
      : !canOpenVideo
        ? thumbnail
        : undefined;
  const isInteractive = canOpenVideo || !!canOpenImage;

  const handleClick = () => {
    if (canOpenVideo && storyReply.mediaUrl) {
      onVideoOpen?.(storyReply.mediaUrl, storyReply.thumbnailUrl ?? storyReply.mediaUrl);
      return;
    }
    if (canOpenImage && onImageClick) onImageClick(canOpenImage);
  };

  return (
    <div className={`px-1 ${className}`}>
      <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
        <CircleDashed className="w-3 h-3 flex-shrink-0" />
        {label}
      </div>
      <button
        type="button"
        onClick={handleClick}
        className={`block rounded-xl overflow-hidden border-l-2 border-gray-300 dark:border-gray-600 ${isInteractive ? 'cursor-pointer' : 'cursor-default'}`}
        aria-label={label}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            draggable={false}
            className="w-14 h-20 object-cover rounded-lg ml-1.5 select-none"
          />
        ) : (
          <div className="w-14 h-20 ml-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <CircleDashed className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </div>
        )}
      </button>
    </div>
  );
};
