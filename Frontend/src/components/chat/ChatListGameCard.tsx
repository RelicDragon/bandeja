import { memo, useMemo, type ReactNode } from 'react';
import { UnreadBadge } from '@/components/UnreadBadge';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { ChatListDocumentRow, ChatListPreviewContent, ChatListStickerRow, ChatListVideoRow } from './ChatListPreviewContent';
import { ChatListPreviewText } from './ChatListPreviewText';
import { formatVoiceDurationMmSs } from '@/utils/messagePreview';
import { Award, Lock, Mic, Sprout } from 'lucide-react';
import { ChatListDraftPreview } from './ChatListDraftPreview';
import {
  dismissFailedOutboxForContext,
  retryFailedOutboxForContext,
} from '@/services/chat/chatOutboxContextActions';
import {
  getGameChatListEntityVisual,
  getGameChatListLocationLine,
  getGameChatListTitle,
} from '@/utils/chatListGameCardDisplay';
import { getSportConfig } from '@/sport/sportRegistry';
import { getViewerPrimarySport, shouldShowGameCardSportGlyph } from '@/utils/findSportFilter';
import { parseGameSport } from '@/utils/gameSport';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { ChatListGameDateTile } from './ChatListGameDateTile';
import { getChatListGameTone } from './chatListGameTone';
import { ChatListGameStatusPill } from './ChatListGameStatusPill';
import { isChatListInvitation } from './chatListSections';
import { useChatListInviteActionsContext } from './useChatListInviteActions';

type GameChatItem = Extract<ChatItem, { type: 'game' }>;
type GameListLastMessage = GameLastMessagePreview | ChatMessage;

export type ChatListGameCardProps = {
  chat: GameChatItem;
  currentUserId: string | undefined;
  isSelected: boolean;
  onClick: () => void;
  /** `hero` is the "Next up" card at the top of the Chats feed. */
  variant?: 'row' | 'hero';
  /** Dimmed row under "Past" in the Games view. */
  past?: boolean;
};

const HERO_AVATAR_LIMIT = 5;

function lastMessageSig(lm: Game['lastMessage']): string {
  if (!lm) return '';
  if (isLastMessagePreview(lm)) return `${lm.updatedAt}:${lm.preview ?? ''}`;
  const m = lm as ChatMessage;
  return `${m.id ?? ''}:${m.updatedAt ?? m.createdAt}:${m.content ?? ''}:${m.messageType ?? ''}`;
}

function participantsSig(game: Game): string {
  return (game.participants ?? []).map((p) => `${p.userId}:${p.status}:${p.role}`).join('|');
}

function senderPrefix(lastMessage: GameListLastMessage, userId: string | undefined, t: TFunction): string | null {
  const senderId = isLastMessagePreview(lastMessage) ? lastMessage.senderId : (lastMessage as ChatMessage).senderId;
  if (!senderId) return null;
  if (senderId === userId) return t('chat.you');
  const sender = isLastMessagePreview(lastMessage) ? lastMessage.sender : (lastMessage as ChatMessage).sender;
  return sender?.firstName?.trim() || null;
}

function lastMessageBody(lastMessage: GameListLastMessage, game: Game, t: TFunction): ReactNode {
  if (isLastMessagePreview(lastMessage)) {
    return lastMessage.preview?.trim() ? (
      <ChatListPreviewContent preview={lastMessage.preview} t={t} entityType={game.entityType} />
    ) : (
      t('chat.noMessage', { defaultValue: 'No message' })
    );
  }
  const full = lastMessage as ChatMessage;
  if (full.messageType === 'STICKER') return <ChatListStickerRow t={t} emoji={full.stickerEmoji} />;
  if (full.messageType === 'DOCUMENT') return <ChatListDocumentRow t={t} fileName={full.documentFileName} />;
  if (full.messageType === 'VIDEO') return <ChatListVideoRow t={t} durationMs={full.videoDurationMs} />;
  if (full.messageType === 'VOICE') {
    const dur =
      full.audioDurationMs != null && full.audioDurationMs > 0 ? ` (${formatVoiceDurationMmSs(full.audioDurationMs)})` : '';
    return (
      <span className="inline-flex items-center gap-1">
        <Mic className="w-4 h-4 shrink-0" aria-hidden />
        <span>
          {t('chat.voiceMessage', { defaultValue: 'Voice message' })}
          {dur}
        </span>
      </span>
    );
  }
  const text = full.senderId ? full.content || '' : formatSystemMessageForDisplay(full.content || '', t, game.entityType);
  return text?.trim() ? <ChatListPreviewText text={text} /> : t('chat.noMessage', { defaultValue: 'No message' });
}

