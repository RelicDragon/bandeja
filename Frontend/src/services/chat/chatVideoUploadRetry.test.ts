import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { uploadChatVideo } = vi.hoisted(() => ({
  uploadChatVideo: vi.fn(),
}));

vi.mock('@/api/media', () => ({
  mediaApi: {
    uploadChatVideo: (...args: unknown[]) => uploadChatVideo(...args),
  },
}));

import { uploadChatVideoFileWithRetry } from './chatVideoUploadRetry';

function videoFile(): File {
  return new File([new Uint8Array(8)], 'clip.mp4', { type: 'video/mp4' });
}

describe('uploadChatVideoFileWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    uploadChatVideo.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns on first success', async () => {
    uploadChatVideo.mockResolvedValue({
      videoUrl: 'uploads/chat/videos/a.mp4',
      thumbnailUrl: 'uploads/chat/thumbnails/a.jpg',
      durationMs: 5000,
    });
    const result = await uploadChatVideoFileWithRetry(
      videoFile(),
      undefined,
      'g1',
      'GAME',
      5000,
      640,
      360
    );
    expect(result.videoUrl).toContain('videos/');
    expect(uploadChatVideo).toHaveBeenCalledTimes(1);
  });

  it('retries then succeeds', async () => {
    uploadChatVideo
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        videoUrl: 'uploads/chat/videos/b.mp4',
        thumbnailUrl: 'uploads/chat/thumbnails/b.jpg',
        durationMs: 3000,
      });
    const p = uploadChatVideoFileWithRetry(videoFile(), undefined, 'g1', 'GAME', 3000, 0, 0, 3);
    await vi.advanceTimersByTimeAsync(500);
    await expect(p).resolves.toMatchObject({ videoUrl: expect.stringContaining('videos/') });
    expect(uploadChatVideo).toHaveBeenCalledTimes(2);
  });

  it('throws after max attempts', async () => {
    uploadChatVideo.mockRejectedValue(new Error('network'));
    const p = uploadChatVideoFileWithRetry(videoFile(), undefined, 'g1', 'GAME', 1000, 0, 0, 2);
    const expectFail = expect(p).rejects.toThrow('network');
    await vi.advanceTimersByTimeAsync(500);
    await expectFail;
    expect(uploadChatVideo).toHaveBeenCalledTimes(2);
  });

  it('does not retry when aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    uploadChatVideo.mockRejectedValue(new Error('network'));
    await expect(
      uploadChatVideoFileWithRetry(videoFile(), undefined, 'g1', 'GAME', 1000, 0, 0, 3, ac.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(uploadChatVideo).not.toHaveBeenCalled();
  });
});
