import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer, DrawerContent } from '@/components/ui/Drawer';
import { useStoryComments } from '@/hooks/useStoryComments';
import { useAuthStore } from '@/store/authStore';
import type { StoryCommentDto } from '@/api/storyEngagement';
import { STORY_COMMENT_PENDING_PREFIX } from './storyCommentPending';
import { StoryCommentRow } from './StoryCommentRow';
import { StoryCommentComposer } from './StoryCommentComposer';
import { ReportStoryCommentModal } from './ReportStoryCommentModal';
import { formatStoryEngagementCount } from './storyEngagementFormat';

type StoryCommentsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segmentKey: string;
  ownerUserId: string;
  commentCount: number;
  onCommentCountChange: (count: number) => void;
  onViewerHasCommentedChange?: (commented: boolean) => void;
  onPrependComment?: (comment: StoryCommentDto, commentCount: number) => void;
};

export function StoryCommentsSheet({
  open,
  onOpenChange,
  segmentKey,
  ownerUserId,
  commentCount,
  onCommentCountChange,
  onViewerHasCommentedChange,
}: StoryCommentsSheetProps) {
  const { t } = useTranslation();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [reportTarget, setReportTarget] = useState<StoryCommentDto | null>(null);

  const commentsState = useStoryComments({
    segmentKey,
    ownerUserId,
    enabled: open,
    onCommentCountChange,
    onViewerHasCommentedChange,
  });

  const {
    comments,
    loading,
    error,
    nextCursor,
    replyTo,
    setReplyTo,
    expandedReplies,
    repliesLoading,
    loadComments,
    loadReplies,
    submitComment,
    deleteComment,
    toggleCommentLike,
    retryPendingComment,
    discardPendingComment,
  } = commentsState;

  const handleDelete = useCallback(
    (commentId: string, parentId?: string) => {
      if (commentId.startsWith(STORY_COMMENT_PENDING_PREFIX)) {
        discardPendingComment(commentId, parentId);
        return;
      }
      if (!window.confirm(t('stories.viewer.deleteConfirm'))) return;
      void deleteComment(commentId, parentId);
    },
    [deleteComment, discardPendingComment, t]
  );

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className="flex max-h-[min(70vh,680px)] min-h-0 flex-col overflow-hidden !pb-0 z-[60]"
          aria-labelledby="story-comments-title"
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
          <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <h2 id="story-comments-title" className="text-center text-base font-semibold">
              {t('stories.viewer.commentsTitle')}
              {commentCount > 0 ? ` · ${formatStoryEngagementCount(commentCount)}` : ''}
            </h2>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
            {loading && comments.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
            ) : error ? (
              <p className="py-8 text-center text-sm text-red-500 dark:text-red-400">{t('stories.viewer.loadFailed')}</p>
            ) : comments.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">{t('stories.viewer.noComments')}</p>
            ) : (
              <>
                {comments.filter((c): c is StoryCommentDto => Boolean(c?.id)).map((comment) => {
                  const expanded = expandedReplies[comment.id];
                  const previewLen = comment.previewReplies?.length ?? 0;
                  const shown = expanded?.length ?? previewLen;
                  const hidden = Math.max(0, comment.replyCount - shown);
                  return (
                    <StoryCommentRow
                      key={comment.id}
                      comment={comment}
                      currentUserId={currentUserId}
                      segmentOwnerId={ownerUserId}
                      onReply={setReplyTo}
                      onToggleLike={toggleCommentLike}
                      onDelete={handleDelete}
                      onReport={setReportTarget}
                      onRetryPending={retryPendingComment}
                      onDiscardPending={discardPendingComment}
                      onViewReplies={loadReplies}
                      replies={expanded ?? comment.previewReplies}
                      repliesLoading={repliesLoading[comment.id]}
                      hiddenReplyCount={hidden}
                    />
                  );
                })}
                {nextCursor ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void loadComments(false)}
                    className="mx-auto mt-4 block text-sm font-semibold text-sky-600 dark:text-sky-400 disabled:opacity-50"
                  >
                    {loading ? t('common.loading') : t('stories.viewer.loadMore')}
                  </button>
                ) : null}
              </>
            )}
          </div>

          <StoryCommentComposer
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onSubmit={submitComment}
          />
        </DrawerContent>
      </Drawer>

      <ReportStoryCommentModal
        isOpen={reportTarget != null}
        comment={reportTarget}
        onClose={() => setReportTarget(null)}
      />
    </>
  );
}
