import { afterEach, describe, expect, it, vi } from 'vitest';

const { loadOutboxVideoBlob, loadOutboxVideoPosterBlob } = vi.hoisted(() => ({
  loadOutboxVideoBlob: vi.fn(),
  loadOutboxVideoPosterBlob: vi.fn(),
}));

vi.mock('@/services/chat/chatOutboxMediaBlobs', () => ({
  loadOutboxVideoBlob,
  loadOutboxVideoPosterBlob,
}));

import { loadOutboxVideoPreviewUrls } from './chatOutboxVideoRehydrate';

describe('loadOutboxVideoPreviewUrls', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when video blob is missing', async () => {
    loadOutboxVideoBlob.mockResolvedValue(undefined);
    await expect(loadOutboxVideoPreviewUrls('opt-1')).resolves.toBeNull();
  });

  it('uses fallback poster when poster blob is missing', async () => {
    const video = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' });
    loadOutboxVideoBlob.mockResolvedValue(video);
    loadOutboxVideoPosterBlob.mockResolvedValue(undefined);

    const result = await loadOutboxVideoPreviewUrls('opt-2');
    expect(result).not.toBeNull();
    expect(result!.mediaUrls).toHaveLength(1);
    expect(result!.thumbnailUrls).toHaveLength(1);
    expect(result!.mediaUrls[0]).toMatch(/^blob:/);
    expect(result!.thumbnailUrls[0]).toMatch(/^blob:/);
  });

  it('uses stored poster when available', async () => {
    const video = new Blob([new Uint8Array([1])], { type: 'video/mp4' });
    const poster = new Blob([new Uint8Array([2])], { type: 'image/jpeg' });
    loadOutboxVideoBlob.mockResolvedValue(video);
    loadOutboxVideoPosterBlob.mockResolvedValue(poster);

    const result = await loadOutboxVideoPreviewUrls('opt-3');
    expect(result!.thumbnailUrls[0]).toMatch(/^blob:/);
    expect(loadOutboxVideoPosterBlob).toHaveBeenCalledWith('opt-3');
  });
});
