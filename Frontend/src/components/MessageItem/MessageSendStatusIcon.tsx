import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Clock } from 'lucide-react';
import { DoubleTickIcon } from '../DoubleTickIcon';
import { TFunction } from 'i18next';
import type { ChatMessage } from '@/api/chat';
import { useNetworkStore } from '@/utils/networkStatus';
import { readReceiptsFromOthers } from '@/services/chat/messageTickState';

const statusTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

type StatusKey = 'sending' | 'queued' | 'failed' | 'read' | 'delivered' | 'sent';

interface MessageSendStatusIconProps {
  isSending: boolean;
  isSendingSlow?: boolean;
  isFailed: boolean;
  tickRead: boolean;
  tickDelivered: boolean;
  message: ChatMessage;
  showFailedMenu: boolean;
  setShowFailedMenu: (v: boolean | ((prev: boolean) => boolean)) => void;
  optimisticId: string | undefined;
  onResendQueued?: (tempId: string) => void;
  onRemoveFromQueue?: (tempId: string) => void;
  iconStyle?: React.CSSProperties;
  tickSurface?: 'bubble' | 'media';
  viewerUserId?: string | null;
  t: TFunction;
}

function resolveStatusKey(
  isSending: boolean,
  isFailed: boolean,
  tickRead: boolean,
  tickDelivered: boolean,
  isNetworkOnline: boolean
): StatusKey {
  if (isSending) return 'sending';
  if (isFailed) return isNetworkOnline ? 'failed' : 'queued';
  if (tickRead) return 'read';
  if (tickDelivered) return 'delivered';
  return 'sent';
}

export const MessageSendStatusIcon: React.FC<MessageSendStatusIconProps> = ({
  isSending,
  isSendingSlow = false,
  isFailed,
  tickRead,
  tickDelivered,
  message,
  showFailedMenu,
  setShowFailedMenu,
  optimisticId,
  onResendQueued,
  onRemoveFromQueue,
  iconStyle,
  tickSurface = 'bubble',
  viewerUserId,
  t,
}) => {
  const isNetworkOnline = useNetworkStore((s) => s.isOnline);
  const statusKey = resolveStatusKey(isSending, isFailed, tickRead, tickDelivered, isNetworkOnline);
  const readByOthersCount = readReceiptsFromOthers(
    message.readReceipts,
    message.senderId,
    viewerUserId
  ).length;
  const onMedia = tickSurface === 'media';

  return (
    <span className="relative inline-flex h-[14px] w-[14px] shrink-0 items-center" style={iconStyle}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={statusKey}
          className="absolute right-0 top-0 bottom-0 inline-flex items-center justify-end"
          initial={{ opacity: 0, scale: 0.55 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.55 }}
          transition={statusTransition}
        >
          {statusKey === 'sending' && (
            <span
              className="inline-flex items-center gap-0.5"
              title={
                isSendingSlow
                  ? t('chat.sendingSlow', { defaultValue: 'Taking longer than usual…' })
                  : t('chat.sending', { defaultValue: 'Sending…' })
              }
            >
              <span className="w-1.5 h-1.5 bg-current rounded-full opacity-70 wavy-dot-1" />
              <span className="w-1.5 h-1.5 bg-current rounded-full opacity-70 wavy-dot-2" />
              <span className="w-1.5 h-1.5 bg-current rounded-full opacity-70 wavy-dot-3" />
            </span>
          )}

          {(statusKey === 'failed' || statusKey === 'queued') && (
            <span className="relative inline-flex items-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFailedMenu((v) => !v);
                }}
                className="p-0.5 rounded hover:bg-white/20"
                title={
                  statusKey === 'queued'
                    ? t('chat.queuedOffline', { defaultValue: 'Queued — will send when online' })
                    : t('chat.failedToSend', { defaultValue: 'Failed to send' })
                }
              >
                {statusKey === 'queued' ? (
                  <Clock size={14} className="text-amber-200" />
                ) : (
                  <AlertCircle size={14} className="text-red-200" />
                )}
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
                      {t('chat.contextMenu.delete', { defaultValue: 'Delete' })}
                    </button>
                  )}
                </div>
              )}
            </span>
          )}

          {statusKey === 'read' && (
            <span
              className={onMedia ? 'text-violet-300 inline-flex' : 'text-purple-200 inline-flex'}
              title={
                readByOthersCount > 0
                  ? `Read by ${readByOthersCount} ${readByOthersCount === 1 ? 'person' : 'people'}`
                  : t('chat.tickRead', { defaultValue: 'Read' })
              }
            >
              <DoubleTickIcon size={14} variant="double" />
            </span>
          )}

          {statusKey === 'delivered' && (
            <span
              className={onMedia ? 'text-white/80 inline-flex' : 'text-blue-100/90 inline-flex'}
              title={t('chat.tickDelivered', { defaultValue: 'Delivered' })}
            >
              <DoubleTickIcon size={14} variant="double" className={onMedia ? 'opacity-90' : 'opacity-85'} />
            </span>
          )}

          {statusKey === 'sent' && (
            <span
              className={onMedia ? 'text-white/70 inline-flex' : 'text-blue-100 inline-flex'}
              title={t('chat.tickSent', { defaultValue: 'Sent' })}
            >
              <DoubleTickIcon size={14} variant="single" />
            </span>
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};
