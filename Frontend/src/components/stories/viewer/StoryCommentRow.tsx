import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, RotateCw, Trash2 } from 'lucide-react';
import { formatShortRelativeTime } from '@/utils/dateFormat';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { StoryCommentDto } from '@/api/storyEngagement';
import { displayUserName, formatStoryEngagementCount } from './storyEngagementFormat';
import { isPendingComment, type StoryCommentView } from './storyCommentPending';
import { StoryCommentSendingWave } from './StoryCommentSendingWave';

const LONG_PRESS_MS = 450;

type StoryCommentRowProps = {
  comment: StoryCommentDto;
  depth?: number;
  parentId?: string;
  currentUserId?: string;
  segmentOwnerId: string;
  onReply: (comment: StoryCommentDto) => void;
  onToggleLike: (commentId: string) => void;
  onDelete: (commentId: string, parentId?: string) => void;
  onReport: (comment: StoryCommentDto) => void;
  onRetryPending?: (commentId: string) => void;
  onDiscardPending?: (commentId: string, parentId?: string) => void;
  onViewReplies?: (parentId: string) => void;
  replies?: StoryCommentDto[];
  repliesLoading?: boolean;
  hiddenReplyCount?: number;
};

function pickNewestReply(replies: StoryCommentDto[]): StoryCommentDto | undefined {
  if (replies.length === 0) return undefined;
  return replies.reduce((latest, r) =>
    new Date(r.createdAt).getTime() >= new Date(latest.createdAt).getTime() ? r : latest
  );
}

