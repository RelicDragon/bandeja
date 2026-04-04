import axios from 'axios';

const DEBOUNCE_MS = 420;
const MAX_IDS_PER_REQUEST = 200;
const CHUNK_MAX_ATTEMPTS = 4;
const BASE_RETRY_MS = 550;
const OUTER_FLUSH_FAIL_CAP = 12;
const MAX_FLUSH_DELAY_MS = 30_000;

const pendingSocket = new Set<string>();
const pendingPush = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let outerFlushFailStreak = 0;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function nextFlushDelayMs(): number {
  if (outerFlushFailStreak <= 0) return DEBOUNCE_MS;
  return Math.min(MAX_FLUSH_DELAY_MS, DEBOUNCE_MS * 2 ** Math.min(outerFlushFailStreak, OUTER_FLUSH_FAIL_CAP));
}

function scheduleFlush(): void {
  if (flushTimer != null) return;
  const ms = nextFlushDelayMs();
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushAll();
  }, ms);
}

function clearFlushTimerAndStreak(): void {
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  outerFlushFailStreak = 0;
}

function abortAllPendingDeliveryConfirms(): void {
  pendingSocket.clear();
  pendingPush.clear();
  clearFlushTimerAndStreak();
}

async function postChunkWithRetries(
  chunk: string[],
  deliveryMethod: 'socket' | 'push'
): Promise<'ok' | 'requeue' | 'auth'> {
  const { api } = await import('@/api');
  for (let attempt = 0; attempt < CHUNK_MAX_ATTEMPTS; attempt++) {
    try {
      await api.post('/chat/messages/confirm-receipt-batch', {
        messageIds: chunk,
        deliveryMethod,
      });
      return 'ok';
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const s = e.response?.status;
        if (s === 401 || s === 403) {
          return 'auth';
        }
      }
      if (attempt === CHUNK_MAX_ATTEMPTS - 1) return 'requeue';
      const backoff = BASE_RETRY_MS * 2 ** attempt + Math.floor(Math.random() * 220);
      await delay(backoff);
    }
  }
  return 'requeue';
}

async function flushDeliveryMethod(messageIds: string[], deliveryMethod: 'socket' | 'push'): Promise<boolean> {
  if (messageIds.length === 0) return false;
  const target = deliveryMethod === 'socket' ? pendingSocket : pendingPush;
  for (let i = 0; i < messageIds.length; i += MAX_IDS_PER_REQUEST) {
    const chunk = messageIds.slice(i, i + MAX_IDS_PER_REQUEST);
    const r = await postChunkWithRetries(chunk, deliveryMethod);
    if (r === 'auth') {
      abortAllPendingDeliveryConfirms();
      return true;
    }
    if (r === 'requeue') {
      for (const id of chunk) target.add(id);
    }
  }
  return false;
}

async function flushAll(): Promise<void> {
  const sock = [...pendingSocket];
  const push = [...pendingPush];
  pendingSocket.clear();
  pendingPush.clear();

  const authSocket = await flushDeliveryMethod(sock, 'socket');
  if (authSocket) {
    clearFlushTimerAndStreak();
    return;
  }

  const authPush = await flushDeliveryMethod(push, 'push');
  if (authPush) {
    clearFlushTimerAndStreak();
    return;
  }

  if (pendingSocket.size > 0 || pendingPush.size > 0) {
    outerFlushFailStreak = Math.min(outerFlushFailStreak + 1, OUTER_FLUSH_FAIL_CAP);
    scheduleFlush();
  } else {
    outerFlushFailStreak = 0;
  }
}

export function enqueueConfirmMessageReceipt(messageId: string, deliveryMethod: 'socket' | 'push'): void {
  if (!messageId) return;
  if (deliveryMethod === 'socket') pendingSocket.add(messageId);
  else pendingPush.add(messageId);
  scheduleFlush();
}

export function flushConfirmMessageReceiptNow(): Promise<void> {
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  outerFlushFailStreak = 0;
  return flushAll();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushConfirmMessageReceiptNow();
    }
  });
}
