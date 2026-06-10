import { describe, expect, it, vi } from 'vitest';
import { inferVideoMimeType, isValidVideo, withNormalizedVideoMime } from './videoFileUtils';

vi.mock('./capacitor', () => ({
  isCapacitor: vi.fn(() => false),
}));

import { isCapacitor } from './capacitor';

function file(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('inferVideoMimeType', () => {
  it('keeps explicit video MIME', () => {
    expect(inferVideoMimeType('clip.mp4', 'video/mp4')).toBe('video/mp4');
  });

  it('infers MOV from extension when type is empty', () => {
    expect(inferVideoMimeType('IMG_0001.MOV', '')).toBe('video/quicktime');
  });

  it('infers MP4 from octet-stream on iOS', () => {
    expect(inferVideoMimeType('clip.mp4', 'application/octet-stream')).toBe('video/mp4');
  });
});

describe('isValidVideo', () => {
  it('accepts normal MP4', () => {
    expect(isValidVideo(file('clip.mp4', 'video/mp4'))).toBe(true);
  });

  it('rejects extensionless empty MIME on web', () => {
    expect(isValidVideo(file('blob', ''))).toBe(false);
  });

  it('accepts extension-only video on web', () => {
    expect(isValidVideo(file('clip.mov', ''))).toBe(true);
  });

  it('accepts empty MIME on Capacitor', () => {
    vi.mocked(isCapacitor).mockReturnValue(true);
    expect(isValidVideo(file('IMG_0001.MOV', ''))).toBe(true);
    vi.mocked(isCapacitor).mockReturnValue(false);
  });
});

describe('withNormalizedVideoMime', () => {
  it('rewraps file with inferred MIME', () => {
    const raw = file('clip.mov', '');
    const normalized = withNormalizedVideoMime(raw);
    expect(normalized.type).toBe('video/quicktime');
    expect(normalized.name).toBe('clip.mov');
  });
});
