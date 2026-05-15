import { CHAT_OUTBOX_FAILED_EVENT } from './chatOutboxEvents';
import { scheduleRetryStuckChatOutbox } from './chatOutboxRetry';

let installed = false;

export function initChatOutboxRetryListeners(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener(CHAT_OUTBOX_FAILED_EVENT, () => {
    scheduleRetryStuckChatOutbox();
  });
}
