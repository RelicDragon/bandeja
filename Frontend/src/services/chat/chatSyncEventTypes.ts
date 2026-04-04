export type ChatSyncEventDTO = {
  id: string;
  seq: number;
  eventType: string;
  payload: unknown;
  createdAt: string;
};
