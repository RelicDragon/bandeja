import type { ChatContextType } from '@/api/chat';
import { acquireChatSendWakeLock, releaseChatSendWakeLock } from '@/services/chat/chatSendKeepAwake';

export const OUTBOX_READY_WAIT_MS = 4_000;
export const SEND_UPLOAD_PHASE_MS = 30_000;
export const SEND_API_PHASE_MS = 15_000;

const sendGeneration = new Map<string, number>();
const abortByTempId = new Map<string, AbortController>();
const contextByTempId = new Map<string, string>();
const deadlineTimers = new Map<string, ReturnType<typeof setTimeout>>();

function contextKey(contextType: ChatContextType, contextId: string): string {
  return `${contextType}:${contextId}`;
}

function onActiveSendSlotAdded(): void {
  if (contextByTempId.size === 1) void acquireChatSendWakeLock();
}

function onActiveSendSlotRemoved(): void {
  if (contextByTempId.size === 0) void releaseChatSendWakeLock();
}

export function bumpSendGeneration(tempId: string): number {
  const next = (sendGeneration.get(tempId) ?? 0) + 1;
  sendGeneration.set(tempId, next);
  return next;
}

export function isActiveSendGeneration(tempId: string, generation: number): boolean {
  return sendGeneration.get(tempId) === generation;
}

export function getAbortSignal(tempId: string): AbortSignal | undefined {
  return abortByTempId.get(tempId)?.signal;
}

export function beginChatSend(
  tempId: string,
  contextType: ChatContextType,
  contextId: string
): { generation: number; signal: AbortSignal } {
  clearDeadlineTimer(tempId);
  const generation = bumpSendGeneration(tempId);
  abortByTempId.get(tempId)?.abort();
  const controller = new AbortController();
  abortByTempId.set(tempId, controller);
  contextByTempId.set(tempId, contextKey(contextType, contextId));
  onActiveSendSlotAdded();
  return { generation, signal: controller.signal };
}

export function invalidateChatSend(tempId: string): void {
  bumpSendGeneration(tempId);
  abortByTempId.get(tempId)?.abort();
  abortByTempId.delete(tempId);
  clearDeadlineTimer(tempId);
  contextByTempId.delete(tempId);
  onActiveSendSlotRemoved();
}

export function clearDeadlineTimer(tempId: string): void {
  const t = deadlineTimers.get(tempId);
  if (t) {
    clearTimeout(t);
    deadlineTimers.delete(tempId);
  }
}

export function armPhaseDeadline(
  tempId: string,
  generation: number,
  deadlineMs: number,
  onDeadline: () => void
): void {
  clearDeadlineTimer(tempId);
  const id = setTimeout(() => {
    if (!isActiveSendGeneration(tempId, generation)) return;
    abortByTempId.get(tempId)?.abort();
    onDeadline();
  }, deadlineMs);
  deadlineTimers.set(tempId, id);
}

/** Stop timers/transport for this attempt without invalidating generation (for failure callbacks). */
export function teardownChatSendAttempt(tempId: string): void {
  clearDeadlineTimer(tempId);
  contextByTempId.delete(tempId);
  abortByTempId.get(tempId)?.abort();
  onActiveSendSlotRemoved();
}

export function finishChatSend(tempId: string): void {
  clearDeadlineTimer(tempId);
  contextByTempId.delete(tempId);
  abortByTempId.delete(tempId);
  onActiveSendSlotRemoved();
}

export function sealChatSendAttempt(tempId: string): void {
  bumpSendGeneration(tempId);
  finishChatSend(tempId);
}

export function isSending(tempId: string): boolean {
  return contextByTempId.has(tempId);
}

export function invalidateChatSendsForContext(contextType: ChatContextType, contextId: string): string[] {
  const k = contextKey(contextType, contextId);
  const tempIds = [...contextByTempId.entries()].filter(([, ctx]) => ctx === k).map(([id]) => id);
  for (const tempId of tempIds) {
    invalidateChatSend(tempId);
  }
  return tempIds;
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  const code = (err as { code?: string })?.code;
  return code === 'ERR_CANCELED' || code === 'ABORT_ERR';
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

export async function runWithAbort<T>(
  signal: AbortSignal | undefined,
  fn: () => Promise<T>
): Promise<T> {
  throwIfAborted(signal);
  if (!signal) return fn();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    fn()
      .then((v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      })
      .catch((e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      });
  });
}

/** Test-only reset */
export function resetChatSendCoordinatorForTests(): void {
  sendGeneration.clear();
  abortByTempId.clear();
  contextByTempId.clear();
  for (const t of deadlineTimers.values()) clearTimeout(t);
  deadlineTimers.clear();
  void releaseChatSendWakeLock();
}
