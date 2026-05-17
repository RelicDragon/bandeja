import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  isVideoPictureInPictureActive,
  isVideoPictureInPictureSupported,
  supportsStandardVideoPictureInPicture,
  supportsWebkitVideoPictureInPicture,
  toggleVideoPictureInPicture,
} from './videoPictureInPicture';

describe('videoPictureInPicture', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('detects standard PiP when document.pictureInPictureEnabled', () => {
    vi.stubGlobal('document', { pictureInPictureEnabled: true });
    expect(supportsStandardVideoPictureInPicture()).toBe(true);
    expect(isVideoPictureInPictureSupported()).toBe(true);
  });

  it('detects WebKit PiP on video element', () => {
    vi.stubGlobal('document', { pictureInPictureEnabled: false, pictureInPictureElement: null });
    const video = {
      webkitSupportsPresentationMode: (mode: string) => mode === 'picture-in-picture',
      webkitSetPresentationMode: vi.fn(),
      webkitPresentationMode: 'inline',
    } as unknown as HTMLVideoElement;
    expect(supportsWebkitVideoPictureInPicture(video)).toBe(true);
    expect(isVideoPictureInPictureSupported(video)).toBe(true);
  });

  it('toggles via webkitSetPresentationMode when standard API unavailable', async () => {
    vi.stubGlobal('document', { pictureInPictureEnabled: false, pictureInPictureElement: null });
    const setMode = vi.fn();
    const video = {
      webkitSupportsPresentationMode: (mode: string) => mode === 'picture-in-picture',
      webkitSetPresentationMode: setMode,
      webkitPresentationMode: 'inline',
    } as unknown as HTMLVideoElement;
    await toggleVideoPictureInPicture(video);
    expect(setMode).toHaveBeenCalledWith('picture-in-picture');
  });

  it('reports active state from webkitPresentationMode', () => {
    vi.stubGlobal('document', { pictureInPictureElement: null });
    const video = { webkitPresentationMode: 'picture-in-picture' } as unknown as HTMLVideoElement;
    expect(isVideoPictureInPictureActive(video)).toBe(true);
  });
});
