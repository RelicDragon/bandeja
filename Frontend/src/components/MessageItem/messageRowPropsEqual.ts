import type { ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import { getMessageRowKey } from '@/services/chat/messageRowKey';
import type { MessageGroupPosition } from '@/utils/chatMessageGrouping';
import type { MessageRowHandlers } from './types';

function storyReplyEqual(
  a: ChatMessage['storyReply'],
  b: ChatMessage['storyReply']
): boolean {
  if (a === b) return true;
  if (!a || !b) return a === b;
  return (
    a.sourceType === b.sourceType &&
    a.sourceId === b.sourceId &&
    a.ownerUserId === b.ownerUserId &&
    a.thumbnailUrl === b.thumbnailUrl &&
    a.mediaUrl === b.mediaUrl &&
    a.mediaType === b.mediaType
  );
}

function forwardedFromEqual(
  a: ChatMessage['forwardedFrom'],
  b: ChatMessage['forwardedFrom']
): boolean {
  if (a === b) return true;
  if (!a || !b) return a === b;
  return (
    a.title === b.title &&
    a.chatContextType === b.chatContextType &&
    a.contextId === b.contextId &&
    a.messageId === b.messageId &&
    a.isChannel === b.isChannel &&
    a.chatType === b.chatType
  );
}

function reactionsEqual(a: ChatMessage['reactions'], b: ChatMessage['reactions']): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ra = a[i];
    const rb = b[i];
    if (ra.userId !== rb.userId || ra.emoji !== rb.emoji) return false;
    if (!!(ra as { _pending?: boolean })._pending !== !!(rb as { _pending?: boolean })._pending) return false;
  }
  return true;
}

function translationsEqual(
  a: ChatMessage['translations'],
  b: ChatMessage['translations']
): boolean {
  if (a === b) return true;
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    if (aa[i].languageCode !== bb[i].languageCode) return false;
    if (aa[i].translation !== bb[i].translation) return false;
  }
  return true;
}

function mediaUrlsEqual(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  if (a === b) return true;
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    if (aa[i] !== bb[i]) return false;
  }
  return true;
}

function messageContentEqual(a: ChatMessage, b: ChatMessage): boolean {
  if (getMessageRowKey(a) !== getMessageRowKey(b)) return false;
  if (a.content !== b.content) return false;
  if (a.updatedAt !== b.updatedAt) return false;
  if (a.messageType !== b.messageType) return false;
  if (!mediaUrlsEqual(a.mediaUrls, b.mediaUrls)) return false;
  if (a.documentFileName !== b.documentFileName) return false;
  if (a.documentMimeType !== b.documentMimeType) return false;
  if (a.documentSize !== b.documentSize) return false;
  if (!reactionsEqual(a.reactions, b.reactions)) return false;
  if (a.replyToId !== b.replyToId) return false;
  if (!storyReplyEqual(a.storyReply, b.storyReply)) return false;
  if (a.forwardedFromMessageId !== b.forwardedFromMessageId) return false;
  if (!forwardedFromEqual(a.forwardedFrom, b.forwardedFrom)) return false;
  if (a.linkPreview !== b.linkPreview) {
    if (JSON.stringify(a.linkPreview ?? null) !== JSON.stringify(b.linkPreview ?? null)) return false;
  }
  if (a.poll !== b.poll) return false;
  if (a.linkPreviewUrl !== b.linkPreviewUrl) return false;
  if (a.linkPreviewDisabled !== b.linkPreviewDisabled) return false;
  if (a.stickerEmoji !== b.stickerEmoji) return false;
  // Transcriptions arrive as their own sync event and do not always bump `updatedAt`.
  if (a.audioTranscription?.transcription !== b.audioTranscription?.transcription) return false;
  const aStatus = (a as ChatMessageWithStatus)._status;
  const bStatus = (b as ChatMessageWithStatus)._status;
  if (aStatus !== bStatus) return false;
  const aTx = (a as ChatMessageWithStatus)._translationJustArrived;
  const bTx = (b as ChatMessageWithStatus)._translationJustArrived;
  if (aTx !== bTx) return false;
  if (a.translation?.translation !== b.translation?.translation) return false;
  if (!translationsEqual(a.translations, b.translations)) return false;
  return true;
}

export interface MessageRowMemoProps {
  message: ChatMessage;
  handlers: MessageRowHandlers;
  replyCount: number;
  isPinned: boolean;
  loadMediaEager: boolean;
  showReply: boolean;
  isChannel: boolean;
  userChatUser1Id: string | undefined;
  userChatUser2Id: string | undefined;
  groupPosition: MessageGroupPosition;
  entityType: string | null | undefined;
  isThreadSearchOutline: boolean;
  threadSearchHighlightQuery: string | null;
}

export function messageRowPropsEqual(prev: MessageRowMemoProps, next: MessageRowMemoProps): boolean {
  // Identity check first — it is the cheapest and catches permission changes that swap the
  // whole callback bundle (e.g. read-only → writable once the game context loads).
  if (prev.handlers !== next.handlers) return false;
  if (!messageContentEqual(prev.message, next.message)) return false;
  if (prev.replyCount !== next.replyCount) return false;
  if (prev.isPinned !== next.isPinned) return false;
  if (prev.loadMediaEager !== next.loadMediaEager) return false;
  if (prev.showReply !== next.showReply) return false;
  if (prev.isChannel !== next.isChannel) return false;
  if (prev.userChatUser1Id !== next.userChatUser1Id) return false;
  if (prev.userChatUser2Id !== next.userChatUser2Id) return false;
  if (prev.groupPosition !== next.groupPosition) return false;
  if (prev.entityType !== next.entityType) return false;
  if (prev.isThreadSearchOutline !== next.isThreadSearchOutline) return false;
  if (prev.threadSearchHighlightQuery !== next.threadSearchHighlightQuery) return false;
  return true;
}

/** Extract the memo-relevant slice from a row component's props. */
export function toMessageRowMemoProps(props: {
  message: ChatMessage;
  handlers: MessageRowHandlers;
  replyCount?: number;
  isPinned?: boolean;
  loadMediaEager?: boolean;
  showReply?: boolean;
  isChannel?: boolean;
  userChatUser1Id?: string;
  userChatUser2Id?: string;
  groupPosition?: MessageGroupPosition;
  entityType?: string | null;
  isThreadSearchOutline?: boolean;
  threadSearchHighlightQuery?: string | null;
}): MessageRowMemoProps {
  return {
    message: props.message,
    handlers: props.handlers,
    replyCount: props.replyCount ?? 0,
    isPinned: props.isPinned ?? false,
    loadMediaEager: props.loadMediaEager ?? false,
    showReply: props.showReply ?? true,
    isChannel: props.isChannel ?? false,
    userChatUser1Id: props.userChatUser1Id,
    userChatUser2Id: props.userChatUser2Id,
    groupPosition: props.groupPosition ?? 'single',
    entityType: props.entityType,
    isThreadSearchOutline: props.isThreadSearchOutline ?? false,
    threadSearchHighlightQuery: props.threadSearchHighlightQuery ?? null,
  };
}
