import React, { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ChatMessage, ChatMessageWithStatus, chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { UnifiedMessageMenu } from '../UnifiedMessageMenu';
import { ReplyPreview } from '../ReplyPreview';
import { StoryReplyPreview } from './StoryReplyPreview';
import { parseStoryReplyInfo } from '@/api/parseStoryReplyInfo';
import { PlayerCardBottomSheet } from '../PlayerCardBottomSheet';
import { formatSystemMessageForDisplay, SystemMessageType } from '@/utils/systemMessages';
import { FullscreenImageViewer } from '../FullscreenImageViewer';
import { FullscreenVideoViewer } from '../FullscreenVideoViewer';
import { ReportMessageModal } from '../ReportMessageModal';
import { extractLanguageCode } from '@/utils/language';
import { isMessageTranslationPending as isTranslationPending } from '@bandeja/chat-contract';
import { translationEqualsSource } from '@/utils/translationOutputNormalize';
import { useChatAutoTranslateSlots } from '@/contexts/ChatAutoTranslateContext';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { MessageItemProps } from './types';
import { parseContentWithMentionsAndUrls, formatMessageTime as formatMessageTimeUtil, resolveChatImageDisplayUrl } from './utils';
import { formatVoiceTranscriptionForDisplay, isVoiceTranscriptionNoSpeech } from '@/utils/voiceTranscriptionDisplay';
import { SystemMessageBlock } from './SystemMessageBlock';
import { SystemMessageReactionMotion } from './SystemMessageReactionMotion';
import { MessageBubble } from './MessageBubble';
import { useOptimisticSendSlowHint } from './useOptimisticSendSlowHint';
import { getMessageSendState } from '@/services/chat/messageSendState';
import { PlayerAvatar } from '../PlayerAvatar';
import { useMessageLongPress } from './useMessageLongPress';
import { useMessageReactions } from './useMessageReactions';
import { MessageItemReactionStrip, MESSAGE_REACTION_GUTTER_CLASS } from './MessageItemReactionStrip';
import { messageRowPropsEqual } from './messageRowPropsEqual';
import { MessageRowDeleteMotion } from './MessageRowDeleteMotion';
import { LayoutGroup } from 'framer-motion';
import { isAppLinkPreviewHost, isEligibleLinkPreviewUrl } from './linkPreview/eligibility';
import { parseStoredLinkPreview } from './linkPreview/parseStoredLinkPreview';
import { OfflineIntent } from '@/services/chat/offlineIntent';
import {
  isRetryableMutationError,
  shouldQueueChatMutation,
} from '@/services/chat/chatMutationNetwork';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { copyImageToClipboard } from '@/utils/copyImageToClipboard';
import { resolveMessageCopyTargetUrl } from '@/utils/copyMessageMedia';

export const MessageItem: React.FC<MessageItemProps> = memo(function MessageItem({
  message,
  onAddReaction,
  onRemoveReaction,
  onDeleteMessage,
  onReplyMessage,
  onEditMessage,
  onPollUpdated,
  onResendQueued,
  onRemoveFromQueue,
  contextMenuState,
  onOpenContextMenu,
  onCloseContextMenu,
  replyCount = 0,
  onScrollToFirstReply,
  onScrollToMessage,
  isChannel = false,
  userChatUser1Id,
  userChatUser2Id,
  onChatRequestRespond,
  isPinned = false,
  onPin,
  onUnpin,
  showReply = true,
  onForwardMessage,
  suppressOpenReactionMotion = false,
  loadMediaEager = false,
  groupPosition = 'single',
  entityType,
  isThreadSearchOutline = false,
  threadSearchHighlightQuery = null,
}) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const messageRef = useRef<HTMLDivElement>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPlayerCard, setShowPlayerCard] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [fullscreenVideo, setFullscreenVideo] = useState<{ videoUrl: string; posterUrl: string } | null>(
    null
  );
  const [reportMessage, setReportMessage] = useState<ChatMessage | null>(null);
  const [selectedMentionUserId, setSelectedMentionUserId] = useState<string | null>(null);
  const [showFailedMenu, setShowFailedMenu] = useState(false);
  const [respondingToRequest, setRespondingToRequest] = useState(false);
  const [currentMessage, setCurrentMessage] = useState(message);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const isOwnMessage = currentMessage.senderId === user?.id;
  const isSystemMessage = !currentMessage.senderId;
  const isFirstInGroup = groupPosition === 'single' || groupPosition === 'first';
  const isLastInGroup = groupPosition === 'single' || groupPosition === 'last';
  const sendState = getMessageSendState(currentMessage as ChatMessageWithStatus);
  const { isSending, isFailed, isOffline, optimisticId } = sendState;
  const isSendingSlow = useOptimisticSendSlowHint(isSending, currentMessage.createdAt);
  const isMenuOpen = contextMenuState.isOpen && contextMenuState.messageId === currentMessage.id;
  const storyReply = parseStoryReplyInfo(currentMessage.storyReply);
  const canReact = !!onAddReaction && !!onRemoveReaction && !isOffline;

  const displaySettings = user ? resolveDisplaySettings(user) : null;
  const formatMessageTime = useCallback(
    (dateString: string) => formatMessageTimeUtil(dateString, displaySettings),
    [displaySettings]
  );

  useMessageLongPress({
    messageRef,
    messageId: currentMessage.id,
    onOpenContextMenu,
    isOffline,
  });

  const {
    getCurrentUserReaction,
    isReactionPending,
    getReactionCounts,
    getReplyCount,
    hasReplies,
    handleScrollToReplies,
  } = useMessageReactions({
    message: currentMessage,
    currentUserId: user?.id,
    replyCount,
    isOffline,
    onScrollToFirstReply,
  });

  useLayoutEffect(() => {
    setCurrentMessage(message);
  }, [message]);

  useEffect(() => {
    if (!showFailedMenu) return;
    const close = (e: PointerEvent) => {
      if (messageRef.current?.contains(e.target as Node)) return;
      setShowFailedMenu(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [showFailedMenu]);

  useEffect(() => {
    const preventContextMenu = (e: Event) => e.preventDefault();
    if (isMenuOpen) {
      document.addEventListener('contextmenu', preventContextMenu, { capture: true, passive: false });
    }
    return () => document.removeEventListener('contextmenu', preventContextMenu, { capture: true });
  }, [isMenuOpen]);

  const voiceTxRaw = currentMessage.audioTranscription?.transcription;
  const displayContent = isSystemMessage
    ? formatSystemMessageForDisplay(currentMessage.content, t, entityType)
    : currentMessage.messageType === 'VOICE' && voiceTxRaw?.trim()
      ? formatVoiceTranscriptionForDisplay(voiceTxRaw, t)
      : currentMessage.content;

  const parsedContent = isSystemMessage ? null : parseContentWithMentionsAndUrls(displayContent);
  const firstExternalHttpUrl = useMemo(() => {
    if (!parsedContent) return null;
    const eligibleUrls: string[] = [];
    for (const part of parsedContent) {
      if (part.type !== 'url' || !part.url) continue;
      if (!isEligibleLinkPreviewUrl(part.url)) continue;
      eligibleUrls.push(part.url);
    }
    if (currentMessage.linkPreviewUrl && eligibleUrls.includes(currentMessage.linkPreviewUrl)) {
      return currentMessage.linkPreviewUrl;
    }
    return eligibleUrls[0] ?? null;
  }, [parsedContent, currentMessage.linkPreviewUrl]);
  const storedLinkPreview = useMemo(
    () => parseStoredLinkPreview(currentMessage.linkPreview),
    [currentMessage.linkPreview]
  );
  const userLanguageCode = user?.language ? extractLanguageCode(user.language).toLowerCase() : 'en';
  const autoTranslateSlots = useChatAutoTranslateSlots();

  let matchingTranslation = currentMessage.translation;
  if (currentMessage.translations && currentMessage.translations.length > 0) {
    matchingTranslation =
      currentMessage.translations.find((tr) => tr.languageCode.toLowerCase() === userLanguageCode) ||
      currentMessage.translation;
  }
  const translationReady =
    !!matchingTranslation &&
    matchingTranslation.languageCode.toLowerCase() === userLanguageCode &&
    !isTranslationPending(matchingTranslation.translation);
  const localeAllowed =
    autoTranslateSlots.length === 0 || autoTranslateSlots.map((c) => c.toLowerCase()).includes(userLanguageCode);
  const sourceTextForTranslationCompare =
    currentMessage.messageType === 'VOICE' && voiceTxRaw?.trim()
      ? voiceTxRaw.trim()
      : (currentMessage.content?.trim() ?? '');
  const translationDuplicatesOriginal =
    !!matchingTranslation &&
    !!sourceTextForTranslationCompare &&
    translationEqualsSource(sourceTextForTranslationCompare, matchingTranslation.translation);
  const hasTranslation = translationReady && localeAllowed && !translationDuplicatesOriginal;
  const isTranslationLoading =
    localeAllowed &&
    !!matchingTranslation &&
    matchingTranslation.languageCode.toLowerCase() === userLanguageCode &&
    isTranslationPending(matchingTranslation.translation);
  const translationContent =
    hasTranslation && matchingTranslation
      ? parseContentWithMentionsAndUrls(matchingTranslation.translation)
      : null;
  const translationRevealKey =
    (currentMessage as ChatMessageWithStatus)._translationJustArrived && hasTranslation
      ? `${currentMessage.id}-reveal`
      : undefined;

  const translationJustArrived = (currentMessage as ChatMessageWithStatus)._translationJustArrived;
  useEffect(() => {
    if (!translationJustArrived) return;
    const timer = window.setTimeout(() => {
      setCurrentMessage((prev) => {
        if (!translationJustArrived) return prev;
        const { _translationJustArrived: _, ...rest } = prev as ChatMessageWithStatus;
        return rest;
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [translationJustArrived]);

  const getSenderName = () => {
    if (isSystemMessage) return 'System';
    if (currentMessage.sender?.firstName && currentMessage.sender?.lastName) {
      return `${currentMessage.sender.firstName || ''} ${currentMessage.sender.lastName || ''}`.trim();
    }
    return currentMessage.sender?.firstName || 'Unknown';
  };

  const handleTranslationUpdate = (messageId: string, translation: { languageCode: string; translation: string }) => {
    if (messageId === currentMessage.id) {
      setCurrentMessage({
        ...currentMessage,
        translation,
        translations: currentMessage.translations
          ? [...currentMessage.translations.filter((tr) => tr.languageCode !== translation.languageCode), translation]
          : [translation],
      });
    }
  };

  const runTranscribe = useCallback(async (): Promise<boolean> => {
    const id = currentMessage.id;
    if (isTranscribing) return false;
    setIsTranscribing(true);
    try {
      const data = await chatApi.transcribeMessage(id);
      setCurrentMessage((prev) => (prev.id === id ? { ...prev, audioTranscription: data } : prev));
      return true;
    } catch (error: unknown) {
      const err = error as { response?: { status?: number } };
      const msg =
        err?.response?.status === 503
          ? t('chat.transcriptionUnavailable', { defaultValue: 'Transcription is temporarily unavailable. Please try again later.' })
          : err?.response?.status === 404
            ? t('chat.transcriptionAudioMissing', { defaultValue: 'Voice audio could not be loaded.' })
            : t('chat.transcriptionError', { defaultValue: 'Failed to transcribe voice message. Please try again.' });
      toast.error(msg);
      return false;
    } finally {
      setIsTranscribing(false);
    }
  }, [currentMessage.id, isTranscribing, t]);

  const getThumbnailUrl = (index: number): string =>
    resolveChatImageDisplayUrl(
      currentMessage.mediaUrls?.[index],
      currentMessage.thumbnailUrls?.[index],
      reduceMotion
    );

  const handleImageClick = (url: string) => setFullscreenImage(url || null);
  const handleVideoOpen = (videoUrl: string, posterUrl: string) =>
    setFullscreenVideo({ videoUrl, posterUrl });

  const handleCopyMessage = async (msg: ChatMessage) => {
    // 1. Copy text when present (system / voice transcription / plain text / caption).
    let text: string | null = null;
    if (!msg.senderId) {
      text = formatSystemMessageForDisplay(msg.content, t, entityType);
    } else if (msg.messageType === 'VOICE' && msg.audioTranscription?.transcription?.trim()) {
      text = formatVoiceTranscriptionForDisplay(msg.audioTranscription.transcription, t);
    } else {
      text = msg.content?.trim() ? msg.content : null;
    }
    if (text) {
      void navigator.clipboard.writeText(text);
      return;
    }

    // 2. Document: copy filename (no image target).
    if (msg.messageType === 'DOCUMENT') {
      const name = msg.documentFileName?.trim();
      void navigator.clipboard.writeText(name ? `[file] ${name}` : '[file]');
      return;
    }

    // 3. Otherwise copy the image (sticker / GIF / photo).
    const url = await resolveMessageCopyTargetUrl(msg, { reduceMotion });
    if (!url) {
      // Sticker whose asset couldn't be resolved: fall back to its emoji text.
      if (msg.messageType === 'STICKER' && msg.stickerEmoji?.trim()) {
        void navigator.clipboard.writeText(msg.stickerEmoji.trim());
        return;
      }
      toast.error(t('media.copyImageFailed', { defaultValue: 'Could not copy image' }));
      return;
    }
    try {
      const outcome = await copyImageToClipboard(url);
      toast.success(
        outcome === 'shared'
          ? t('media.imageShareOpened', { defaultValue: 'Opened share sheet' })
          : t('media.imageCopied', { defaultValue: 'Image copied' })
      );
    } catch {
      toast.error(t('media.copyImageFailed', { defaultValue: 'Could not copy image' }));
    }
  };

  const handleQuickReaction = (e: React.MouseEvent) => {
    if (!onAddReaction || !onRemoveReaction) return;
    e.preventDefault();
    e.stopPropagation();
    const currentReaction = getCurrentUserReaction();
    if (currentReaction === '❤️') onRemoveReaction(currentMessage.id);
    else onAddReaction(currentMessage.id, '❤️');
  };

  const handleDeleteStart = (messageId: string) => {
    if (messageId === currentMessage.id) setIsDeleting(true);
  };

  const handleUrlClick = useCallback(
    (url: string, e: React.MouseEvent) => {
      if (!url) return;
      try {
        const urlObj = new URL(url);
        if (isAppLinkPreviewHost(urlObj.hostname)) {
          e.preventDefault();
          navigate(urlObj.pathname + urlObj.search + urlObj.hash);
          return;
        }
      } catch {
        /* fall through to default <a> */
      }
    },
    [navigate]
  );

  const handleDismissLinkPreview = useCallback(async () => {
    setCurrentMessage((current) => ({ ...current, linkPreviewDisabled: true }));
    try {
      if (shouldQueueChatMutation()) {
        await OfflineIntent.enqueue({
          kind: 'link_preview',
          contextType: currentMessage.chatContextType,
          contextId: currentMessage.contextId,
          messageId: currentMessage.id,
          disabled: true,
        });
        return;
      }
      const updated = await chatApi.setMessageLinkPreviewDisabled(currentMessage.id, true);
      setCurrentMessage(updated);
    } catch (error) {
      if (isRetryableMutationError(error)) {
        try {
          await OfflineIntent.enqueue({
            kind: 'link_preview',
            contextType: currentMessage.chatContextType,
            contextId: currentMessage.contextId,
            messageId: currentMessage.id,
            disabled: true,
          });
          return;
        } catch {
          // Show the normal failure below.
        }
      }
      setCurrentMessage((current) => ({ ...current, linkPreviewDisabled: false }));
      toast.error(
        t('chat.linkPreview.removeFailed', {
          defaultValue: 'Could not remove the preview. Please try again.',
        })
      );
    }
  }, [
    currentMessage.chatContextType,
    currentMessage.contextId,
    currentMessage.id,
    t,
  ]);

  const parsedRequest =
    isSystemMessage && currentMessage.content
      ? (() => {
          try {
            const p = JSON.parse(currentMessage.content);
            return p.type === SystemMessageType.USER_CHAT_REQUEST && !p.responded ? p : null;
          } catch {
            return null;
          }
        })()
      : null;
  const responderId =
    parsedRequest && userChatUser1Id && userChatUser2Id
      ? parsedRequest.requesterId === userChatUser1Id
        ? userChatUser2Id
        : userChatUser1Id
      : null;
  const showAcceptDecline =
    !!parsedRequest && !!responderId && user?.id === responderId && !!onChatRequestRespond;

  const hasSystemReactions = currentMessage.reactions.length > 0;
  const systemReactionStrip = (
    <MessageItemReactionStrip
      isOwnMessage={false}
      isChannel={false}
      activeEmoji={getCurrentUserReaction()}
      reactionCounts={getReactionCounts()}
      pending={isReactionPending()}
      onQuickReaction={handleQuickReaction}
      suppressOpenReactionMotion={suppressOpenReactionMotion}
    />
  );

  return (
    <>
      {isSystemMessage ? (
        <MessageRowDeleteMotion
          isDeleting={isDeleting}
          messageRef={messageRef}
          className="group flex justify-center mb-4 relative overflow-visible"
        >
          <LayoutGroup id={`system-reactions-${currentMessage.id}`}>
            <div className="flex flex-col items-center">
              <SystemMessageBlock
                displayContent={displayContent}
                showAcceptDecline={showAcceptDecline}
                onAccept={() => {
                  if (respondingToRequest) return;
                  setRespondingToRequest(true);
                  onChatRequestRespond!(currentMessage.id, true);
                  setRespondingToRequest(false);
                }}
                onDecline={() => {
                  if (respondingToRequest) return;
                  setRespondingToRequest(true);
                  onChatRequestRespond!(currentMessage.id, false);
                  setRespondingToRequest(false);
                }}
                respondingToRequest={respondingToRequest}
                createdAt={currentMessage.createdAt}
                formatMessageTime={formatMessageTime}
                t={t}
                isThreadSearchOutline={isThreadSearchOutline}
                threadSearchHighlightQuery={threadSearchHighlightQuery}
                cornerSlot={
                  canReact && !hasSystemReactions ? (
                    <SystemMessageReactionMotion
                      messageId={currentMessage.id}
                      className="absolute bottom-0.5 right-0.5 z-10"
                      suppressLayoutMotion={suppressOpenReactionMotion}
                    >
                      {systemReactionStrip}
                    </SystemMessageReactionMotion>
                  ) : null
                }
              />
              {canReact && hasSystemReactions && (
                <SystemMessageReactionMotion
                  messageId={currentMessage.id}
                  className="mt-0.5 flex justify-center"
                  suppressLayoutMotion={suppressOpenReactionMotion}
                >
                  {systemReactionStrip}
                </SystemMessageReactionMotion>
              )}
            </div>
          </LayoutGroup>
        </MessageRowDeleteMotion>
      ) : (
        <MessageRowDeleteMotion
          isDeleting={isDeleting}
          messageRef={messageRef}
          className={`group flex select-none ${isChannel ? 'justify-start' : isOwnMessage ? 'justify-end' : 'justify-start'} ${isLastInGroup ? 'mb-3.5' : hasReplies() ? 'mb-3' : 'mb-1'} relative overflow-visible`}
        >
          <div
            className={`flex ${isChannel ? 'w-full max-w-full' : currentMessage.poll ? 'w-[85%] min-w-[85%] flex-shrink-0' : 'max-w-[85%]'} ${isChannel ? 'flex-row' : isOwnMessage ? 'flex-row-reverse' : 'flex-row'} overflow-visible`}
          >
            {!isChannel && !isOwnMessage && (
              <div className="flex-shrink-0 mr-3 self-end pb-0.5">
                {isLastInGroup ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowPlayerCard(true);
                    }}
                    className="rounded-full p-0 flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer overflow-hidden"
                    aria-label={getSenderName()}
                  >
                    <PlayerAvatar
                      player={currentMessage.sender}
                      inlineFace
                      inlineFaceSize="md"
                      asDiv
                      subscribePresence={false}
                      showName={false}
                      fullHideName
                    />
                  </button>
                ) : (
                  <div className="w-8" aria-hidden />
                )}
              </div>
            )}

            <div
              className={`flex flex-col ${isChannel ? 'items-start flex-1' : isOwnMessage ? 'items-end' : 'items-start'} ${currentMessage.poll ? 'flex-1 min-w-0' : ''} overflow-visible`}
            >
              {!isChannel && !isOwnMessage && isFirstInGroup && (
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5 px-2">{getSenderName()}</span>
              )}

              <div className={`relative overflow-visible ${currentMessage.poll ? 'w-full' : ''}`}>
                {!isOffline && currentMessage.replyTo && (
                  <ReplyPreview
                    replyTo={currentMessage.replyTo}
                    onScrollToMessage={onScrollToMessage}
                    className="-mb-1"
                  />
                )}

                {storyReply && !currentMessage.replyTo && (
                  <StoryReplyPreview
                    storyReply={storyReply}
                    currentUserId={user?.id}
                    isOwnMessage={isOwnMessage}
                    onImageClick={handleImageClick}
                    onVideoOpen={handleVideoOpen}
                    className={`mb-1 flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}
                  />
                )}

                <div
                  className={`flex items-start select-none ${isChannel ? 'flex-row' : isOwnMessage ? 'flex-row-reverse' : 'flex-row'} ${currentMessage.poll ? 'w-full' : ''} overflow-visible`}
                >
                  <div className={`relative min-w-0 ${currentMessage.poll ? 'w-full' : ''}`}>
                    <MessageBubble
                      message={currentMessage}
                      isOwnMessage={isOwnMessage}
                      isChannel={isChannel}
                      groupPosition={groupPosition}
                      parsedContent={parsedContent}
                      translationContent={translationContent}
                      displayContent={displayContent}
                      hasTranslation={hasTranslation}
                      isTranslationLoading={isTranslationLoading}
                      translationRevealKey={translationRevealKey}
                      voiceTranscriptionNoSpeech={
                        currentMessage.messageType === 'VOICE' && isVoiceTranscriptionNoSpeech(voiceTxRaw)
                      }
                      onTranscribe={!isOffline ? () => void runTranscribe() : undefined}
                      isTranscribing={isTranscribing}
                      formatMessageTime={formatMessageTime}
                      getThumbnailUrl={getThumbnailUrl}
                      onImageClick={handleImageClick}
                      onVideoOpen={handleVideoOpen}
                      inlineVideoPlaybackPaused={!!fullscreenVideo}
                      onMentionClick={(userId) => setSelectedMentionUserId(userId)}
                      onUrlClick={handleUrlClick}
                      mentionIds={currentMessage.mentionIds || []}
                      currentUserId={user?.id}
                      onPollUpdated={onPollUpdated}
                      isSending={isSending}
                      isSendingSlow={isSendingSlow}
                      isFailed={isFailed}
                      showFailedMenu={showFailedMenu}
                      setShowFailedMenu={setShowFailedMenu}
                      optimisticId={optimisticId}
                      onResendQueued={onResendQueued}
                      onRemoveFromQueue={onRemoveFromQueue}
                      firstExternalHttpUrl={firstExternalHttpUrl}
                      initialLinkPreview={storedLinkPreview}
                      canDismissLinkPreview={isOwnMessage && !isOffline && !isSending}
                      onDismissLinkPreview={handleDismissLinkPreview}
                      loadMediaEager={loadMediaEager}
                      t={t}
                      isThreadSearchOutline={isThreadSearchOutline}
                      threadSearchHighlightQuery={threadSearchHighlightQuery}
                    />

                    {!isOffline && hasReplies() && (
                      <div
                        className={`absolute top-[calc(100%-2px)] ${isOwnMessage ? 'right-1' : 'left-2'} z-10 overflow-visible`}
                      >
                        <button
                          onClick={handleScrollToReplies}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[9px] transition-colors ${isOwnMessage ? 'text-blue-500 bg-blue-50 hover:text-blue-600 hover:bg-blue-100' : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                          title={`${getReplyCount()} ${getReplyCount() === 1 ? 'reply' : 'replies'}`}
                        >
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                          <span>{getReplyCount()}</span>
                        </button>
                      </div>
                    )}

                    {canReact && (
                      <div
                        className={`pointer-events-none absolute top-1/2 z-10 flex -translate-y-1/2 items-center ${
                          isOwnMessage && !isChannel ? 'right-full flex-row-reverse pr-2' : 'left-full flex-row pl-2'
                        }`}
                      >
                        <div className="pointer-events-auto">
                          <MessageItemReactionStrip
                            isOwnMessage={isOwnMessage}
                            isChannel={isChannel}
                            activeEmoji={getCurrentUserReaction()}
                            reactionCounts={getReactionCounts()}
                            pending={isReactionPending()}
                            onQuickReaction={handleQuickReaction}
                            suppressOpenReactionMotion={suppressOpenReactionMotion}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={MESSAGE_REACTION_GUTTER_CLASS} aria-hidden />
                </div>
              </div>
            </div>
          </div>
        </MessageRowDeleteMotion>
      )}

      {isMenuOpen && (
        <UnifiedMessageMenu
          message={currentMessage}
          isOwnMessage={isOwnMessage}
          currentReaction={getCurrentUserReaction()}
          showReply={showReply}
          onReply={onReplyMessage}
          onEdit={onEditMessage}
          onCopy={handleCopyMessage}
          onDelete={onDeleteMessage}
          onReactionSelect={onAddReaction}
          onReactionRemove={onRemoveReaction}
          onClose={onCloseContextMenu}
          messageElementRef={messageRef}
          onDeleteStart={handleDeleteStart}
          onReport={(msg) => setReportMessage(msg)}
          onTranslationUpdate={handleTranslationUpdate}
          isTranscribing={isTranscribing}
          onTranscribe={!isOffline ? runTranscribe : undefined}
          isPinned={isPinned}
          onPin={onPin}
          onUnpin={onUnpin}
          onForward={onForwardMessage}
        />
      )}

      {reportMessage && (
        <ReportMessageModal isOpen={!!reportMessage} message={reportMessage} onClose={() => setReportMessage(null)} />
      )}

      {showPlayerCard && !isSystemMessage && (
        <PlayerCardBottomSheet playerId={currentMessage.senderId!} onClose={() => setShowPlayerCard(false)} />
      )}

      {selectedMentionUserId && (
        <PlayerCardBottomSheet playerId={selectedMentionUserId} onClose={() => setSelectedMentionUserId(null)} />
      )}

      {fullscreenImage && (
        <FullscreenImageViewer
          imageUrl={fullscreenImage}
          onClose={() => setFullscreenImage(null)}
          isOpen={!!fullscreenImage}
        />
      )}

      {fullscreenVideo && (
        <FullscreenVideoViewer
          videoUrl={fullscreenVideo.videoUrl}
          posterUrl={fullscreenVideo.posterUrl}
          messageId={currentMessage.id}
          onClose={() => setFullscreenVideo(null)}
          isOpen={!!fullscreenVideo}
        />
      )}
    </>
  );
}, (prev, next) => {
  const menuEqual =
    (prev.contextMenuState.isOpen && prev.contextMenuState.messageId === prev.message.id) ===
    (next.contextMenuState.isOpen && next.contextMenuState.messageId === next.message.id);
  if (!menuEqual) return false;
  return messageRowPropsEqual(
    {
      message: prev.message,
      replyCount: prev.replyCount ?? 0,
      isPinned: prev.isPinned ?? false,
      loadMediaEager: prev.loadMediaEager ?? false,
      showReply: prev.showReply ?? true,
      isChannel: prev.isChannel ?? false,
      groupPosition: prev.groupPosition ?? 'single',
      isThreadSearchOutline: prev.isThreadSearchOutline ?? false,
      threadSearchHighlightQuery: prev.threadSearchHighlightQuery ?? null,
    },
    {
      message: next.message,
      replyCount: next.replyCount ?? 0,
      isPinned: next.isPinned ?? false,
      loadMediaEager: next.loadMediaEager ?? false,
      showReply: next.showReply ?? true,
      isChannel: next.isChannel ?? false,
      groupPosition: next.groupPosition ?? 'single',
      isThreadSearchOutline: next.isThreadSearchOutline ?? false,
      threadSearchHighlightQuery: next.threadSearchHighlightQuery ?? null,
    }
  );
})
;
