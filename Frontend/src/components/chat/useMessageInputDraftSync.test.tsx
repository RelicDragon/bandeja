// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useRef, useState, type MutableRefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ChatContextType, ChatDraft, ChatMessage } from '@/api/chat';
import type { ChatType } from '@/types';
import { draftLoadingCache } from './messageInputDraftUtils';
import { useMessageInputDraftSync } from './useMessageInputDraftSync';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { getDraftMock, saveDraftMock, getLocalMock, setLocalMock } = vi.hoisted(() => ({
  getDraftMock: vi.fn(),
  saveDraftMock: vi.fn(),
  getLocalMock: vi.fn(),
  setLocalMock: vi.fn(),
}));

vi.mock('@/api/chat', () => ({
  chatApi: {
    getDraft: getDraftMock,
    saveDraft: saveDraftMock,
    deleteDraft: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/services/draftStorage', () => ({
  draftStorage: {
    get: getLocalMock,
    set: setLocalMock,
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

type HarnessApi = {
  message: string;
  setMessage: (v: string) => void;
  messageRef: MutableRefObject<string>;
  saveDraft: (content: string, mentionIds: string[]) => Promise<void>;
};

function DraftHarness({
  finalContextId,
  onReady,
}: {
  finalContextId: string;
  onReady: (api: HarnessApi) => void;
}) {
  const [message, setMessage] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const messageRef = useRef(message);
  const mentionIdsRef = useRef(mentionIds);
  const editingMessageRef = useRef<ChatMessage | null>(null);
  messageRef.current = message;
  mentionIdsRef.current = mentionIds;

  const sync = useMessageInputDraftSync({
    finalContextId,
    userId: 'u1',
    contextType: 'USER' as ChatContextType,
    resolvedChatType: 'PUBLIC' as ChatType,
    chatType: 'PUBLIC' as ChatType,
    userChatId: finalContextId,
    messageRef,
    mentionIdsRef,
    editingMessageRef,
    setMessage,
    setMentionIds,
    setOriginalMessageBeforeTranslate: () => {},
    setOriginalMentionIdsBeforeTranslate: () => {},
    updateMultilineState: () => {},
  });

  onReady({
    message,
    setMessage,
    messageRef,
    saveDraft: sync.saveDraft,
  });
  return null;
}

function localDraft(content: string, updatedAt: string) {
  return { content, mentionIds: [] as string[], updatedAt };
}

function serverDraft(contextId: string, content: string, updatedAt: string): ChatDraft {
  return {
    id: `d-${contextId}`,
    userId: 'u1',
    chatContextType: 'USER',
    contextId,
    chatType: 'PUBLIC',
    content,
    mentionIds: [],
    updatedAt,
    createdAt: updatedAt,
  };
}

describe('useMessageInputDraftSync chat switch', () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: HarnessApi | null;

  beforeEach(() => {
    draftLoadingCache.clear();
    getDraftMock.mockReset();
    saveDraftMock.mockReset();
    getLocalMock.mockReset();
    setLocalMock.mockReset();
    getLocalMock.mockResolvedValue(null);
    getDraftMock.mockResolvedValue(null);
    saveDraftMock.mockImplementation(async (payload: { contextId: string; content?: string }) =>
      serverDraft(payload.contextId, payload.content ?? '', new Date().toISOString())
    );
    setLocalMock.mockResolvedValue(undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    api = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    draftLoadingCache.clear();
  });

  async function renderWith(finalContextId: string) {
    await act(async () => {
      root.render(
        <DraftHarness
          finalContextId={finalContextId}
          onReady={(next) => {
            api = next;
          }}
        />
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  it('flushes draft to the previous chat and does not keep it in the next composer', async () => {
    await renderWith('chat-a');
    expect(api).not.toBeNull();

    await act(async () => {
      api!.setMessage('hello from A');
    });
    expect(api!.message).toBe('hello from A');
    expect(api!.messageRef.current).toBe('hello from A');

    await renderWith('chat-b');
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setLocalMock).toHaveBeenCalledWith(
      'u1',
      'USER',
      'chat-a',
      'PUBLIC',
      'hello from A',
      []
    );
    expect(saveDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chatContextType: 'USER',
        contextId: 'chat-a',
        content: 'hello from A',
      })
    );
    expect(api!.message).toBe('');
    expect(api!.messageRef.current).toBe('');
    expect(
      setLocalMock.mock.calls.some((call) => call[2] === 'chat-b' && call[4] === 'hello from A')
    ).toBe(false);
  });

  it('restores the previous chat draft when returning', async () => {
    const t0 = '2026-01-01T00:00:00.000Z';
    getLocalMock.mockImplementation(async (_userId: string, _type: string, contextId: string) => {
      if (contextId === 'chat-a') return localDraft('kept on A', t0);
      return null;
    });
    getDraftMock.mockResolvedValue(null);

    await renderWith('chat-a');
    await act(async () => {
      await Promise.resolve();
    });
    expect(api!.message).toBe('kept on A');

    await act(async () => {
      api!.setMessage('kept on A edited');
    });

    await renderWith('chat-b');
    await act(async () => {
      await Promise.resolve();
    });
    expect(api!.message).toBe('');

    getLocalMock.mockImplementation(async (_userId: string, _type: string, contextId: string) => {
      if (contextId === 'chat-a') {
        return localDraft('kept on A edited', '2026-01-01T00:00:01.000Z');
      }
      return null;
    });

    await renderWith('chat-a');
    await act(async () => {
      await Promise.resolve();
    });
    expect(api!.message).toBe('kept on A edited');
  });

  it('ignores stale in-flight lastSaved updates from the previous chat', async () => {
    let resolveSaveA: ((value: ChatDraft) => void) | null = null;
    saveDraftMock.mockImplementationOnce(
      () =>
        new Promise<ChatDraft>((resolve) => {
          resolveSaveA = resolve;
        })
    );

    await renderWith('chat-a');
    await act(async () => {
      api!.setMessage('hello');
    });

    let pendingSave!: Promise<void>;
    await act(async () => {
      pendingSave = api!.saveDraft('hello', []);
    });

    await renderWith('chat-b');
    await act(async () => {
      await Promise.resolve();
    });
    expect(api!.message).toBe('');

    await act(async () => {
      resolveSaveA!(serverDraft('chat-a', 'hello', new Date().toISOString()));
      await pendingSave;
    });

    saveDraftMock.mockClear();
    saveDraftMock.mockImplementation(async (payload: { contextId: string; content?: string }) =>
      serverDraft(payload.contextId, payload.content ?? '', new Date().toISOString())
    );

    await act(async () => {
      api!.setMessage('hello');
      await api!.saveDraft('hello', []);
    });

    expect(saveDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contextId: 'chat-b',
        content: 'hello',
      })
    );
  });

  it('still pushes a newer local draft to the server after restore', async () => {
    getLocalMock.mockResolvedValue(localDraft('local-newer', '2026-01-02T00:00:00.000Z'));
    getDraftMock.mockResolvedValue(serverDraft('chat-a', 'server-older', '2026-01-01T00:00:00.000Z'));

    await renderWith('chat-a');
    await act(async () => {
      await vi.waitFor(() => {
        expect(saveDraftMock).toHaveBeenCalledWith(
          expect.objectContaining({
            contextId: 'chat-a',
            content: 'local-newer',
          })
        );
      });
    });

    expect(api!.message).toBe('local-newer');
  });

  it('does not mark lastSaved when a loaded draft is skipped because user already typed', async () => {
    let resolveLocal: ((value: ReturnType<typeof localDraft> | null) => void) | null = null;
    getLocalMock.mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof localDraft> | null>((resolve) => {
          resolveLocal = resolve;
        })
    );
    getDraftMock.mockResolvedValue(null);

    await renderWith('chat-a');
    await act(async () => {
      api!.setMessage('typed-before-load');
    });

    await act(async () => {
      resolveLocal!(localDraft('stored-draft', '2026-01-01T00:00:00.000Z'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api!.message).toBe('typed-before-load');

    saveDraftMock.mockClear();
    await act(async () => {
      api!.setMessage('');
      await api!.saveDraft('', []);
    });

    // lastSaved must still be empty from adopt — clearing typed text must not delete stored draft.
    expect(saveDraftMock).not.toHaveBeenCalled();
  });

  it('does not force-push a skipped local draft over user typing', async () => {
    let resolveLocal: ((value: ReturnType<typeof localDraft> | null) => void) | null = null;
    getLocalMock.mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof localDraft> | null>((resolve) => {
          resolveLocal = resolve;
        })
    );
    getDraftMock.mockResolvedValue(serverDraft('chat-a', 'server-older', '2026-01-01T00:00:00.000Z'));

    await renderWith('chat-a');
    await act(async () => {
      api!.setMessage('user-wins');
    });

    saveDraftMock.mockClear();
    await act(async () => {
      resolveLocal!(localDraft('local-newer', '2026-01-02T00:00:00.000Z'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api!.message).toBe('user-wins');
    expect(saveDraftMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: 'local-newer' })
    );
  });
});
