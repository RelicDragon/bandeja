import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import { parseStorySegmentKey, type StorySegment } from '@/api/stories';
import type { StorySegmentEngagement } from '@/api/storyEngagement';
import { useStorySegmentEngagement } from '@/hooks/useStorySegmentEngagement';
import { useAuthStore } from '@/store/authStore';
import { PlayerCardBottomSheet } from '@/components/PlayerCardBottomSheet';
import { ShareModal } from '@/components/ShareModal';
import { sharePlayerProfile } from '@/utils/sharePlayerProfile';
import { getUserPrimarySport } from '@/utils/profileSports';
import { StoryViewerCaptionStrip } from './StoryViewerCaptionStrip';
import { StoryViewerDoubleTapHeart } from './StoryViewerDoubleTapHeart';
import { StoryCommentsSheet } from './StoryCommentsSheet';
import { StoryViewerLikersSheet } from './StoryViewerLikersSheet';
import { StoryViewerBottomBar } from './StoryViewerBottomBar';
import { StoryViewerEngagementBar } from './StoryViewerEngagementBar';
import { StoryDmSendFlyout } from './StoryDmSendFlyout';
import { useStoryDmSend } from './useStoryDmSend';
import { buildStoryReplyInfo } from './storyReplyInfo';
import {
  setStoryViewerEngagementPaused,
  resetStoryViewerEngagementPaused,
  storyViewerEngagementActions,
} from './storyViewerEngagementPause';
import {
  storyEngagementCaptionClass,
  storyEngagementLayoutVariant,
} from './storyViewerEngagementLayout';

type StoryViewerEngagementChromeProps = {
  segment: StorySegment;
  owner: BasicUser;
  ownerUserId: string;
  initialEngagement?: StorySegmentEngagement;
  viewerOpen: boolean;
  onRegisterDoubleTapLike?: (handler: () => void) => void;
  onEscapeToClose?: () => void;
  doubleTapBurst?: { x: number; y: number } | null;
};

