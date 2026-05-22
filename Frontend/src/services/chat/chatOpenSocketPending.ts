import type { ChatRoomEvent } from '@/store/socketEventsStore';

const pendingByRoom = new Map<string, ChatRoomEvent[]>();

export function appendChatRoomPending(roomKey: string, batch: ChatRoomEvent[]): void {
  if (!roomKey || batch.length === 0) return;
  const prev = pendingByRoom.get(roomKey) ?? [];
  pendingByRoom.set(roomKey, prev.concat(batch));
}

export function takeChatRoomPending(roomKey: string): ChatRoomEvent[] {
  const out = pendingByRoom.get(roomKey) ?? [];
  pendingByRoom.delete(roomKey);
  return out;
}

export function clearChatRoomPending(roomKey: string): void {
  pendingByRoom.delete(roomKey);
}
