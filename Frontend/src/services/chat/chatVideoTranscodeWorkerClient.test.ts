import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { transcodeChatVideoToMp4Core } = vi.hoisted(() => ({
  transcodeChatVideoToMp4Core: vi.fn(),
}));

vi.mock('./chatVideoTranscodeCore', () => ({
  transcodeChatVideoToMp4Core: (...args: unknown[]) => transcodeChatVideoToMp4Core(...args),
}));

import { transcodeChatVideoToMp4InWorker } from './chatVideoTranscodeWorkerClient';

function videoFile(): File {
  return new File([new Uint8Array(4)], 'in.mov', { type: 'video/quicktime' });
}

describe('transcodeChatVideoToMp4InWorker', () => {
  const originalWorker = globalThis.Worker;

  beforeEach(() => {
    transcodeChatVideoToMp4Core.mockReset();
    transcodeChatVideoToMp4Core.mockResolvedValue(
      new File([new Uint8Array(8)], 'chat-video-t.mp4', { type: 'video/mp4' })
    );
  });

  afterEach(() => {
    if (originalWorker) {
      globalThis.Worker = originalWorker;
    } else {
      // @ts-expect-error restore
      delete globalThis.Worker;
    }
  });

  it('falls back to main-thread core when Worker is unavailable', async () => {
    // @ts-expect-error test env
    globalThis.Worker = undefined;
    const meta = { durationMs: 10_000, width: 640, height: 360 };
    const out = await transcodeChatVideoToMp4InWorker(videoFile(), 't1', meta);
    expect(out.name).toContain('.mp4');
    expect(transcodeChatVideoToMp4Core).toHaveBeenCalledOnce();
  });
});
