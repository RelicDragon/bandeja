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
    await Promise.resolve();
    const second = chatApi.postChatSyncBatchHead([{ contextType: 'GROUP', contextId: 'b' }]);
    releaseFirst();

    const [r1, r2] = await Promise.all([first, second]);
    expect(postMock).toHaveBeenCalledTimes(2);
    expect(r1).toEqual({ 'GAME:a': 1, 'GROUP:b': 1 });
    expect(r2).toEqual({ 'GAME:a': 1, 'GROUP:b': 1 });
  });
});
