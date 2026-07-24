import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_VIDEO_DURATION_MS } from '@/constants/chatVideo';

const { loadChatVideoMetadata, captureChatVideoPosterBlob, transcodeChatVideoToMp4 } = vi.hoisted(
  () => ({
    loadChatVideoMetadata: vi.fn(),
    captureChatVideoPosterBlob: vi.fn(),
    transcodeChatVideoToMp4: vi.fn(),
  })
);

vi.mock('./chatVideoMetadata', () => ({
  loadChatVideoMetadata: (...args: unknown[]) => loadChatVideoMetadata(...args),
}));

vi.mock('./chatVideoPoster', () => ({
  captureChatVideoPosterBlob: (...args: unknown[]) => captureChatVideoPosterBlob(...args),
}));

vi.mock('./chatVideoTranscodeMediabunny', () => ({
  transcodeChatVideoToMp4: (...args: unknown[]) => transcodeChatVideoToMp4(...args),
}));

import { prepareChatVideoForSend } from './chatVideoTranscode';

describe('prepareChatVideoForSend', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    loadChatVideoMetadata.mockReset();
    captureChatVideoPosterBlob.mockReset();
    transcodeChatVideoToMp4.mockReset();
  });

  it('captures poster from source in parallel and does not pass identity trim (worker path)', async () => {
    vi.stubGlobal('VideoEncoder', function VideoEncoder() {});
    vi.stubGlobal('VideoDecoder', function VideoDecoder() {});

    const raw = new File([new Uint8Array(8)], 'clip.mov', { type: 'video/quicktime' });
    const encoded = new File([new Uint8Array(16)], 'chat-video-t.mp4', { type: 'video/mp4' });
    const poster = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });

    loadChatVideoMetadata.mockResolvedValue({
      durationMs: 12_000,
      width: 1920,
      height: 1080,
    });
    captureChatVideoPosterBlob.mockResolvedValue(poster);
    transcodeChatVideoToMp4.mockResolvedValue(encoded);

    const result = await prepareChatVideoForSend(raw, 't1');

    expect(captureChatVideoPosterBlob).toHaveBeenCalledWith(raw);
    expect(transcodeChatVideoToMp4).toHaveBeenCalledWith(
      raw,
      't1',
      { durationMs: 12_000, width: 1920, height: 1080 },
      undefined,
      undefined
    );
    expect(result.videoFile.type).toBe('video/mp4');
    expect(result.posterBlob).toBe(poster);
    expect(result.durationMs).toBe(12_000);
    expect(result.width).toBeLessThanOrEqual(1280);
    expect(result.height).toBeLessThanOrEqual(720);
  });

  it('passes trim only when caller requests a clip', async () => {
    vi.stubGlobal('VideoEncoder', function VideoEncoder() {});
    vi.stubGlobal('VideoDecoder', function VideoDecoder() {});

    const raw = new File([new Uint8Array(8)], 'clip.mp4', { type: 'video/mp4' });
    loadChatVideoMetadata.mockResolvedValue({
      durationMs: 60_000,
      width: 640,
      height: 360,
    });
    captureChatVideoPosterBlob.mockResolvedValue(new Blob([new Uint8Array([9])], { type: 'image/jpeg' }));
    transcodeChatVideoToMp4.mockResolvedValue(
      new File([new Uint8Array(4)], 'chat-video-t.mp4', { type: 'video/mp4' })
    );

    await prepareChatVideoForSend(raw, 't2', { trim: { startMs: 1_000, endMs: 5_000 } });

    expect(transcodeChatVideoToMp4).toHaveBeenCalledWith(
      raw,
      't2',
      { durationMs: 60_000, width: 640, height: 360 },
      undefined,
      { startSec: 1, endSec: 5 }
    );
  });

  it('still settles when poster capture is slow (fallback promise always resolves)', async () => {
    vi.stubGlobal('VideoEncoder', function VideoEncoder() {});
    vi.stubGlobal('VideoDecoder', function VideoDecoder() {});

    const raw = new File([new Uint8Array(8)], 'clip.mov', { type: 'video/quicktime' });
    loadChatVideoMetadata.mockResolvedValue({
      durationMs: 8_000,
      width: 640,
      height: 360,
    });
    let resolvePoster!: (b: Blob) => void;
    captureChatVideoPosterBlob.mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          resolvePoster = resolve;
        })
    );
    transcodeChatVideoToMp4.mockResolvedValue(
      new File([new Uint8Array(4)], 'chat-video-t.mp4', { type: 'video/mp4' })
    );

    const pending = prepareChatVideoForSend(raw, 't3');
    await Promise.resolve();
    resolvePoster(new Blob([new Uint8Array([7])], { type: 'image/jpeg' }));
    const result = await pending;
    expect(result.durationMs).toBe(8_000);
  });

  it('clamps long source duration after encode without requiring HTMLVideo re-probe', async () => {
    vi.stubGlobal('VideoEncoder', function VideoEncoder() {});
    vi.stubGlobal('VideoDecoder', function VideoDecoder() {});

    const raw = new File([new Uint8Array(8)], 'long.mp4', { type: 'video/mp4' });
    loadChatVideoMetadata.mockResolvedValue({
      durationMs: MAX_VIDEO_DURATION_MS + 90_000,
      width: 640,
      height: 360,
    });
    captureChatVideoPosterBlob.mockResolvedValue(new Blob([new Uint8Array([1])], { type: 'image/jpeg' }));
    transcodeChatVideoToMp4.mockResolvedValue(
      new File([new Uint8Array(4)], 'chat-video-t.mp4', { type: 'video/mp4' })
    );

    const result = await prepareChatVideoForSend(raw, 't4');
    expect(loadChatVideoMetadata).toHaveBeenCalledOnce();
    expect(result.durationMs).toBe(MAX_VIDEO_DURATION_MS);
  });
});
