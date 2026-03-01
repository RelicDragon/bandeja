import React from 'react';
import { ChatMessage } from '@/api/chat';
import { PollMessage } from '../chat/PollMessage';
import { MessageContentBody, ContentVariant } from './MessageContentBody';
import { MessageMediaGrid } from './MessageMediaGrid';
import { ParsedContentPart } from './types';
import { AlertCircle, Pencil } from 'lucide-react';
import { DoubleTickIcon } from '../DoubleTickIcon';
import { TFunction } from 'i18next';

interface MessageBubbleProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  isChannel: boolean;
  parsedContent: ParsedContentPart[] | null;
  translationContent: ParsedContentPart[] | null;
  displayContent: string;
  hasTranslation: boolean;
  formatMessageTime: (dateString: string) => string;
  getThumbnailUrl: (index: number) => string;
  onImageClick: (url: string) => void;
  onMentionClick: (userId: string) => void;
  onUrlClick: (url: string, e: React.MouseEvent) => void;
  mentionIds: string[];
  currentUserId: string | undefined;
  onPollUpdated?: (messageId: string, updatedPoll: import('@/api/chat').Poll) => void;
  isSending: boolean;
  isFailed: boolean;
  showFailedMenu: boolean;
  setShowFailedMenu: (v: boolean | ((prev: boolean) => boolean)) => void;
  optimisticId: string | undefined;
  onResendQueued?: (tempId: string) => void;
  onRemoveFromQueue?: (tempId: string) => void;
  t: TFunction;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwnMessage,
  isChannel,
  parsedContent,
  translationContent,
  displayContent,
  hasTranslation,
  formatMessageTime,
  getThumbnailUrl,
  onImageClick,
  onMentionClick,
  onUrlClick,
  mentionIds,
  currentUserId,
  onPollUpdated,
  isSending,
  isFailed,
  showFailedMenu,
  setShowFailedMenu,
  optimisticId,
  onResendQueued,
  onRemoveFromQueue,
  t,
}) => {
  const hasMedia = message.mediaUrls && message.mediaUrls.length > 0;
  const hasMediaOnly = hasMedia && !message.content;
  const hasMediaAndContent = hasMedia && !!message.content;
  const mediaOnlyIconStyle = hasMediaOnly
    ? ({ filter: 'drop-shadow(0 0 2px #000) drop-shadow(0 0 4px #000) drop-shadow(1px 1px 2px #000) drop-shadow(-1px -1px 2px #000)' } as const)
    : undefined;
  const variant: ContentVariant = isChannel ? 'channel' : isOwnMessage ? 'own' : 'other';
  const contentVariantForTranslation = isOwnMessage ? 'own' : 'other';

  const paddingClass = hasTranslation
    ? 'pt-2 pb-4'
    : hasMediaAndContent
      ? 'pt-0 pb-2'
      : hasMedia
        ? 'py-0'
        : 'py-2';
  const bubbleClass = `${hasMedia ? '' : 'px-4'} ${paddingClass} rounded-2xl shadow-sm relative min-w-[120px] ${hasMedia ? 'overflow-hidden' : 'overflow-visible'} ${message.poll ? 'flex-1 min-w-0' : ''} ${isChannel || message.poll ? 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200' : isOwnMessage ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white' : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200'}`;
  const timeRowClass = `${hasMediaOnly ? 'absolute bottom-1 right-2' : 'flex justify-end mt-0.5'} ${hasMediaAndContent ? 'px-4' : ''} ${isChannel ? 'text-gray-400 dark:text-gray-500' : isOwnMessage ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'} ${hasMediaOnly ? 'drop-shadow-[0_0_3px_rgba(0,0,0,1)] drop-shadow-[0_0_6px_rgba(0,0,0,0.9)] drop-shadow-[0_1px_1px_rgba(0,0,0,1)]' : ''}`;
  const timeSpanStyle = hasMediaOnly ? { textShadow: '0 0 2px #000, 0 0 4px #000, 1px 1px 2px #000, -1px -1px 2px #000, 0 1px 2px #000, 1px 0 2px #000, -1px 0 2px #000, 0 -1px 2px #000' } : undefined;

  return (
    <div data-message-bubble="true" className={bubbleClass}>
      {message.poll && (
        <div className="py-1">
          <PollMessage poll={message.poll} messageId={message.id} onPollUpdated={onPollUpdated} />
        </div>
      )}

      {message.mediaUrls && message.mediaUrls.length > 0 && (
        <MessageMediaGrid
          mediaUrls={message.mediaUrls}
          getThumbnailUrl={getThumbnailUrl}
          onImageClick={onImageClick}
          hasContentBelow={!!message.content}
        />
      )}

      {message.content && !message.poll && (
        <div className={`w-full ${hasMedia ? 'px-4' : ''} overflow-visible`}>
          {hasTranslation ? (
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
              <div className={isChannel ? 'text-gray-600 dark:text-gray-400' : isOwnMessage ? 'text-blue-50' : 'text-gray-600 dark:text-gray-400'}>
                <MessageContentBody
                  parts={translationContent}
                  fallbackContent={message.translation?.translation}
                  variant={contentVariantForTranslation}
                  mentionIds={mentionIds}
                  currentUserId={currentUserId}
                  onMentionClick={onMentionClick}
                  onUrlClick={onUrlClick}
                />
              </div>
            </div>
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
            <>
              {isSending ? (
                <span className="inline-flex items-center gap-0.5" title="Sending..." style={mediaOnlyIconStyle}>
                  <span className="w-1.5 h-1.5 bg-current rounded-full opacity-70 wavy-dot-1" />
                  <span className="w-1.5 h-1.5 bg-current rounded-full opacity-70 wavy-dot-2" />
                  <span className="w-1.5 h-1.5 bg-current rounded-full opacity-70 wavy-dot-3" />
                </span>
              ) : isFailed ? (
                <span className="relative inline-flex items-center" style={mediaOnlyIconStyle}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowFailedMenu((v) => !v);
                    }}
                    className="p-0.5 rounded hover:bg-white/20"
                    title={t('chat.failedToSend', { defaultValue: 'Failed to send' })}
                  >
                    <AlertCircle size={14} className="text-red-200" />
                  </button>
                  {showFailedMenu && optimisticId && (onResendQueued || onRemoveFromQueue) && (
                    <div className="absolute right-0 bottom-full mb-1 flex flex-col gap-0.5 rounded-lg bg-gray-800 dark:bg-gray-700 py-1 shadow-lg z-50 min-w-[100px]">
                      {onResendQueued && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowFailedMenu(false);
                            onResendQueued(optimisticId);
                          }}
                          className="px-3 py-1.5 text-left text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600"
                        >
                          {t('chat.resend', { defaultValue: 'Resend' })}
                        </button>
                      )}
                      {onRemoveFromQueue && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowFailedMenu(false);
                            onRemoveFromQueue(optimisticId);
                          }}
                          className="px-3 py-1.5 text-left text-sm text-red-300 hover:bg-gray-700 dark:hover:bg-gray-600"
                        >
                          {t('chat.delete', { defaultValue: 'Delete' })}
                        </button>
                      )}
                    </div>
                  )}
                </span>
              ) : message.readReceipts && message.readReceipts.length > 0 ? (
                <span
                  className="text-purple-200 inline-flex"
                  title={`Read by ${message.readReceipts.length} ${message.readReceipts.length === 1 ? 'person' : 'people'}`}
                  style={mediaOnlyIconStyle}
                >
                  <DoubleTickIcon size={14} variant="double" />
                </span>
              ) : (
                <span className="text-blue-100 inline-flex" title="Sent" style={mediaOnlyIconStyle}>
                  <DoubleTickIcon size={14} variant="secondary" />
                </span>
              )}
            </>
          )}
        </span>
      </div>
    </div>
  );
};
