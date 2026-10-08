import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { ImageIcon, Mic } from 'lucide-react';
import { isLastMessagePreview, type ChatMessage, type LastMessagePreview } from '@/api/chat';
import { convertMentionsToPlaintext } from '@/utils/parseMentions';
import { formatSystemMessageForDisplay } from '@/utils/systemMessages';
import { formatVoiceDurationMmSs } from '@/utils/messagePreview';
import {
  ChatListDocumentRow,
  ChatListGenericMediaRow,
  ChatListPreviewContent,
  ChatListStickerRow,
  ChatListVideoRow,
} from './ChatListPreviewContent';
import type { ChatListGameLink } from './chatListGameLink';
import { stripChatListGameLink } from './chatListGameLink';

export type ChatListLastMessage = ChatMessage | LastMessagePreview;

/** Raw text of the last message — what game-link detection reads. */
export function chatListLastMessageText(lm: ChatListLastMessage | null | undefined): string | null {
  if (!lm) return null;
  if (isLastMessagePreview(lm)) return lm.preview ?? null;
  return (lm as ChatMessage).senderId ? (lm as ChatMessage).content ?? null : null;
}

/** "You" for the viewer's own messages, the sender's first name in groups. */
export function chatListSenderPrefix(
  lm: ChatListLastMessage,
  viewerId: string | undefined,
  t: TFunction,
  { showOthers }: { showOthers: boolean }
): string | null {
  const senderId = isLastMessagePreview(lm) ? lm.senderId : (lm as ChatMessage).senderId;
  if (!senderId) return null;
  if (senderId === viewerId) return t('chat.you');
  if (!showOthers) return null;
  const sender = isLastMessagePreview(lm) ? lm.sender : (lm as ChatMessage).sender;
  return sender?.firstName?.trim() || null;
}

/**
 * The body of a DM / group preview line. `resolvedGameLink` drops the raw game
 * URL from the text once the strip under the line shows that game.
 */
export function chatListPreviewBody(
  lm: ChatListLastMessage,
  t: TFunction,
  resolvedGameLink?: ChatListGameLink | null
): ReactNode {
  if (isLastMessagePreview(lm)) {
    const raw = lm.preview?.trim() ?? '';
    const text = resolvedGameLink && raw ? stripChatListGameLink(raw, resolvedGameLink) : raw;
    if (!raw) return t('chat.noMessage');
    if (!text) return null;
    return <ChatListPreviewContent preview={text} t={t} />;
  }

  const m = lm as ChatMessage;
  const type = m.messageType;
  const hasMedia = (m.mediaUrls?.length ?? 0) > 0;
  if (type === 'VOICE' && !m.content?.trim()) {
    return (
      <span className="inline-flex items-center gap-1 align-[-3px]">
        <Mic className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          {t('chat.voiceMessage', { defaultValue: 'Voice message' })}
          {m.audioDurationMs != null && m.audioDurationMs > 0 ? ` (${formatVoiceDurationMmSs(m.audioDurationMs)})` : ''}
        </span>
      </span>
    );
  }
  if (type === 'VIDEO') return <ChatListVideoRow t={t} durationMs={m.videoDurationMs} />;
  if (type === 'STICKER') return <ChatListStickerRow t={t} emoji={m.stickerEmoji} />;
  if (type === 'DOCUMENT') return <ChatListDocumentRow t={t} fileName={m.documentFileName} />;
  if (hasMedia && type === undefined) return <ChatListGenericMediaRow t={t} />;
  if (hasMedia && type !== 'VOICE') {
    return (
      <span className="inline-flex items-center gap-1 align-[-3px]">
        <ImageIcon className="h-4 w-4 shrink-0" aria-hidden />
        {t('chat.photo')}
      </span>
    );
  }
  const raw = m.senderId
    ? convertMentionsToPlaintext(m.content || '')
    : convertMentionsToPlaintext(formatSystemMessageForDisplay(m.content || '', t));
  const text = resolvedGameLink ? stripChatListGameLink(raw, resolvedGameLink) : raw;
  if (!raw) return t('chat.noMessage');
  return text || null;
}
