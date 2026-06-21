import React from 'react';
import { motion } from 'framer-motion';
import { ChatMessage } from '@/api/chat';
import { Languages } from 'lucide-react';
import { PollMessage } from '../chat/PollMessage';
import { MessageContentBody, ContentVariant } from './MessageContentBody';
import { MessageExternalLinkPreview } from './MessageExternalLinkPreview';
import { MessageMediaGrid } from './MessageMediaGrid';
import { AudioMessageBubble } from '../audio/AudioMessageBubble';
import { ChatVideoBubble } from './ChatVideoBubble';
import { ParsedContentPart } from './types';
import { Pencil } from 'lucide-react';
import { MessageSendStatusIcon } from './MessageSendStatusIcon';
import { resolveOwnMessageTicks } from '@/services/chat/messageTickState';
import { TFunction } from 'i18next';
import type { MessageGroupPosition } from '@/utils/chatMessageGrouping';

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
  voiceTranscriptionNoSpeech?: boolean;
  onVideoOpen?: (videoUrl: string, posterUrl: string) => void;
  inlineVideoPlaybackPaused?: boolean;
  loadMediaEager?: boolean;
  t: TFunction;
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
  voiceTranscriptionNoSpeech,
  onVideoOpen,
  inlineVideoPlaybackPaused = false,
  loadMediaEager = false,
  t,
}) => {
  const isVoice = message.messageType === 'VOICE';
  const isVideo = message.messageType === 'VIDEO';
  const hasVoiceTranscript =
    isVoice && !!(message.audioTranscription?.transcription?.trim() || message.content?.trim());
  const showTextBlock = !message.poll && (!!message.content?.trim() || hasVoiceTranscript);
  const hasMedia = !isVoice && !isVideo && message.mediaUrls && message.mediaUrls.length > 0;
  const hasMediaOnly = hasMedia && !message.content;
  const hasMediaAndContent = hasMedia && !!message.content;
  const mediaOnlyIconStyle = hasMediaOnly
    ? ({ filter: 'drop-shadow(0 0 2px #000) drop-shadow(0 0 4px #000) drop-shadow(1px 1px 2px #000) drop-shadow(-1px -1px 2px #000)' } as const)
    : undefined;
  const variant: ContentVariant = isChannel ? 'channel' : isOwnMessage ? 'own' : 'other';
  const { tickRead, tickDelivered } = resolveOwnMessageTicks(message);
  const contentVariantForTranslation = isOwnMessage ? 'own' : 'other';
  const hasMediaOrVoice = isVoice || isVideo || hasMedia;
  const paddingClass = hasTranslation
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
  const useGroupedCorners = !isChannel && !message.poll;
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
  const bubbleClass = `${hasMediaOrVoice ? '' : 'px-4'} ${paddingClass} rounded-2xl ${groupedCornerClass} shadow-sm relative min-w-[120px] ${isVoice ? 'overflow-visible' : hasMedia ? 'overflow-hidden' : 'overflow-visible'} ${message.poll ? 'flex-1 min-w-0' : ''} ${isChannel || message.poll ? 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200' : isOwnMessage ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-blue-900/10 dark:from-blue-600 dark:to-blue-700' : 'bg-white dark:bg-gray-700 border border-gray-200/80 dark:border-gray-600/60 text-gray-800 dark:text-gray-200'}`;
  const timeRowClass = `${hasMediaOnly ? 'absolute bottom-1 right-2' : 'flex justify-end mt-0.5'} ${hasMediaAndContent ? 'px-4' : ''} ${isVoice ? 'px-3' : ''} ${isChannel ? 'text-gray-400 dark:text-gray-500' : isOwnMessage ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'} ${hasMediaOnly ? 'drop-shadow-[0_0_3px_rgba(0,0,0,1)] drop-shadow-[0_0_6px_rgba(0,0,0,0.9)] drop-shadow-[0_1px_1px_rgba(0,0,0,1)]' : ''}`;
  const timeSpanStyle = hasMediaOnly ? { textShadow: '0 0 2px #000, 0 0 4px #000, 1px 1px 2px #000, -1px -1px 2px #000, 0 1px 2px #000, 1px 0 2px #000, -1px 0 2px #000, 0 -1px 2px #000' } : undefined;

  return (
    <div data-message-bubble="true" className={bubbleClass}>
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

      {message.mediaUrls && message.mediaUrls.length > 0 && !isVoice && !isVideo && (
        <MessageMediaGrid
          mediaUrls={message.mediaUrls}
          getThumbnailUrl={getThumbnailUrl}
          onImageClick={onImageClick}
          hasContentBelow={!!message.content}
          loadEager={loadMediaEager}
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
            <div className="space-y-2">
              <div className="pb-2 border-b border-gray-300 dark:border-gray-600">
                <MessageContentBody
                  parts={parsedContent}
                  fallbackContent={displayContent}
                  variant={variant}
                  mentionIds={mentionIds}
                  currentUserId={currentUserId}
                  onMentionClick={onMentionClick}
                  onUrlClick={onUrlClick}
                />
              </div>
              <motion.div
                key={translationRevealKey ?? 'translation'}
                initial={translationRevealKey ? { opacity: 0, y: 6 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className={isChannel ? 'text-gray-600 dark:text-gray-400' : isOwnMessage ? 'text-blue-50' : 'text-gray-600 dark:text-gray-400'}
              >
                <p className="text-[10px] uppercase tracking-wide opacity-70 mb-1 flex items-center gap-1">
                  <Languages size={10} aria-hidden />
                  {t('chat.autoTranslatedLabel', { defaultValue: 'Translated' })}
                </p>
                <MessageContentBody
                  parts={translationContent}
                  fallbackContent={message.translation?.translation}
                  variant={contentVariantForTranslation}
                  mentionIds={mentionIds}
                  currentUserId={currentUserId}
                  onMentionClick={onMentionClick}
                  onUrlClick={onUrlClick}
                />
              </motion.div>
            </div>
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
            />
          )}
          {firstExternalHttpUrl && <MessageExternalLinkPreview url={firstExternalHttpUrl} variant={variant} />}
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
              t={t}
            />
          )}
        </span>
      </div>
    </div>
  );
};
