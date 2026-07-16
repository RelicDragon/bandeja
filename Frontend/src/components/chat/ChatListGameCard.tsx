import { memo, useMemo } from 'react';
import { UnreadBadge } from '@/components/UnreadBadge';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '@/api/chat';
import { getLastMessageTime, isLastMessagePreview } from '@/api/chat';
import type { Game, GameLastMessagePreview } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useChatListItemUnread } from '@/hooks/useUnreadBridge';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { formatChatTime } from '@/utils/dateFormat';
import { formatSystemMessageForDisplay } from '@/utils/systemMessages';
import type { ChatItem } from './chatListTypes';
import { ChatListOutboxAnimated } from './ChatListOutboxAnimated';
import { ChatListPreviewContent, ChatListStickerRow } from './ChatListPreviewContent';
import { ChatListPreviewText } from './ChatListPreviewText';
import { ChatListDraftPreview } from './ChatListDraftPreview';
import {
  dismissFailedOutboxForContext,
  retryFailedOutboxForContext,
} from '@/services/chat/chatOutboxContextActions';
import { ChatListGameCardTags } from './ChatListGameCardTags';
import {
  gameChatListShowsLeagueTags,
  getGameChatListDateTimeBlock,
  getGameChatListEntityVisual,
  getGameChatListLocationLine,
  getGameChatListTitle,
} from '@/utils/chatListGameCardDisplay';

type GameChatItem = Extract<ChatItem, { type: 'game' }>;
type GameListLastMessage = GameLastMessagePreview | ChatMessage;

export type ChatListGameCardProps = {
  chat: GameChatItem;
  currentUserId: string | undefined;
  isSelected: boolean;
  onClick: () => void;
};

function lastMessageSig(lm: Game['lastMessage']): string {
  if (!lm) return '';
  if (isLastMessagePreview(lm)) return `${lm.updatedAt}:${lm.preview ?? ''}`;
  const m = lm as ChatMessage;
  return `${m.id ?? ''}:${m.updatedAt ?? m.createdAt}:${m.content ?? ''}:${m.messageType ?? ''}`;
}

