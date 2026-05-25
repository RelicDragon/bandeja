import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import { displayUserName } from './storyEngagementFormat';

type StoryViewerCaptionStripProps = {
  owner: BasicUser;
  caption?: string | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onOwnerClick: () => void;
  className?: string;
};

export function StoryViewerCaptionStrip({
  owner,
  caption,
  expanded,
  onExpandedChange,
  onOwnerClick,
  className = '',
}: StoryViewerCaptionStripProps) {
  const { t } = useTranslation();
  const text = caption?.trim();
  if (!text) return null;

  const ownerLabel = `@${displayUserName(owner)}`;

  return (
    <div
      className={`pointer-events-auto ${className}`}
      data-story-interactive
    >
      <p className={`text-sm text-white drop-shadow ${expanded ? '' : 'line-clamp-2'}`}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOwnerClick();
          }}
          className="mr-1 font-semibold text-white hover:underline"
        >
          {ownerLabel}
        </button>
        <span className="text-white/90">{text}</span>
      </p>
      {!expanded && text.length > 80 ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExpandedChange(true);
          }}
          className="mt-0.5 text-xs font-semibold text-white/80"
        >
          {t('stories.viewer.more')}
        </button>
      ) : expanded ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExpandedChange(false);
          }}
          className="mt-0.5 text-xs font-semibold text-white/80"
        >
          {t('stories.viewer.less')}
        </button>
      ) : null}
    </div>
  );
}
