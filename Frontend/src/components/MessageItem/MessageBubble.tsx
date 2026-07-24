import React from 'react';
import { motion } from 'framer-motion';
import { ChatMessage } from '@/api/chat';
import { PollMessage } from '../chat/PollMessage';
import { MessageContentBody, ContentVariant } from './MessageContentBody';
import { MessageTranslationBody } from './MessageTranslationBody';
import { MessageExternalLinkPreview } from './MessageExternalLinkPreview';
import { MessageMediaGrid } from './MessageMediaGrid';
import { AudioMessageBubble } from '../audio/AudioMessageBubble';
import { ChatVideoBubble } from './ChatVideoBubble';
import { ChatDocumentBubble } from './ChatDocumentBubble';
import { StickerMessageBubble } from './StickerMessageBubble';
import { getThreadSearchBubbleRingClass } from './threadSearchHighlightStyles';
import { isAnimatedChatImageUrl } from './utils';
import { peekCachedLinkPreview } from './linkPreview/useLinkPreview';
import { Pencil } from 'lucide-react';
import { MessageSendStatusIcon } from './MessageSendStatusIcon';
import { resolveOwnMessageTicks } from '@/services/chat/messageTickState';
import { TFunction } from 'i18next';
import type { MessageGroupPosition } from '@/utils/chatMessageGrouping';
import type { ParsedContentPart } from './types';
import { matchesMessageUrl } from './messageUrlMatch';

