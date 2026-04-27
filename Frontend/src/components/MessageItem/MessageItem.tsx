import React, { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ChatMessage, ChatMessageWithStatus, chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { UnifiedMessageMenu } from '../UnifiedMessageMenu';
import { ReplyPreview } from '../ReplyPreview';
import { PlayerCardBottomSheet } from '../PlayerCardBottomSheet';
import { formatSystemMessageForDisplay, SystemMessageType } from '@/utils/systemMessages';
import { FullscreenImageViewer } from '../FullscreenImageViewer';
import { ReportMessageModal } from '../ReportMessageModal';
import { extractLanguageCode } from '@/utils/language';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { MessageItemProps } from './types';
import { parseContentWithMentionsAndUrls, formatMessageTime as formatMessageTimeUtil } from './utils';
import { formatVoiceTranscriptionForDisplay, isVoiceTranscriptionNoSpeech } from '@/utils/voiceTranscriptionDisplay';
import { SystemMessageBlock } from './SystemMessageBlock';
import { MessageBubble } from './MessageBubble';
import { PlayerAvatar } from '../PlayerAvatar';
import { useMessageLongPress } from './useMessageLongPress';
import { useMessageReactions } from './useMessageReactions';

export const MessageItem: React.FC<MessageItemProps> = ({
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
  allMessages = [],
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
}) => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const messageRef = useRef<HTMLDivElement>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPlayerCard, setShowPlayerCard] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [reportMessage, setReportMessage] = useState<ChatMessage | null>(null);
  const [selectedMentionUserId, setSelectedMentionUserId] = useState<string | null>(null);
  const [showFailedMenu, setShowFailedMenu] = useState(false);
  const [respondingToRequest, setRespondingToRequest] = useState(false);
  const [currentMessage, setCurrentMessage] = useState(message);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const isOwnMessage = currentMessage.senderId === user?.id;
  const isSystemMessage = !currentMessage.senderId;
  const isSending = (currentMessage as ChatMessageWithStatus)._status === 'SENDING';
  const isFailed = (currentMessage as ChatMessageWithStatus)._status === 'FAILED';
  const isOffline = isSending || isFailed;
  const optimisticId = (currentMessage as ChatMessageWithStatus)._optimisticId;
  const isMenuOpen = contextMenuState.isOpen && contextMenuState.messageId === currentMessage.id;

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
    allMessages,
    isOffline,
    onScrollToMessage,
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
    ? formatSystemMessageForDisplay(currentMessage.content, t)
    : currentMessage.messageType === 'VOICE' && voiceTxRaw?.trim()
      ? formatVoiceTranscriptionForDisplay(voiceTxRaw, t)
      : currentMessage.content;

  const parsedContent = isSystemMessage ? null : parseContentWithMentionsAndUrls(displayContent);
  const firstExternalHttpUrl = useMemo(() => {
    if (!parsedContent) return null;
    for (const part of parsedContent) {
      if (part.type !== 'url' || !part.url) continue;
      if (part.urlType && part.urlType !== 'other') continue;
      try {
        const u = new URL(part.url);
        if (u.protocol === 'http:' || u.protocol === 'https:') return part.url;
      } catch {
        /* skip */
      }
    }
    return null;
  }, [parsedContent]);
  const userLanguageCode = user?.language ? extractLanguageCode(user.language).toLowerCase() : 'en';

  let matchingTranslation = currentMessage.translation;
  if (currentMessage.translations && currentMessage.translations.length > 0) {
    matchingTranslation =
      currentMessage.translations.find((tr) => tr.languageCode.toLowerCase() === userLanguageCode) ||
      currentMessage.translation;
  }
  const hasTranslation =
    !!matchingTranslation && matchingTranslation.languageCode.toLowerCase() === userLanguageCode;
  const translationContent =
    hasTranslation && matchingTranslation
      ? parseContentWithMentionsAndUrls(matchingTranslation.translation)
      : null;

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

  const getThumbnailUrl = (index: number): string => {
    if (currentMessage.thumbnailUrls?.[index]) return currentMessage.thumbnailUrls[index] || '';
    return currentMessage.mediaUrls?.[index] || '';
  };

  const handleImageClick = (url: string) => setFullscreenImage(url || null);

  const handleCopyMessage = (msg: ChatMessage) => {
    let text: string;
    if (!msg.senderId) {
      text = formatSystemMessageForDisplay(msg.content, t);
    } else if (msg.messageType === 'VOICE' && msg.audioTranscription?.transcription?.trim()) {
      text = formatVoiceTranscriptionForDisplay(msg.audioTranscription.transcription, t);
    } else {
      text = msg.content ?? '';
    }
    void navigator.clipboard.writeText(text);
  };

  const handleQuickReaction = (e: React.MouseEvent) => {
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
      if (
        url &&
        (url.includes(window.location.origin) || url.includes('bandeja.me') || url.includes('localhost'))
      ) {
        e.preventDefault();
        try {
          const urlObj = new URL(url);
          navigate(urlObj.pathname + urlObj.search + urlObj.hash);
        } catch {
          window.open(url, '_blank');
        }
      }
    },
    [navigate]
  );

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

  return (
    <>
      {isSystemMessage ? (
        <div
          ref={messageRef}
          className={`group flex justify-center mb-4 relative transition-all duration-300 ease-out overflow-visible ${isDeleting ? 'opacity-0 scale-75 translate-y-[-20px] transform-gpu' : 'opacity-100 scale-100 translate-y-0'}`}
        >
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
          />
        </div>
      ) : (
        <div
          ref={messageRef}
          className={`group flex select-none ${isChannel ? 'justify-start' : isOwnMessage ? 'justify-end' : 'justify-start'} mb-4 relative transition-all duration-300 ease-out overflow-visible ${isDeleting ? 'opacity-0 scale-75 translate-y-[-20px] transform-gpu' : 'opacity-100 scale-100 translate-y-0'}`}
        >
          <div
            className={`flex ${isChannel ? 'w-full max-w-full' : currentMessage.poll ? 'w-[85%] min-w-[85%] flex-shrink-0' : 'max-w-[85%]'} ${isChannel ? 'flex-row' : isOwnMessage ? 'flex-row-reverse' : 'flex-row'} overflow-visible`}
          >
            {!isChannel && !isOwnMessage && (
              <div className="flex-shrink-0 mr-3 self-center">
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
              </div>
            )}

            <div
              className={`flex flex-col ${isChannel ? 'items-start flex-1' : isOwnMessage ? 'items-end' : 'items-start'} ${currentMessage.poll ? 'flex-1 min-w-0' : ''} overflow-visible`}
            >
              {!isChannel && !isOwnMessage && (
                <span className="text-xs text-gray-500 dark:text-gray-400 mb-0.5 px-2">{getSenderName()}</span>
              )}

              <div className={`relative overflow-visible ${currentMessage.poll ? 'w-full' : ''}`}>
                {!isOffline && currentMessage.replyTo && (
                  <ReplyPreview
                    replyTo={currentMessage.replyTo}
                    onScrollToMessage={onScrollToMessage}
                    className="-mb-1"
                  />
                )}

                <div
                  className={`flex items-start select-none ${isChannel ? 'flex-row' : isOwnMessage ? 'flex-row-reverse' : 'flex-row'} ${currentMessage.poll ? 'w-full' : ''} overflow-visible`}
                >
                  <MessageBubble
                    message={currentMessage}
                    isOwnMessage={isOwnMessage}
                    isChannel={isChannel}
                    parsedContent={parsedContent}
                    translationContent={translationContent}
                    displayContent={displayContent}
                    hasTranslation={hasTranslation}
                    voiceTranscriptionNoSpeech={
                      currentMessage.messageType === 'VOICE' && isVoiceTranscriptionNoSpeech(voiceTxRaw)
                    }
                    onTranscribe={!isOffline ? () => void runTranscribe() : undefined}
                    isTranscribing={isTranscribing}
                    formatMessageTime={formatMessageTime}
                    getThumbnailUrl={getThumbnailUrl}
                    onImageClick={handleImageClick}
                    onMentionClick={(userId) => setSelectedMentionUserId(userId)}
                    onUrlClick={handleUrlClick}
                    mentionIds={currentMessage.mentionIds || []}
                    currentUserId={user?.id}
                    onPollUpdated={onPollUpdated}
                    isSending={isSending}
                    isFailed={isFailed}
                    showFailedMenu={showFailedMenu}
                    setShowFailedMenu={setShowFailedMenu}
                    optimisticId={optimisticId}
                    onResendQueued={onResendQueued}
                    onRemoveFromQueue={onRemoveFromQueue}
                    firstExternalHttpUrl={!isOffline ? firstExternalHttpUrl : null}
                    t={t}
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

                  {!isOffline && (
                    <div
                      className={`flex items-center gap-1 ${isOwnMessage ? 'flex-row-reverse mr-1' : 'flex-row ml-1'} self-center`}
                    >
                      <button
                        data-reaction-button="true"
                        onClick={handleQuickReaction}
                        disabled={isReactionPending()}
                        className="relative flex flex-col items-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full p-1 transition-colors disabled:opacity-70 disabled:cursor-wait"
                      >
                        {isReactionPending() ? (
                          <div className="flex flex-col items-center">
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                              {getCurrentUserReaction() || '…'}
                            </span>
                          </div>
                        ) : (
                          <>
                            <span className="text-lg">
                              {getCurrentUserReaction() || (
                                <span className="text-gray-600 dark:text-white">♡</span>
                              )}
                            </span>
                            <span
                              className={`text-xs text-gray-500 dark:text-gray-400 -mt-1 ${getCurrentUserReaction() && getReactionCounts()[getCurrentUserReaction()!] > 1 ? 'visible' : 'invisible'}`}
                            >
                              {getCurrentUserReaction() ? getReactionCounts()[getCurrentUserReaction()!] || '1' : '1'}
                            </span>
                          </>
                        )}
                      </button>

                      {currentMessage.reactions.length > 0 && (
                        <div className="flex gap-1">
                          {Object.entries(getReactionCounts()).map(([emoji, count]) => {
                            const isUserReaction = getCurrentUserReaction() === emoji;
                            if (isUserReaction) return null;
                            return (
                              <div
                                key={emoji}
                                className="relative flex flex-col items-center"
                                onMouseDown={(e) => e.stopPropagation()}
                                onMouseUp={(e) => e.stopPropagation()}
                                onMouseLeave={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
                                onTouchEnd={(e) => e.stopPropagation()}
                                onTouchCancel={(e) => e.stopPropagation()}
                              >
                                <span className="text-sm">{emoji}</span>
                                <span
                                  className={`text-xs text-gray-500 dark:text-gray-400 -mt-1 ${count > 1 ? 'visible' : 'invisible'}`}
                                >
                                  {count}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
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
    </>
  );
};
