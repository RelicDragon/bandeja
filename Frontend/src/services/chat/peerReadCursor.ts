import type { ChatContextType, ChatType } from '@/api/chat';

export type PeerReadCursor = {
  userId: string;
  chatContextType: ChatContextType;
  contextId: string;
  chatType: ChatType;
  readMaxServerSyncSeq: number;
  readMaxCreatedAt: string;
  readMaxMessageId: string;
  updatedAt: string;
};

export type MaxPeerReadCursor = {
  chatContextType: ChatContextType;
  contextId: string;
  chatType: ChatType;
  readMaxServerSyncSeq: number;
  readMaxCreatedAt: string;
  readMaxMessageId: string;
  updatedAt: string;
};

export type ReadCursorPosition = {
  readMaxServerSyncSeq: number;
  readMaxCreatedAt: string;
  readMaxMessageId: string;
};

export function peerReadCursorThreadKey(
  chatContextType: ChatContextType | string,
  contextId: string,
  chatType: ChatType | string
): string {
  return `${chatContextType}:${contextId}:${chatType}`;
}

function cmpPos(
  a: { seq: number; at: number; id: string },
  b: { seq: number; at: number; id: string }
): number {
  if (a.seq !== b.seq) return a.seq - b.seq;
  const dt = a.at - b.at;
  if (dt !== 0) return dt > 0 ? 1 : -1;
  return a.id.localeCompare(b.id);
}

export function compareReadCursorPositions(a: ReadCursorPosition, b: ReadCursorPosition): number {
  return cmpPos(
    {
      seq: a.readMaxServerSyncSeq,
      at: Date.parse(a.readMaxCreatedAt) || 0,
      id: a.readMaxMessageId,
    },
    {
      seq: b.readMaxServerSyncSeq,
      at: Date.parse(b.readMaxCreatedAt) || 0,
      id: b.readMaxMessageId,
    }
  );
}

export function messagePositionFromChatMessage(message: {
  id: string;
  serverSyncSeq?: number | null;
  syncSeq?: number | null;
  createdAt: string;
}): ReadCursorPosition {
  const seq = message.serverSyncSeq ?? message.syncSeq ?? -1;
  return {
    readMaxServerSyncSeq: typeof seq === 'number' && Number.isFinite(seq) ? seq : -1,
    readMaxCreatedAt: message.createdAt,
    readMaxMessageId: message.id,
  };
}

export function isMessageCoveredByCursor(
  message: {
    id: string;
    serverSyncSeq?: number | null;
    syncSeq?: number | null;
    createdAt: string;
  },
  cursor: ReadCursorPosition | null | undefined
): boolean {
  if (!cursor) return false;
  return compareReadCursorPositions(cursor, messagePositionFromChatMessage(message)) >= 0;
}

export function maxPeerCursorFromPeers(
  peers: PeerReadCursor[],
  thread: { chatContextType: ChatContextType; contextId: string; chatType: ChatType }
): MaxPeerReadCursor | null {
  if (peers.length === 0) return null;
  let best = peers[0]!;
  for (let i = 1; i < peers.length; i++) {
    const p = peers[i]!;
    if (compareReadCursorPositions(p, best) > 0) best = p;
  }
  return {
    chatContextType: thread.chatContextType,
    contextId: thread.contextId,
    chatType: thread.chatType,
    readMaxServerSyncSeq: best.readMaxServerSyncSeq,
    readMaxCreatedAt: best.readMaxCreatedAt,
    readMaxMessageId: best.readMaxMessageId,
    updatedAt: best.updatedAt,
  };
}

export function parseMaxPeerCursor(raw: unknown): MaxPeerReadCursor | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.chatContextType !== 'string' ||
    typeof o.contextId !== 'string' ||
    typeof o.chatType !== 'string' ||
    typeof o.readMaxServerSyncSeq !== 'number' ||
    typeof o.readMaxCreatedAt !== 'string' ||
    typeof o.readMaxMessageId !== 'string'
  ) {
    return null;
  }
  return {
    chatContextType: o.chatContextType as ChatContextType,
    contextId: o.contextId,
    chatType: o.chatType as ChatType,
    readMaxServerSyncSeq: o.readMaxServerSyncSeq,
    readMaxCreatedAt: o.readMaxCreatedAt,
    readMaxMessageId: o.readMaxMessageId,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : o.readMaxCreatedAt,
  };
}

export function parsePeerReadCursor(raw: unknown): PeerReadCursor | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.userId !== 'string') return null;
  const base = parseMaxPeerCursor(raw);
  if (!base) return null;
  return { ...base, userId: o.userId };
}