function ChatListGameCardInner({ chat, isSelected, onClick }: ChatListGameCardProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displayUnread = useChatListItemUnread(chat);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const game = chat.data;
  const visual = getGameChatListEntityVisual(game.entityType);
  const { Icon } = visual;
  const title = getGameChatListTitle(game, t);
  const dateTimeBlock = getGameChatListDateTimeBlock(game, displaySettings, t);
  const locationLine = getGameChatListLocationLine(game, t);
  const showLeagueTags = gameChatListShowsLeagueTags(game);
  const lastMessage = game.lastMessage as GameListLastMessage | null | undefined;
  const draft = chat.draft ?? null;
  const listOutbox = chat.listOutbox ?? undefined;
  const showOutboxOnly =
    listOutbox?.state === 'queued' || listOutbox?.state === 'sending' || listOutbox?.state === 'failed';
  const lastMessageTime = getLastMessageTime(lastMessage);
  const draftTime = draft ? new Date(draft.updatedAt).getTime() : 0;
  const showDraft = !!(draft && (draftTime > lastMessageTime || !lastMessage));

  const lastActivityIso =
    draftTime > lastMessageTime && draft
      ? draft.updatedAt
      : lastMessage
        ? isLastMessagePreview(lastMessage)
          ? lastMessage.updatedAt
          : (lastMessage as ChatMessage).updatedAt ?? (lastMessage as ChatMessage).createdAt
        : chat.lastMessageDate?.toISOString();

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className={`flex items-center gap-3 p-3 cursor-pointer transition-colors border-b border-gray-200 dark:border-gray-700 ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      <div className="flex flex-col items-center gap-0.5 w-11 shrink-0 pt-0.5">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full border ${visual.ringClass} bg-white/80 dark:bg-gray-900/50`}
          aria-hidden
        >
          <Icon className={`w-3.5 h-3.5 ${visual.iconClass}`} />
        </span>
        {dateTimeBlock ? (
          <div className="w-full text-center leading-tight">
            {dateTimeBlock.dateLabel ? (
              <div className="text-[10px] font-medium text-gray-700 dark:text-gray-300 truncate px-0.5">
                {dateTimeBlock.dateLabel}
              </div>
            ) : null}
            {dateTimeBlock.timeLabel ? (
              <div className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
                {dateTimeBlock.timeLabel}
              </div>
            ) : null}
          </div>
        ) : game.timeIsSet !== true ? (
          <div className="w-full text-center leading-tight px-0.5">
            <div className="text-[10px] text-gray-500 dark:text-gray-400 italic line-clamp-3">
              {t('gameDetails.datetimeNotSet')}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
            {title ? (
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate min-w-0">
                {title}
              </h3>
            ) : null}
            <ChatListGameCardTags game={game} userId={user?.id} />
            {showLeagueTags && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {game.leagueGroup?.name && (
                  <span
                    className="px-1.5 py-0.5 text-[10px] font-medium rounded text-white"
                    style={{ backgroundColor: game.leagueGroup.color || '#6b7280' }}
                  >
                    {game.leagueGroup.name}
                  </span>
                )}
                {game.leagueRound && (
                  <span className="text-[10px] text-gray-600 dark:text-gray-400">
                    {t('gameDetails.round')} {game.leagueRound.orderIndex + 1}
                  </span>
                )}
              </div>
            )}
            {locationLine ? (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{locationLine}</p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {lastActivityIso || draft ? (
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {formatChatTime(
                  lastActivityIso ?? draft?.updatedAt ?? new Date().toISOString(),
                  displaySettings.locale,
                  displaySettings.hour12
                )}
              </span>
            ) : null}
            <UnreadBadge count={displayUnread} />
          </div>
        </div>

        <ChatListOutboxAnimated
          listOutbox={listOutbox}
          onRetry={
            listOutbox?.state === 'failed'
              ? () => {
                  void retryFailedOutboxForContext('GAME', game.id);
                }
              : undefined
          }
          onDismiss={
            listOutbox?.state === 'failed'
              ? () => {
                  void dismissFailedOutboxForContext('GAME', game.id);
                }
              : undefined
          }
        />

        {!showOutboxOnly && (
          <>
            {showDraft ? (
              <p className="text-sm line-clamp-2 mt-0.5 min-w-0">
                <ChatListDraftPreview content={draft?.content || ''} />
              </p>
            ) : !lastMessage ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic mt-0.5">
                {t('chat.noMessages', { defaultValue: 'No messages yet' })}
              </p>
            ) : (
              <div className="flex items-center justify-between gap-2 mt-0.5 min-w-0">
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 min-w-0 flex-1">
                  {isLastMessagePreview(lastMessage) ? (
                    lastMessage.preview?.trim() ? (
                      <ChatListPreviewContent preview={lastMessage.preview} t={t} entityType={game.entityType} />
                    ) : (
                      t('chat.noMessage', { defaultValue: 'No message' })
                    )
                  ) : (
                    (() => {
                      const full = lastMessage as ChatMessage;
                      if (full.messageType === 'STICKER') {
                        return <ChatListStickerRow t={t} emoji={full.stickerEmoji} />;
                      }
                      const text = full.senderId
                        ? full.content || ''
                        : formatSystemMessageForDisplay(full.content || '', t, game.entityType);
                      return text?.trim() ? (
                        <ChatListPreviewText text={text} />
                      ) : (
                        t('chat.noMessage', { defaultValue: 'No message' })
                      );
                    })()
                  )}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function gameCardPropsEqual(a: ChatListGameCardProps, b: ChatListGameCardProps) {
  if (a.chat.data.id !== b.chat.data.id) return false;
  if (a.isSelected !== b.isSelected) return false;
  if (a.currentUserId !== b.currentUserId) return false;
  if (a.chat.unreadCount !== b.chat.unreadCount) return false; // prop fallback; store drives display via hook
  const ad = a.chat.lastMessageDate?.getTime() ?? null;
  const bd = b.chat.lastMessageDate?.getTime() ?? null;
  if (ad !== bd) return false;
  if (lastMessageSig(a.chat.data.lastMessage) !== lastMessageSig(b.chat.data.lastMessage)) return false;
  const adraft = a.chat.draft?.updatedAt ?? '';
  const bdraft = b.chat.draft?.updatedAt ?? '';
  if (adraft !== bdraft) return false;
  const adraftContent = a.chat.draft?.content ?? '';
  const bdraftContent = b.chat.draft?.content ?? '';
  if (adraftContent !== bdraftContent) return false;
  const ao = a.chat.listOutbox?.state;
  const bo = b.chat.listOutbox?.state;
  if (ao !== bo) return false;
  if ((a.chat.data.name ?? '') !== (b.chat.data.name ?? '')) return false;
  if (a.chat.data.entityType !== b.chat.data.entityType) return false;
  if (a.chat.data.startTime !== b.chat.data.startTime) return false;
  if (a.chat.data.timeIsSet !== b.chat.data.timeIsSet) return false;
  if (a.chat.data.status !== b.chat.data.status) return false;
  if (a.chat.data.sport !== b.chat.data.sport) return false;
  if ((a.chat.data.leagueGroup?.name ?? '') !== (b.chat.data.leagueGroup?.name ?? '')) return false;
  if (a.onClick !== b.onClick) return false;
  return true;
}

export const ChatListGameCard = memo(ChatListGameCardInner, gameCardPropsEqual);
