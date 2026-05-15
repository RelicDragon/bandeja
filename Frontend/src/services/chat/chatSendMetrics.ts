export type ChatSendMetricKind =
  | 'chat_send_started'
  | 'chat_send_succeeded'
  | 'chat_send_failed'
  | 'chat_send_deadline'
  | 'chat_send_socket_ack'
  | 'chat_outbox_stuck_retry';

export type ChatSendMetricDetail = {
  kind: ChatSendMetricKind;
  tempId?: string;
  contextType?: string;
  contextId?: string;
  hasMedia?: boolean;
  hasVideo?: boolean;
  transcodeMs?: number;
  uploadBytes?: number;
  durationMs?: number;
  phase?: 'outbox' | 'upload' | 'api';
  reason?: string;
};

export const CHAT_SEND_METRIC_EVENT = 'bandeja-chat-send-metric';

export function recordChatSendMetric(detail: ChatSendMetricDetail): void {
  if (import.meta.env.DEV) {
    console.info('[bandeja-chat-send]', detail);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHAT_SEND_METRIC_EVENT, { detail }));
  }
}
