import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_OUTBOX_REMOVED_EVENT } from '@/services/chat/chatOutboxEvents';
import { subscribeArchivedOutboxFeedback } from './archivedOutboxFeedbackSubscription';

describe('archivedOutboxFeedbackSubscription', () => {
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
  });

  it('publishes archived cancellation feedback for matching thread removals', () => {
    const onFeedback = vi.fn();
    const unsubscribe = subscribeArchivedOutboxFeedback({
      contextType: 'GAME',
      contextId: 'game-1',
      t: ((_: string, opts?: { count?: number; defaultValue?: string }) =>
        opts?.defaultValue?.replace('{{count}}', String(opts.count ?? 0)) ?? '') as never,
      onFeedback,
    });

    window.dispatchEvent(
      new CustomEvent(CHAT_OUTBOX_REMOVED_EVENT, {
        detail: {
          contextType: 'GAME',
          contextId: 'game-1',
          tempIds: ['opt-1', 'opt-2'],
          reason: 'threadArchived',
          archiveReason: 'game_cancelled',
        },
      })
    );

    expect(onFeedback).toHaveBeenCalledWith(
      '2 messages were not sent because this game was cancelled and chat is now read-only.'
    );

    unsubscribe();
  });

  it('ignores unrelated or non-archived removals', () => {
    const onFeedback = vi.fn();
    const unsubscribe = subscribeArchivedOutboxFeedback({
      contextType: 'GAME',
      contextId: 'game-1',
      t: ((_: string, opts?: { count?: number; defaultValue?: string }) =>
        opts?.defaultValue?.replace('{{count}}', String(opts.count ?? 0)) ?? '') as never,
      onFeedback,
    });

    window.dispatchEvent(
      new CustomEvent(CHAT_OUTBOX_REMOVED_EVENT, {
        detail: {
          contextType: 'GAME',
          contextId: 'game-2',
          tempIds: ['opt-1'],
          reason: 'threadArchived',
          archiveReason: 'game_cancelled',
        },
      })
    );
    window.dispatchEvent(
      new CustomEvent(CHAT_OUTBOX_REMOVED_EVENT, {
        detail: {
          contextType: 'GAME',
          contextId: 'game-1',
          tempIds: ['opt-1'],
        },
      })
    );

    expect(onFeedback).not.toHaveBeenCalled();

    unsubscribe();
  });
});
