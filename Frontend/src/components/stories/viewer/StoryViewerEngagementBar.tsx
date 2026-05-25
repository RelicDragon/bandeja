import { memo, type PointerEvent } from 'react';
import { Heart, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatStoryEngagementCount } from './storyEngagementFormat';
import { STORY_VIEWER_ICON_BTN, storyViewerCommentIconClass } from '../storyViewerIconBtn';

function barButtonPointerDown(e: PointerEvent<HTMLButtonElement>) {
  e.stopPropagation();
  if (e.button !== 0) return;
  if (e.pointerType === 'mouse' || e.pointerType === 'pen') e.preventDefault();
}

function blurAfterClick(el: HTMLButtonElement) {
  requestAnimationFrame(() => requestAnimationFrame(() => el.blur()));
}

const COUNT_CLASS = 'min-w-[1.25rem] text-sm font-semibold tabular-nums text-white';

type StoryViewerEngagementBarProps = {
  likeCount: number;
  commentCount: number;
  viewerHasCommented: boolean;
  onOpenLikers?: () => void;
  onOpenComments: () => void;
};

/** Author-only: like/comment counts, icons aligned right */
export const StoryViewerEngagementBar = memo(function StoryViewerEngagementBar({
  likeCount,
  commentCount,
  viewerHasCommented,
  onOpenLikers,
  onOpenComments,
}: StoryViewerEngagementBarProps) {
  const { t } = useTranslation();
  const likeLabel = formatStoryEngagementCount(likeCount);
  const commentLabel = formatStoryEngagementCount(commentCount);

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black/75 via-black/25 to-transparent backdrop-blur-md"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
      data-story-interactive
    >
      <div className="flex items-center justify-end gap-4 px-3 py-2.5">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={t('stories.viewer.likeCount', { count: likeCount })}
            className={STORY_VIEWER_ICON_BTN}
            onClick={(e) => {
              e.stopPropagation();
              onOpenLikers?.();
              blurAfterClick(e.currentTarget);
            }}
            onPointerDown={barButtonPointerDown}
            onPointerUp={(e) => e.stopPropagation()}
            disabled={!onOpenLikers}
          >
            <Heart size={28} className="text-white" strokeWidth={1.75} />
          </button>
          {onOpenLikers && likeCount > 0 ? (
            <button
              type="button"
              aria-label={t('stories.viewer.likeCount', { count: likeCount })}
              className={COUNT_CLASS}
              onClick={(e) => {
                e.stopPropagation();
                onOpenLikers();
                blurAfterClick(e.currentTarget);
              }}
              onPointerDown={barButtonPointerDown}
            >
              {likeLabel}
            </button>
          ) : (
            <span className={COUNT_CLASS} aria-hidden>
              {likeLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={t('stories.viewer.commentCount', { count: commentCount })}
            className={STORY_VIEWER_ICON_BTN}
            onClick={(e) => {
              e.stopPropagation();
              onOpenComments();
              blurAfterClick(e.currentTarget);
            }}
            onPointerDown={barButtonPointerDown}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <MessageCircle
              size={28}
              className={storyViewerCommentIconClass(viewerHasCommented)}
              strokeWidth={viewerHasCommented ? 0 : 1.75}
            />
          </button>
          <span className={COUNT_CLASS} aria-hidden>
            {commentLabel}
          </span>
        </div>
      </div>
    </div>
  );
});
