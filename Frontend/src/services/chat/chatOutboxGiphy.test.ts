import { describe, expect, it, vi } from 'vitest';
import {
  importPendingGiphyOutboxMedia,
  toPendingGiphyOutboxMedia,
} from './chatOutboxGiphy';

const item = {
  provider: 'GIPHY' as const,
  id: 'gif-1',
  title: 'Padel win',
  previewUrl: 'https://media.giphy.com/preview.gif',
  downloadUrl: 'https://media.giphy.com/original.gif',
  width: 320,
  height: 180,
};

describe('chat outbox Giphy media', () => {
  it('preserves everything needed to import after reconnect or reload', () => {
    expect(toPendingGiphyOutboxMedia(item)).toEqual({
      ...item,
    });
  });

  it('imports queued provider media into app-owned URLs', async () => {
    const importer = vi.fn().mockResolvedValue({
      mediaUrl: 'https://cdn.example.com/uploads/chat/originals/gif-1.gif',
      thumbnailUrl: 'https://cdn.example.com/uploads/chat/thumbnails/gif-1.jpg',
    });

    await expect(
      importPendingGiphyOutboxMedia(toPendingGiphyOutboxMedia(item), undefined, importer)
    ).resolves.toEqual({
      mediaUrl: 'https://cdn.example.com/uploads/chat/originals/gif-1.gif',
      thumbnailUrl: 'https://cdn.example.com/uploads/chat/thumbnails/gif-1.jpg',
    });
    expect(importer).toHaveBeenCalledWith(item.downloadUrl, { signal: undefined });
  });

  it('rejects provider hotlinks returned by import', async () => {
    const importer = vi.fn().mockResolvedValue({
      mediaUrl: item.downloadUrl,
      thumbnailUrl: item.previewUrl,
    });

    await expect(
      importPendingGiphyOutboxMedia(toPendingGiphyOutboxMedia(item), undefined, importer)
    ).rejects.toThrow('gif_provider_hotlink_rejected');
  });

  it('retries transient import busy / rate-limit before succeeding', async () => {
    const importer = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockResolvedValue({
        mediaUrl: 'https://cdn.example.com/uploads/chat/originals/gif-1.gif',
        thumbnailUrl: 'https://cdn.example.com/uploads/chat/thumbnails/gif-1.jpg',
      });

    await expect(
      importPendingGiphyOutboxMedia(toPendingGiphyOutboxMedia(item), undefined, importer)
    ).resolves.toMatchObject({
      mediaUrl: 'https://cdn.example.com/uploads/chat/originals/gif-1.gif',
    });
    expect(importer).toHaveBeenCalledTimes(3);
  });

  it('preserves KLIPY provider media for fallback results', () => {
    expect(toPendingGiphyOutboxMedia({ ...item, provider: 'KLIPY' })).toEqual({
      ...item,
      provider: 'KLIPY',
    });
  });
});