export function StoryViewerEngagementChrome({
  segment,
  owner,
  ownerUserId,
  initialEngagement,
  viewerOpen,
  onRegisterDoubleTapLike,
  onEscapeToClose,
  doubleTapBurst = null,
}: StoryViewerEngagementChromeProps) {
  const { t } = useTranslation();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isOwnStory = currentUserId === ownerUserId;
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [ownerSheetOpen, setOwnerSheetOpen] = useState(false);
  const [likersOpen, setLikersOpen] = useState(false);
  const [dmFocused, setDmFocused] = useState(false);
  const [dmFlyout, setDmFlyout] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const layoutVariant = storyEngagementLayoutVariant(segment);
  const segmentRef = useMemo(() => parseStorySegmentKey(segment.key), [segment.key]);

  const { engagement, toggleLike, setCommentCount, setViewerHasCommented } = useStorySegmentEngagement({
    segmentKey: segment.key,
    ownerUserId,
    enabled: true,
    initialEngagement,
  });

  const storyReply = useMemo(() => buildStoryReplyInfo(segment, ownerUserId), [segment, ownerUserId]);
  const { sendDm } = useStoryDmSend(ownerUserId, storyReply);

  const handleCaptionExpanded = useCallback((expanded: boolean) => {
    setCaptionExpanded(expanded);
  }, []);

  const openComments = useCallback(() => {
    setCommentsOpen(true);
  }, []);

  useEffect(() => {
    setStoryViewerEngagementPaused(commentsOpen || captionExpanded || (!isOwnStory && dmFocused));
  }, [commentsOpen, captionExpanded, dmFocused, isOwnStory]);

  useEffect(() => {
    storyViewerEngagementActions.setOpenCommentsHandler(openComments);
    return () => storyViewerEngagementActions.setOpenCommentsHandler(null);
  }, [openComments]);

  useEffect(() => {
    if (viewerOpen) return;
    setCommentsOpen(false);
    setCaptionExpanded(false);
    setDmFocused(false);
    resetStoryViewerEngagementPaused();
  }, [viewerOpen]);

  useEffect(() => {
    if (!viewerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dmFocused) {
        (document.activeElement as HTMLElement | null)?.blur();
        setDmFocused(false);
        return;
      }
      if (commentsOpen) {
        setCommentsOpen(false);
        return;
      }
      if (captionExpanded) {
        setCaptionExpanded(false);
        return;
      }
      onEscapeToClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerOpen, commentsOpen, captionExpanded, dmFocused, onEscapeToClose]);

  const handleToggleLike = useCallback(() => {
    void toggleLike();
  }, [toggleLike]);

  const openLikers = useCallback(() => {
    setLikersOpen(true);
  }, []);

  const handleShare = useCallback(async () => {
    await sharePlayerProfile({
      playerId: owner.id,
      sport: getUserPrimarySport(owner),
      t,
      onFallbackModal: (url) => {
        setShareUrl(url);
        setShareOpen(true);
      },
    });
  }, [owner, t]);

  const handleDmSent = useCallback((payload: string) => {
    if (payload.length <= 4 && /\p{Extended_Pictographic}/u.test(payload)) {
      setDmFlyout(payload);
    }
  }, []);

  useEffect(() => {
    if (isOwnStory) {
      onRegisterDoubleTapLike?.(() => {});
      return;
    }
    onRegisterDoubleTapLike?.(() => void toggleLike());
  }, [onRegisterDoubleTapLike, toggleLike, isOwnStory]);

  return (
    <>
      <StoryViewerDoubleTapHeart burst={doubleTapBurst} />

      {isOwnStory ? (
        <>
          <StoryViewerCaptionStrip
            className={storyEngagementCaptionClass(layoutVariant)}
            owner={owner}
            caption={engagement.caption}
            expanded={captionExpanded}
            onExpandedChange={handleCaptionExpanded}
            onOwnerClick={() => setOwnerSheetOpen(true)}
          />
          <StoryViewerEngagementBar
            likeCount={engagement.likeCount}
            commentCount={engagement.commentCount}
            viewerHasCommented={engagement.viewerHasCommented}
            onOpenLikers={segmentRef ? openLikers : undefined}
            onOpenComments={openComments}
          />
        </>
      ) : (
        <>
          <StoryDmSendFlyout emoji={dmFlyout} onDone={() => setDmFlyout(null)} />
          <StoryViewerBottomBar
            likeCount={engagement.likeCount}
            commentCount={engagement.commentCount}
            viewerHasLiked={engagement.viewerHasLiked}
            viewerHasCommented={engagement.viewerHasCommented}
            onToggleLike={handleToggleLike}
            onOpenLikers={engagement.likeCount > 0 && segmentRef ? openLikers : undefined}
            onOpenComments={openComments}
            onShare={() => void handleShare()}
            onSendDm={sendDm}
            dmFocused={dmFocused}
            onDmFocusedChange={setDmFocused}
            onDmSent={handleDmSent}
            captionAbove={
              <StoryViewerCaptionStrip
                owner={owner}
                caption={engagement.caption}
                expanded={captionExpanded}
                onExpandedChange={handleCaptionExpanded}
                onOwnerClick={() => setOwnerSheetOpen(true)}
              />
            }
          />
        </>
      )}

      <StoryCommentsSheet
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
        segmentKey={segment.key}
        ownerUserId={ownerUserId}
        commentCount={engagement.commentCount}
        onCommentCountChange={setCommentCount}
        onViewerHasCommentedChange={setViewerHasCommented}
      />

      {segmentRef ? (
        <StoryViewerLikersSheet
          open={likersOpen}
          onOpenChange={setLikersOpen}
          sourceType={segmentRef.sourceType}
          sourceId={segmentRef.sourceId}
          ownerUserId={ownerUserId}
          likeCount={engagement.likeCount}
        />
      ) : null}

      {ownerSheetOpen ? (
        <PlayerCardBottomSheet playerId={owner.id} onClose={() => setOwnerSheetOpen(false)} />
      ) : null}

      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        shareUrl={shareUrl}
        dialogTitle={t('stories.viewer.shareTitle')}
        modalId="share-modal-story-viewer"
      />
    </>
  );
}
