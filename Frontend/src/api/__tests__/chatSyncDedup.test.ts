import { beforeEach, describe, expect, it, vi } from 'vitest';

const postMock = vi.fn();

vi.mock('../axios', () => ({
  default: {
    get: vi.fn(),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

vi.mock('@/services/chat/chatHttpRetry', () => ({
  withChatSyncRetry: (_label: string, fn: () => Promise<unknown>) => fn(),
  withMessageCreateRetry: (fn: () => Promise<unknown>) => fn(),
}));

describe('chatApi postChatSyncBatchHead drain', () => {
  beforeEach(async () => {
    vi.resetModules();
    postMock.mockReset();
    postMock.mockImplementation(async (_url: string, body: { items: Array<{ contextType: string; contextId: string }> }) => {
      const out: Record<string, number> = {};
      for (const it of body.items) {
        out[`${it.contextType}:${it.contextId}`] = 1;
      }
      return { data: { success: true, data: out } };
    });
  });

  it('coalesces near-concurrent batch-head callers into one HTTP request', async () => {
    const { chatApi } = await import('../chat');
    const first = chatApi.postChatSyncBatchHead([{ contextType: 'GAME', contextId: 'a' }]);
    const second = chatApi.postChatSyncBatchHead([{ contextType: 'GROUP', contextId: 'b' }]);

    const [r1, r2] = await Promise.all([first, second]);
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ 'GAME:a': 1, 'GROUP:b': 1 });
    expect(r2).toEqual({ 'GAME:a': 1, 'GROUP:b': 1 });
  });

  it('drains a second batch queued while the first HTTP request is in flight', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let call = 0;
    postMock.mockImplementation(async (_url: string, body: { items: unknown[] }) => {
      call += 1;
      if (call === 1) {
        await firstGate;
      }
      const out: Record<string, number> = {};
      for (const it of body.items as Array<{ contextType: string; contextId: string }>) {
        out[`${it.contextType}:${it.contextId}`] = 1;
      }
      return { data: { success: true, data: out } };
    });

    const { chatApi } = await import('../chat');
    const first = chatApi.postChatSyncBatchHead([{ contextType: 'GAME', contextId: 'a' }]);
    await vi.waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    const second = chatApi.postChatSyncBatchHead([{ contextType: 'GROUP', contextId: 'b' }]);
    releaseFirst();

    const [r1, r2] = await Promise.all([first, second]);
    expect(postMock).toHaveBeenCalledTimes(2);
    expect(r1).toEqual({ 'GAME:a': 1, 'GROUP:b': 1 });
    expect(r2).toEqual({ 'GAME:a': 1, 'GROUP:b': 1 });
  });

  it('routes getChatSyncHead through batch-head', async () => {
    const { chatApi } = await import('../chat');
    const [a, b] = await Promise.all([
      chatApi.getChatSyncHead('GAME', 'a'),
      chatApi.getChatSyncHead('USER', 'u1'),
    ]);
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0]![0]).toBe('/chat/sync/batch-head');
    expect(a).toBe(1);
    expect(b).toBe(1);
  });
});
