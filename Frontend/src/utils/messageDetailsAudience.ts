import type { MessageReaction, MessageReadReceipt } from '@/api/chat';
import { readReceiptsFromOthers } from '@/services/chat/messageTickState';

export type MessageDetailsAudienceRow = {
  key: string;
  userId: string;
  user?: MessageReadReceipt['user'];
  readAt?: string;
  reaction?: MessageReaction;
};

function audienceSortTime(row: MessageDetailsAudienceRow): number {
  if (row.readAt) return new Date(row.readAt).getTime();
  if (row.reaction?.createdAt) return new Date(row.reaction.createdAt).getTime();
  return 0;
}

export function buildMessageDetailsAudienceRows(
  readReceipts: readonly MessageReadReceipt[] | undefined,
  reactions: readonly MessageReaction[] | undefined,
  senderId: string | null | undefined,
  viewerUserId?: string | null
): MessageDetailsAudienceRow[] {
  const otherReadReceipts = readReceiptsFromOthers(readReceipts, senderId, viewerUserId);
  const receiptUserIds = new Set(otherReadReceipts.map((receipt) => receipt.userId));

  const rows: MessageDetailsAudienceRow[] = otherReadReceipts.map((receipt, index) => ({
    key: receipt.id || `receipt-${index}`,
    userId: receipt.userId,
    user: receipt.user,
    readAt: receipt.readAt,
    reaction: reactions?.find((reaction) => reaction.userId === receipt.userId),
  }));

  for (const reaction of reactions ?? []) {
    if (!reaction.userId) continue;
    if (senderId && reaction.userId === senderId) continue;
    if (viewerUserId && reaction.userId === viewerUserId) continue;
    if (receiptUserIds.has(reaction.userId)) continue;
    rows.push({
      key: `reaction-${reaction.userId}`,
      userId: reaction.userId,
      user: reaction.user,
      reaction,
    });
  }

  return rows.sort((left, right) => audienceSortTime(left) - audienceSortTime(right));
}