export function StoryCommentRow({
  comment,
  depth = 0,
  parentId,
  currentUserId,
  segmentOwnerId,
  onReply,
  onToggleLike,
  onDelete,
  onReport,
  onRetryPending,
  onDiscardPending,
  onViewReplies,
  replies,
  repliesLoading,
  hiddenReplyCount = 0,
}: StoryCommentRowProps) {
  const { t } = useTranslation();
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [repliesThreadExpanded, setRepliesThreadExpanded] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removed = Boolean(comment.deletedAt);
  const pending = isPendingComment(comment);
  const pendingView = pending ? (comment as StoryCommentView) : null;
  const pendingSending = pendingView?._pendingStatus === 'sending';
  const pendingFailed = pendingView?._pendingStatus === 'failed';
  const isAuthor = comment.author.id === currentUserId;
  const isOwner = segmentOwnerId === currentUserId;
  const canDelete = isAuthor || isOwner;

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleLongPress = useCallback(() => {
    if (removed || pending) return;
    if (canDelete) {
      onDelete(comment.id, parentId);
      return;
    }
    onReport(comment);
  }, [canDelete, comment, onDelete, onReport, parentId, pending, removed]);

  const onPointerDown = useCallback(() => {
    clearLongPress();
    longPressTimer.current = setTimeout(handleLongPress, LONG_PRESS_MS);
  }, [clearLongPress, handleLongPress]);

  const bodyLines = comment.body.split('\n');
  const needsExpand = !removed && (bodyLines.length > 3 || comment.body.length > 180);
  const displayBody = removed ? t('stories.viewer.commentRemoved') : comment.body;
  const isReplyRow = depth > 0;

  const allReplies = replies ?? comment.previewReplies ?? [];
  const collapseReplies = depth === 0 && comment.replyCount > 1 && !repliesThreadExpanded;
  const visibleReplies = collapseReplies
    ? (() => {
        const newest = pickNewestReply(allReplies);
        return newest ? [newest] : [];
      })()
    : allReplies;
  const collapsedMoreCount = collapseReplies ? Math.max(0, comment.replyCount - 1) : 0;

  const handleExpandReplies = useCallback(() => {
    setRepliesThreadExpanded(true);
    const loadedCount = replies?.length ?? comment.previewReplies?.length ?? 0;
    if (loadedCount < comment.replyCount) {
      onViewReplies?.(comment.id);
    }
  }, [comment.id, comment.previewReplies?.length, comment.replyCount, onViewReplies, replies?.length]);

  return (
    <div className={isReplyRow ? 'ml-8 mt-3' : 'mt-4'}>
      <div
        className="flex gap-2.5"
        onPointerDown={onPointerDown}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onPointerLeave={clearLongPress}
        onContextMenu={(e) => {
          e.preventDefault();
          handleLongPress();
        }}
      >
        <PlayerAvatar
          player={removed ? null : comment.author}
          showName={false}
          inlineFace
          inlineFaceSize={isReplyRow ? 'sm' : 'md'}
          subscribePresence={false}
          asDiv
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {removed ? t('stories.viewer.deletedUser') : displayUserName(comment.author)}
            </span>
            {comment.isSegmentOwner ? (
              <span className="rounded bg-sky-100 dark:bg-sky-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-700 dark:text-sky-300">
                {t('stories.viewer.authorBadge')}
              </span>
            ) : null}
            {!pending ? (
              <>
                <span className="text-[11px] text-gray-400" aria-hidden>
                  ·
                </span>
                <span className="text-[11px] text-gray-400">
                  {formatShortRelativeTime(comment.createdAt)}
                </span>
                {comment.segmentOwnerHasLiked ? (
                  <>
                    <span className="text-[11px] text-gray-400" aria-hidden>
                      ·
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-400">
                      <Heart size={10} className="fill-red-500 text-red-500" strokeWidth={0} />
                      {t('stories.viewer.likedByAuthor')}
                    </span>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
          <p
            className={`mt-0.5 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words ${!bodyExpanded && needsExpand ? 'line-clamp-3' : ''}`}
          >
            {displayBody}
          </p>
          {!removed && !pending && needsExpand ? (
            <button
              type="button"
              onClick={() => setBodyExpanded((v) => !v)}
              className="mt-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400"
            >
              {bodyExpanded ? t('stories.viewer.less') : t('stories.viewer.more')}
            </button>
          ) : null}
          {!removed && pendingSending ? (
            <div className="mt-1.5 flex h-5 items-center">
              <StoryCommentSendingWave />
            </div>
          ) : null}
          {!removed && pendingFailed ? (
            <div className="mt-1.5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => onDiscardPending?.(comment.id, parentId)}
                className="p-0 text-gray-500 dark:text-gray-400"
                aria-label={t('chat.contextMenu.delete', { defaultValue: 'Delete' })}
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => onRetryPending?.(comment.id)}
                className="p-0 text-gray-500 dark:text-gray-400"
                aria-label={t('chat.resend', { defaultValue: 'Resend' })}
              >
                <RotateCw size={14} strokeWidth={2} />
              </button>
            </div>
          ) : null}
          {!removed && !pending ? (
            <div className="mt-1.5 flex items-center gap-4">
              <button
                type="button"
                onClick={() => onToggleLike(comment.id)}
                className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
                aria-label={t('stories.viewer.likeComment')}
              >
                <Heart
                  size={14}
                  className={comment.viewerHasLiked ? 'fill-red-500 text-red-500' : ''}
                  strokeWidth={comment.viewerHasLiked ? 0 : 2}
                />
                {comment.likeCount > 0 ? formatStoryEngagementCount(comment.likeCount) : null}
              </button>
              <button
                type="button"
                onClick={() => onReply(comment)}
                className="text-xs font-semibold text-gray-500 dark:text-gray-400"
              >
                {t('stories.viewer.reply')}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {depth === 0 && comment.replyCount > 0 && onViewReplies ? (
        <div className="ml-10 mt-2">
          {visibleReplies.map((reply) => (
            <StoryCommentRow
              key={reply.id}
              comment={reply}
              depth={1}
              parentId={comment.id}
              currentUserId={currentUserId}
              segmentOwnerId={segmentOwnerId}
              onReply={onReply}
              onToggleLike={onToggleLike}
              onDelete={(id) => onDelete(id, comment.id)}
              onReport={onReport}
              onRetryPending={onRetryPending}
              onDiscardPending={onDiscardPending}
            />
          ))}
          {collapsedMoreCount > 0 ? (
            <button
              type="button"
              disabled={repliesLoading}
              onClick={handleExpandReplies}
              className="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400 disabled:opacity-50"
            >
              {t('stories.viewer.moreReplies', { count: collapsedMoreCount })}
            </button>
          ) : repliesThreadExpanded && hiddenReplyCount > 0 ? (
            <button
              type="button"
              disabled={repliesLoading}
              onClick={() => onViewReplies(comment.id)}
              className="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400 disabled:opacity-50"
            >
              {t('stories.viewer.viewReplies', { count: hiddenReplyCount })}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
