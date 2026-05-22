import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_OUTBOX_SUCCESS_EVENT,
  dispatchChatOutboxSuccess,
  type ChatOutboxSuccessDetail,
} from './chatOutboxEvents';
import type { ChatMessage } from '@/api/chat';

function serverMessage(id: string): ChatMessage {
  return {
    id,
    chatContextType: 'GAME',
    contextId: 'game-1',
    senderId: 'user-1',
    content: 'hi',
    state: 'SENT',
    chatType: 'PUBLIC',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reactions: [],
    readReceipts: [],
  } as unknown as ChatMessage;
}

describe('dispatchChatOutboxSuccess', () => {
  const listeners = new Map<string, Set<EventListener>>();

  beforeEach(() => {
    vi.stubGlobal('window', {
      dispatchEvent: (ev: Event) => {
        const set = listeners.get(ev.type);
        set?.forEach((fn) => fn(ev));
        return true;
      },
      addEventListener: (type: string, fn: EventListener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: EventListener) => {
        listeners.get(type)?.delete(fn);
      },
    });
  });

  afterEach(() => {
    listeners.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('dispatches CHAT_OUTBOX_SUCCESS_EVENT with detail', () => {
    const handler = vi.fn();
    window.addEventListener(CHAT_OUTBOX_SUCCESS_EVENT, handler);

    const detail: ChatOutboxSuccessDetail = {
      tempId: 'opt-1',
      contextType: 'GAME',
      contextId: 'game-1',
      message: serverMessage('msg-1'),
    };
    dispatchChatOutboxSuccess(detail);

    expect(handler).toHaveBeenCalledOnce();
    const ev = handler.mock.calls[0]![0] as CustomEvent<ChatOutboxSuccessDetail>;
    expect(ev.detail).toEqual(detail);

    window.removeEventListener(CHAT_OUTBOX_SUCCESS_EVENT, handler);
  });
});