function ChatListGameCardInner({ chat, isSelected, onClick, variant = 'row', past = false }: ChatListGameCardProps) {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const displayUnread = useChatListItemUnread(chat);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const inviteActions = useChatListInviteActionsContext();
  const game = chat.data;
  const hero = variant === 'hero';
  const { Icon } = getGameChatListEntityVisual(game.entityType);
  const tone = getChatListGameTone(game, userId, past);

  const location = getGameChatListLocationLine(game, t);
  const namedTitle = getGameChatListTitle(game, t, i18n.language);
  const title = namedTitle || location;
  const metaParts: string[] = [];
  if (game.entityType === 'LEAGUE' && game.leagueGroup?.name) metaParts.push(game.leagueGroup.name);
  if (game.entityType === 'LEAGUE' && game.leagueRound) {
    metaParts.push(`${t('gameDetails.round')} ${game.leagueRound.orderIndex + 1}`);
  }
  if (namedTitle) metaParts.push(location);
  const metaText = metaParts.join(' · ');

  const sportGlyph = useMemo(() => {
    if (!shouldShowGameCardSportGlyph(game.sport, getViewerPrimarySport(user), undefined)) return null;
    return getSportConfig(parseGameSport(game.sport)).icon;
  }, [game.sport, user]);
  const resultsReady = (game.status === 'STARTED' || game.status === 'FINISHED') && game.resultsStatus === 'FINAL';

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
        : undefined;

  const showInviteActions = !past && !!inviteActions && isChatListInvitation(game, userId);
  const inviteBusy = !!inviteActions?.busyGameIds.has(game.id);
  const prefix = lastMessage && !showDraft ? senderPrefix(lastMessage, userId, t) : null;
  const playing = hero ? game.participants.filter((p) => p.status === 'PLAYING') : [];

  const preview = showOutboxOnly ? null : showDraft ? (
    <p className="text-sm line-clamp-1 min-w-0">
      <ChatListDraftPreview content={draft?.content || ''} />
    </p>
  ) : !lastMessage ? (
    <p className="text-sm text-gray-400 dark:text-gray-500 italic">
      {t('chat.noMessages', { defaultValue: 'No messages yet' })}
    </p>
  ) : (
    <p className="text-sm text-gray-600 dark:text-gray-400 min-w-0 line-clamp-1">
      {prefix ? <span className="text-gray-900 dark:text-gray-200">{prefix}: </span> : null}
      {lastMessageBody(lastMessage, game, t)}
    </p>
  );

  const metaLine = (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <ChatListGameStatusPill game={game} userId={userId} withSeats={hero} />
      {game.entityType !== 'GAME' ? <Icon className="h-3.5 w-3.5 shrink-0" aria-label={t(`games.entityTypes.${game.entityType}`)} /> : null}
      {sportGlyph ? <span className="shrink-0 leading-none" aria-hidden>{sportGlyph}</span> : null}
      {!game.isPublic ? <Lock className="h-3 w-3 shrink-0" aria-label={t('games.private', { defaultValue: 'Private' })} /> : null}
      {game.suitableForNovices ? (
        <Sprout className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" aria-label={t('games.noviceFriendly')} />
      ) : null}
      {resultsReady ? (
        <Award className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label={t('games.resultsAvailable')} />
      ) : null}
      {metaText ? <span className="min-w-0 truncate">{metaText}</span> : null}
    </div>
  );

  const outbox = (
    <ChatListOutboxAnimated
      listOutbox={listOutbox}
      onRetry={listOutbox?.state === 'failed' ? () => void retryFailedOutboxForContext('GAME', game.id) : undefined}
      onDismiss={listOutbox?.state === 'failed' ? () => void dismissFailedOutboxForContext('GAME', game.id) : undefined}
    />
  );

  const timeLabel =
    lastActivityIso || draft
      ? formatChatTime(lastActivityIso ?? draft?.updatedAt ?? new Date().toISOString(), displaySettings.locale, displaySettings.hour12)
      : null;

  const header = (
    <div className="flex items-center gap-2">
      <h3
        className={`min-w-0 flex-1 truncate font-semibold text-gray-900 dark:text-white ${hero ? 'text-base' : 'text-[15px]'}`}
      >
        {title}
      </h3>
      {timeLabel ? (
        <span
          className={`shrink-0 whitespace-nowrap text-xs tabular-nums ${
            displayUnread > 0 ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {timeLabel}
        </span>
      ) : null}
    </div>
  );

  if (hero) {
    return (
      <div className="px-3 pb-1 pt-0.5">
        <div
          onClick={onClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onClick()}
          data-chat-selected={isSelected ? 'true' : undefined}
          className={`chat-list-hero cursor-pointer rounded-[22px] border p-3 transition-colors active:scale-[0.99] ${
            isSelected
              ? 'border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/20'
              : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700/70 dark:bg-gray-800/60 dark:hover:bg-gray-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <ChatListGameDateTile game={game} tone={tone} Icon={Icon} displaySettings={displaySettings} t={t} size="lg" />
            <div className="min-w-0 flex-1">
              {header}
              <div className="mt-1">{metaLine}</div>
            </div>
          </div>
          {outbox}
          <div className="mt-2.5 flex items-center gap-2.5">
            {playing.length > 0 ? (
              <div className="flex shrink-0 items-center gap-0.5" aria-hidden>
                {playing.slice(0, HERO_AVATAR_LIMIT).map((p) => (
                  <PlayerAvatar
                    key={p.userId}
                    player={p.user}
                    inlineFace
                    inlineFaceSize="sm"
                    showName={false}
                    subscribePresence={false}
                    asDiv
                  />
                ))}
                {playing.length > HERO_AVATAR_LIMIT ? (
                  <span className="ms-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    +{playing.length - HERO_AVATAR_LIMIT}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="min-w-0 flex-1">{preview}</div>
            <UnreadBadge count={displayUnread} className="shrink-0" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      data-chat-selected={isSelected ? 'true' : undefined}
      className={`chat-list-row flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800/70'
      }`}
    >
      <div className={past ? 'opacity-60' : undefined}>
        <ChatListGameDateTile game={game} tone={tone} Icon={Icon} displaySettings={displaySettings} t={t} />
      </div>
      <div className={`min-w-0 flex-1 ${past ? 'opacity-60' : ''}`}>
        {header}
        <div className="mt-0.5">{metaLine}</div>
        {outbox}
        <div className="mt-0.5 flex items-center gap-2">
          <div className="min-w-0 flex-1">{preview}</div>
          <UnreadBadge count={displayUnread} className="shrink-0" />
        </div>
        {showInviteActions ? (
          <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              disabled={inviteBusy}
              onClick={() => inviteActions.accept(game)}
              className="h-9 flex-1 rounded-xl bg-primary-600 text-sm font-semibold text-white transition-colors hover:bg-primary-700 active:scale-[0.98] disabled:opacity-60"
            >
              {t('chat.list.join', { defaultValue: 'Join' })}
            </button>
            <button
              type="button"
              disabled={inviteBusy}
              onClick={() => inviteActions.decline(game)}
              className="h-9 flex-1 rounded-xl bg-gray-100 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 active:scale-[0.98] disabled:opacity-60 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {t('chat.list.decline', { defaultValue: 'Decline' })}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function gameCardPropsEqual(a: ChatListGameCardProps, b: ChatListGameCardProps) {
  if (a.chat.data.id !== b.chat.data.id) return false;
  if (a.isSelected !== b.isSelected) return false;
  if (a.currentUserId !== b.currentUserId) return false;
  if (a.variant !== b.variant || a.past !== b.past) return false;
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
  const aLocalized = a.chat.data.localizedText;
  const bLocalized = b.chat.data.localizedText;
  if ((aLocalized?.locale ?? '') !== (bLocalized?.locale ?? '')) return false;
  if ((aLocalized?.name?.text ?? '') !== (bLocalized?.name?.text ?? '')) return false;
  if ((aLocalized?.name?.state ?? '') !== (bLocalized?.name?.state ?? '')) return false;
  if ((aLocalized?.name?.sourceRevision ?? '') !== (bLocalized?.name?.sourceRevision ?? '')) {
    return false;
  }
  if (a.chat.data.entityType !== b.chat.data.entityType) return false;
  if (a.chat.data.startTime !== b.chat.data.startTime) return false;
  if (a.chat.data.timeIsSet !== b.chat.data.timeIsSet) return false;
  if (a.chat.data.status !== b.chat.data.status) return false;
  if (a.chat.data.resultsStatus !== b.chat.data.resultsStatus) return false;
  if (a.chat.data.isPublic !== b.chat.data.isPublic) return false;
  if (a.chat.data.suitableForNovices !== b.chat.data.suitableForNovices) return false;
  if (a.chat.data.sport !== b.chat.data.sport) return false;
  if ((a.chat.data.leagueGroup?.name ?? '') !== (b.chat.data.leagueGroup?.name ?? '')) return false;
  if (participantsSig(a.chat.data) !== participantsSig(b.chat.data)) return false;
  if (a.onClick !== b.onClick) return false;
  return true;
}

export const ChatListGameCard = memo(ChatListGameCardInner, gameCardPropsEqual);
