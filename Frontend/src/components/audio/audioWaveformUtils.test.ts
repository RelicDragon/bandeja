import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/capacitor', () => ({
  isCapacitor: vi.fn(() => false),
}));

describe('resolveChatMediaUrl', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('uses production media origin on Capacitor when build env is localhost dev default', async () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', 'http://localhost:3001');
    const { isCapacitor } = await import('@/utils/capacitor');
    vi.mocked(isCapacitor).mockReturnValue(true);
    const { resolveChatMediaUrl } = await import('@/components/audio/audioWaveformUtils');

    expect(resolveChatMediaUrl('/uploads/chat/audio.mp3')).toBe(
      'https://bandeja.me/uploads/chat/audio.mp3',
    );
  });

  it('keeps localhost media origin for web development', async () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', 'http://localhost:3001');
    const { isCapacitor } = await import('@/utils/capacitor');
    vi.mocked(isCapacitor).mockReturnValue(false);
    const { resolveChatMediaUrl } = await import('@/components/audio/audioWaveformUtils');

    expect(resolveChatMediaUrl('/uploads/chat/audio.mp3')).toBe(
      'http://localhost:3001/uploads/chat/audio.mp3',
    );
  });
});
