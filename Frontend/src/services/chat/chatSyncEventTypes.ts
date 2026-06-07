import { ChatSyncEventType } from '@bandeja/chat-contract';

type ChatSyncEventTypeValue = (typeof ChatSyncEventType)[keyof typeof ChatSyncEventType];

export type ChatSyncEventDTO = {
  id: string;
  seq: number;
  eventType: ChatSyncEventTypeValue | string;
  payload: unknown;
  createdAt: string;
};