interface MessageBubbleProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  isChannel: boolean;
  groupPosition?: MessageGroupPosition;
  parsedContent: ParsedContentPart[] | null;
  translationContent: ParsedContentPart[] | null;
  displayContent: string;
  hasTranslation: boolean;
  isTranslationLoading?: boolean;
  translationRevealKey?: string;
  formatMessageTime: (dateString: string) => string;
  getThumbnailUrl: (index: number) => string;
  onImageClick: (url: string) => void;
  onMentionClick: (userId: string) => void;
  onUrlClick: (url: string, e: React.MouseEvent) => void;
  mentionIds: string[];
  currentUserId: string | undefined;
  onPollUpdated?: (messageId: string, updatedPoll: import('@/api/chat').Poll) => void;
  isSending: boolean;
  isSendingSlow?: boolean;
  isFailed: boolean;
  showFailedMenu: boolean;
  setShowFailedMenu: (v: boolean | ((prev: boolean) => boolean)) => void;
  optimisticId: string | undefined;
  onResendQueued?: (tempId: string) => void;
  onRemoveFromQueue?: (tempId: string) => void;
  onTranscribe?: () => void;
  isTranscribing?: boolean;
  firstExternalHttpUrl?: string | null;
  initialLinkPreview?: import('@/api/linkPreview').LinkPreviewData | null;
  canDismissLinkPreview?: boolean;
  onDismissLinkPreview?: () => Promise<void> | void;
  voiceTranscriptionNoSpeech?: boolean;
  onVideoOpen?: (videoUrl: string, posterUrl: string) => void;
  inlineVideoPlaybackPaused?: boolean;
  loadMediaEager?: boolean;
  t: TFunction;
  isThreadSearchOutline?: boolean;
  threadSearchHighlightQuery?: string | null;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwnMessage,
  isChannel,
  groupPosition = 'single',
  parsedContent,
  translationContent,
  displayContent,
  hasTranslation,
  isTranslationLoading = false,
  translationRevealKey,
  formatMessageTime,
  getThumbnailUrl,
  onImageClick,
  onMentionClick,
  onUrlClick,
  mentionIds,
  currentUserId,
  onPollUpdated,
  isSending,
  isSendingSlow = false,
  isFailed,
  showFailedMenu,
  setShowFailedMenu,
  optimisticId,
  onResendQueued,
  onRemoveFromQueue,
  onTranscribe,
  isTranscribing,
  firstExternalHttpUrl,
  initialLinkPreview,
  canDismissLinkPreview = false,
  onDismissLinkPreview,
  voiceTranscriptionNoSpeech,
  onVideoOpen,
  inlineVideoPlaybackPaused = false,
  loadMediaEager = false,
  t,
  isThreadSearchOutline = false,
  threadSearchHighlightQuery = null,
}) => {
  const isVoice = message.messageType === 'VOICE';
  const isVideo = message.messageType === 'VIDEO';
  const isSticker = message.messageType === 'STICKER';
  const isDocument = message.messageType === 'DOCUMENT';
  const hasVoiceTranscript =
    isVoice && !!(message.audioTranscription?.transcription?.trim() || message.content?.trim());
  const showTextBlock =
    !message.poll && !isSticker && !isDocument && (!!message.content?.trim() || hasVoiceTranscript);
  const hasMedia =
    !isVoice && !isVideo && !isSticker && !isDocument && message.mediaUrls && message.mediaUrls.length > 0;
  const hasMediaOnly = hasMedia && !message.content;
  const hasMediaAndContent = hasMedia && !!message.content;
  // Telegram-style: sticker / lone GIF float with no bubble panel.
  const isGifOnly =
    !!hasMediaOnly &&
    (message.mediaUrls?.length ?? 0) === 1 &&
    isAnimatedChatImageUrl(message.mediaUrls?.[0]);
  const isFloatingMedia = isSticker || isGifOnly;
  const overlayMeta = isFloatingMedia || hasMediaOnly;
  const mediaOnlyIconStyle = overlayMeta
    ? ({ filter: 'drop-shadow(0 0 2px #000) drop-shadow(0 0 4px #000) drop-shadow(1px 1px 2px #000) drop-shadow(-1px -1px 2px #000)' } as const)
    : undefined;
  const variant: ContentVariant = isChannel ? 'channel' : isOwnMessage ? 'own' : 'other';
  const [loadedBandejaPreview, setLoadedBandejaPreview] = React.useState(() => {
    if (message.linkPreviewDisabled) return false;
    if (initialLinkPreview?.source === 'bandeja') return true;
    return (
      !!firstExternalHttpUrl &&
      peekCachedLinkPreview(firstExternalHttpUrl)?.source === 'bandeja'
    );
  });
  React.useEffect(() => {
    if (message.linkPreviewDisabled) setLoadedBandejaPreview(false);
  }, [message.linkPreviewDisabled]);
  const isPreviewOnlyMessage =
    loadedBandejaPreview &&
    !!firstExternalHttpUrl &&
    (parsedContent
      ? parsedContent.every(
          (part) =>
            (part.type === 'text' && !part.content.trim()) ||
            (part.type === 'url' && matchesMessageUrl(part.url, firstExternalHttpUrl))
        )
      : matchesMessageUrl(message.content?.trim(), firstExternalHttpUrl));
  const { tickRead, tickDelivered } = resolveOwnMessageTicks(message, currentUserId);
  const contentVariantForTranslation = isOwnMessage ? 'own' : 'other';
  const hasMediaOrVoice = isVoice || isVideo || isSticker || isDocument || hasMedia;
  const paddingClass = isFloatingMedia || isPreviewOnlyMessage
    ? 'p-0'
    : hasTranslation
      ? 'pt-2 pb-4'
      : hasMediaAndContent
        ? 'pt-0 pb-2'
        : hasMedia
          ? 'py-0'
          : isVoice && !showTextBlock
            ? 'py-1'
            : isVoice && showTextBlock
              ? 'pt-1 pb-2'
              : 'py-2';
  const useGroupedCorners = !isChannel && !message.poll && !isFloatingMedia;
  const groupedCornerClass = !useGroupedCorners
    ? ''
    : isOwnMessage
      ? groupPosition === 'first'
        ? 'rounded-br-md'
        : groupPosition === 'middle'
          ? 'rounded-tr-md rounded-br-md'
          : groupPosition === 'last'
            ? 'rounded-tr-md'
            : ''
      : groupPosition === 'first'
        ? 'rounded-bl-md'
        : groupPosition === 'middle'
          ? 'rounded-tl-md rounded-bl-md'
          : groupPosition === 'last'
            ? 'rounded-tl-md'
            : '';
  const chromeClass = isFloatingMedia || isPreviewOnlyMessage
    ? 'bg-transparent border-0 shadow-none rounded-none min-w-0 overflow-visible'
    : [
        'rounded-2xl shadow-sm min-w-[120px]',
        isVoice ? 'overflow-visible' : hasMedia ? 'overflow-hidden' : 'overflow-visible',
        isChannel || message.poll
          ? 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200'
          : isOwnMessage
            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-blue-900/10 dark:from-blue-600 dark:to-blue-700'
            : 'bg-white dark:bg-gray-700 border border-gray-200/80 dark:border-gray-600/60 text-gray-800 dark:text-gray-200',
      ].join(' ');
  const bubbleClass = [
    hasMediaOrVoice || isFloatingMedia || isPreviewOnlyMessage ? '' : 'px-4',
    paddingClass,
    groupedCornerClass,
    'relative',
    message.poll ? 'flex-1 min-w-0' : '',
    chromeClass,
    isThreadSearchOutline ? getThreadSearchBubbleRingClass(isOwnMessage, isChannel) : '',
  ]
    .filter(Boolean)
    .join(' ');
  const timeRowClass = isPreviewOnlyMessage
    ? 'flex justify-end mt-0.5 px-2 text-gray-400 dark:text-gray-500'
    : [
    overlayMeta ? 'absolute bottom-1 right-2' : 'flex justify-end mt-0.5',
    hasMediaAndContent ? 'px-4' : '',
    isVoice && !isFloatingMedia ? 'px-3' : '',
    overlayMeta
      ? 'text-white'
      : isOwnMessage && !isChannel
        ? 'text-blue-100'
        : 'text-gray-400 dark:text-gray-500',
    overlayMeta
      ? 'drop-shadow-[0_0_3px_rgba(0,0,0,1)] drop-shadow-[0_0_6px_rgba(0,0,0,0.9)] drop-shadow-[0_1px_1px_rgba(0,0,0,1)]'
      : '',
      ]
        .filter(Boolean)
        .join(' ');
  const timeSpanStyle = overlayMeta
    ? {
        textShadow:
          '0 0 2px #000, 0 0 4px #000, 1px 1px 2px #000, -1px -1px 2px #000, 0 1px 2px #000, 1px 0 2px #000, -1px 0 2px #000, 0 -1px 2px #000',
      }
    : undefined;

  return (
    <div
      data-message-bubble="true"
      data-floating-media={isFloatingMedia ? 'true' : undefined}
      className={bubbleClass}
    >
      {message.poll && (
        <div className="py-1">
          <PollMessage poll={message.poll} messageId={message.id} onPollUpdated={onPollUpdated} />
        </div>
      )}

      {isVoice && message.mediaUrls?.[0] && (
        <AudioMessageBubble
          message={message}
          isOwnMessage={isOwnMessage}
          isChannel={isChannel}
          onTranscribe={onTranscribe}
          isTranscribing={isTranscribing}
        />
      )}

      {isVideo && message.mediaUrls?.[0] && (
        <ChatVideoBubble
          message={message}
          isSending={isSending}
          optimisticId={optimisticId}
          posterUrl={getThumbnailUrl(0) || message.thumbnailUrls?.[0] || message.mediaUrls[0]}
          inlinePlaybackPaused={inlineVideoPlaybackPaused}
          onOpenFullscreen={onVideoOpen}
        />
      )}

      {isSticker && (
        <StickerMessageBubble message={message} onStickerClick={onImageClick} />
      )}

      {isDocument && (message.mediaUrls?.[0] || message.documentFileName) && (
        <ChatDocumentBubble
          message={message}
          isOwnMessage={isOwnMessage}
          isChannel={isChannel}
          isSending={isSending}
        />
      )}

      {message.mediaUrls && message.mediaUrls.length > 0 && !isVoice && !isVideo && !isSticker && !isDocument && (
        <MessageMediaGrid
          mediaUrls={message.mediaUrls}
          getThumbnailUrl={getThumbnailUrl}
          onImageClick={onImageClick}
          hasContentBelow={!!message.content}
          loadEager={loadMediaEager}
          floating={isGifOnly}
        />
      )}

      {showTextBlock && (
        <div className={`w-full ${hasMedia ? 'px-4' : isVoice ? 'px-3' : ''} overflow-visible`}>
          {voiceTranscriptionNoSpeech && !hasTranslation ? (
            <p
              className={`text-xs text-center italic select-none ${
                isChannel
                  ? 'text-gray-500 dark:text-gray-400'
                  : isOwnMessage
                    ? 'text-blue-100/90'
                    : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {displayContent}
            </p>
          ) : hasTranslation ? (
            <MessageTranslationBody
              messageId={message.id}
              parsedContent={parsedContent}
              translationContent={translationContent}
              displayContent={displayContent}
              translationFallback={message.translation?.translation}
              variant={variant}
              contentVariantForTranslation={contentVariantForTranslation}
              mentionIds={mentionIds}
              currentUserId={currentUserId}
              onMentionClick={onMentionClick}
              onUrlClick={onUrlClick}
              threadSearchHighlightQuery={threadSearchHighlightQuery}
              isChannel={isChannel}
              isOwnMessage={isOwnMessage}
              translationRevealKey={translationRevealKey}
              hiddenUrl={loadedBandejaPreview ? firstExternalHttpUrl : null}
              t={t}
            />
          ) : isTranslationLoading ? (
            <motion.div className="space-y-2" layout>
              <MessageContentBody
                parts={parsedContent}
                fallbackContent={displayContent}
                variant={variant}
                mentionIds={mentionIds}
                currentUserId={currentUserId}
                onMentionClick={onMentionClick}
                onUrlClick={onUrlClick}
                threadSearchHighlightQuery={threadSearchHighlightQuery}
                hiddenUrl={loadedBandejaPreview ? firstExternalHttpUrl : null}
              />
              <p className="text-xs italic opacity-80">
                {t('chat.translating', { defaultValue: 'Translating…' })}
              </p>
            </motion.div>
          ) : (
            <MessageContentBody
              parts={parsedContent}
              fallbackContent={displayContent}
              variant={variant}
              mentionIds={mentionIds}
              currentUserId={currentUserId}
              onMentionClick={onMentionClick}
              onUrlClick={onUrlClick}
              threadSearchHighlightQuery={threadSearchHighlightQuery}
              hiddenUrl={loadedBandejaPreview ? firstExternalHttpUrl : null}
            />
          )}
          {firstExternalHttpUrl && !message.linkPreviewDisabled && (
            <MessageExternalLinkPreview
              url={firstExternalHttpUrl}
              variant={variant}
              initialPreview={initialLinkPreview}
              onUrlClick={onUrlClick}
              canDismiss={canDismissLinkPreview}
              onDismiss={onDismissLinkPreview}
              onLoadedBandejaChange={setLoadedBandejaPreview}
              standalone={isPreviewOnlyMessage}
            />
          )}
        </div>
      )}

      <div className={timeRowClass}>
        <span className="text-[10px] whitespace-nowrap inline-flex items-center gap-1" style={timeSpanStyle}>
          {message.editedAt && (
            <span title={t('chat.edited', { defaultValue: 'edited' })}>
              <Pencil size={10} className="inline opacity-80" />
            </span>
          )}
          {formatMessageTime(message.createdAt)}
          {isOwnMessage && (
            <MessageSendStatusIcon
              isSending={isSending}
              isSendingSlow={isSendingSlow}
              isFailed={isFailed}
              tickRead={tickRead}
              tickDelivered={tickDelivered}
              message={message}
              showFailedMenu={showFailedMenu}
              setShowFailedMenu={setShowFailedMenu}
              optimisticId={optimisticId}
              onResendQueued={onResendQueued}
              onRemoveFromQueue={onRemoveFromQueue}
              iconStyle={mediaOnlyIconStyle}
              tickSurface={overlayMeta ? 'media' : 'bubble'}
              viewerUserId={currentUserId}
              t={t}
            />
          )}
        </span>
      </div>
    </div>
  );
};
