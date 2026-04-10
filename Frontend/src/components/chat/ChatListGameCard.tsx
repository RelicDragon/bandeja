import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import type { ChatItem } from './chatListTypes';
import { getChatTitle } from '@/utils/chatListSort';
import { formatRelativeTime } from '@/utils/dateFormat';
import { ChatListOutboxAnimated } from './ChatListOutboxAnimated';
import {
  dismissFailedOutboxForContext,
  retryFailedOutboxForContext,
} from '@/services/chat/chatOutboxContextActions';

type GameChatItem = Extract<ChatItem, { type: 'game' }>;

export type ChatListGameCardProps = {
  chat: GameChatItem;
  currentUserId: string | undefined;
  isSelected: boolean;
  onClick: () => void;
};

function ChatListGameCardInner({ chat, currentUserId, isSelected, onClick }: ChatListGameCardProps) {
  const { t } = useTranslation();
  const title = currentUserId ? getChatTitle(chat, currentUserId) : chat.data.name?.trim() || '';
  const subtitle =
    chat.lastMessageDate != null ? formatRelativeTime(chat.lastMessageDate.toISOString()) : null;
  const listOutbox = chat.listOutbox ?? undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left border-b border-gray-200 dark:border-gray-700 last:border-b-0 px-4 py-3 flex flex-col gap-0.5 transition-colors ${
        isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
      }`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="shrink-0 w-11 h-11 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-600 dark:text-primary-300">
          <Trophy className="w-5 h-5" aria-hidden />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-gray-900 dark:text-gray-100 truncate flex-1 text-left">
              {title || t('chat.game', { defaultValue: 'Game' })}
            </span>
            {subtitle ? (
              <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{subtitle}</span>
            ) : null}
            {chat.unreadCount > 0 ? (
              <span className="shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary-500 text-white text-xs font-semibold flex items-center justify-center">
                {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
              </span>
            ) : null}
          </div>
          <ChatListOutboxAnimated
            listOutbox={listOutbox}
            onRetry={
              listOutbox?.state === 'failed'
                ? () => {
                    void retryFailedOutboxForContext('GAME', chat.data.id);
                  }
                : undefined
            }
            onDismiss={
              listOutbox?.state === 'failed'
                ? () => {
                    void dismissFailedOutboxForContext('GAME', chat.data.id);
                  }
                : undefined
            }
          />
        </div>
      </div>
    </button>
  );
}

function gameCardPropsEqual(a: ChatListGameCardProps, b: ChatListGameCardProps) {
  if (a.chat.data.id !== b.chat.data.id) return false;
  if (a.isSelected !== b.isSelected) return false;
  if (a.currentUserId !== b.currentUserId) return false;
  if (a.chat.unreadCount !== b.chat.unreadCount) return false;
  const ad = a.chat.lastMessageDate?.getTime() ?? null;
  const bd = b.chat.lastMessageDate?.getTime() ?? null;
  if (ad !== bd) return false;
  const ao = a.chat.listOutbox?.state;
  const bo = b.chat.listOutbox?.state;
  if (ao !== bo) return false;
  if ((a.chat.data.name ?? '') !== (b.chat.data.name ?? '')) return false;
  if (a.onClick !== b.onClick) return false;
  return true;
}

export const ChatListGameCard = memo(ChatListGameCardInner, gameCardPropsEqual);
