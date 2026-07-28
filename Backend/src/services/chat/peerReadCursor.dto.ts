import type { ChatContextType, ChatType } from '@prisma/client';
import { ChatReadCursorService, type MaxPeerReadCursor } from './chatReadCursor.service';

export type MaxPeerReadCursorDto = {
  chatContextType: ChatContextType;
  contextId: string;
  chatType: ChatType;
  readMaxServerSyncSeq: number;
  readMaxCreatedAt: string;
  readMaxMessageId: string;
  updatedAt: string;
};

export function serializeMaxPeerCursor(c: MaxPeerReadCursor): MaxPeerReadCursorDto {
  return {
    chatContextType: c.chatContextType,
    contextId: c.contextId,
    chatType: c.chatType,
    readMaxServerSyncSeq: c.readMaxServerSyncSeq,
    readMaxCreatedAt: c.readMaxCreatedAt.toISOString(),
    readMaxMessageId: c.readMaxMessageId,
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function loadMaxPeerCursorDto(
  chatContextType: ChatContextType,
  contextId: string,
  chatType: ChatType,
  viewerUserId: string
): Promise<MaxPeerReadCursorDto | null> {
  const max = await ChatReadCursorService.getMaxPeerCursor(
    chatContextType,
    contextId,
    chatType,
    viewerUserId
  );
  return max ? serializeMaxPeerCursor(max) : null;
}
