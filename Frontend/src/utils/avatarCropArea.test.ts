import { describe, expect, it } from 'vitest';
import {
  computePixelCrop,
  resolveAvatarExportPixelCrop,
  type MediaSize,
  type PixelCrop,
} from './avatarCropArea';

const SQUARE_MEDIA: MediaSize = {
  width: 400,
  height: 400,
  naturalWidth: 1000,
  naturalHeight: 1000,
};

const SQUARE_CROP = { width: 400, height: 400 };

const STALE_1X: PixelCrop = { x: 0, y: 0, width: 1000, height: 1000 };

describe('computePixelCrop', () => {
  it('returns the full square image at 1× with no pan', () => {
    expect(
      computePixelCrop({ x: 0, y: 0 }, SQUARE_MEDIA, SQUARE_CROP, 1, { aspect: 1 })
    ).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
  });

  it('returns a centered half-size crop at 2× with no pan', () => {
    expect(
      computePixelCrop({ x: 0, y: 0 }, SQUARE_MEDIA, SQUARE_CROP, 2, { aspect: 1 })
    ).toEqual({ x: 250, y: 250, width: 500, height: 500 });
  });

  it('shifts the pixel crop when panned at 2×', () => {
    expect(
      computePixelCrop({ x: 100, y: 0 }, SQUARE_MEDIA, SQUARE_CROP, 2, { aspect: 1 })
    ).toEqual({ x: 125, y: 250, width: 500, height: 500 });
  });

  it('takes a centered square from a landscape image at 1×', () => {
    const media: MediaSize = {
      width: 800,
      height: 400,
      naturalWidth: 2000,
      naturalHeight: 1000,
    };
    expect(
      computePixelCrop({ x: 0, y: 0 }, media, SQUARE_CROP, 1, { aspect: 1 })
    ).toEqual({ x: 500, y: 0, width: 1000, height: 1000 });
  });

  it('returns null for invalid zoom or sizes', () => {
    expect(computePixelCrop({ x: 0, y: 0 }, SQUARE_MEDIA, SQUARE_CROP, 0)).toBeNull();
    expect(
      computePixelCrop({ x: 0, y: 0 }, SQUARE_MEDIA, { width: 0, height: 400 }, 1)
    ).toBeNull();
  });
});

describe('resolveAvatarExportPixelCrop', () => {
  it('prefers live zoom/pan over a stale crop-complete rectangle', () => {
    const exportCrop = resolveAvatarExportPixelCrop(
      {
        crop: { x: 0, y: 0 },
        zoom: 2,
        rotation: 0,
        mediaSize: SQUARE_MEDIA,
        cropSize: SQUARE_CROP,
        aspect: 1,
      },
      STALE_1X
    );
    expect(exportCrop).toEqual({ x: 250, y: 250, width: 500, height: 500 });
    expect(exportCrop).not.toEqual(STALE_1X);
  });

  it('uses live pan even when crop-complete still has the initial 1× pixels', () => {
    expect(
      resolveAvatarExportPixelCrop(
        {
          crop: { x: 100, y: 50 },
          zoom: 2,
          rotation: 0,
          mediaSize: SQUARE_MEDIA,
          cropSize: SQUARE_CROP,
          aspect: 1,
        },
        STALE_1X
      )
    ).toEqual({ x: 125, y: 188, width: 500, height: 500 });
  });

  it('falls back to last known pixels when live geometry is missing', () => {
    expect(
      resolveAvatarExportPixelCrop(
        {
          crop: { x: 0, y: 0 },
          zoom: 2,
          rotation: 0,
          mediaSize: null,
          cropSize: null,
        },
        STALE_1X
      )
    ).toEqual(STALE_1X);
  });

  it('keeps a no-zoom crop when live state is 1×', () => {
    expect(
      resolveAvatarExportPixelCrop(
        {
          crop: { x: 0, y: 0 },
          zoom: 1,
          rotation: 0,
          mediaSize: SQUARE_MEDIA,
          cropSize: SQUARE_CROP,
          aspect: 1,
        },
        null
      )
    ).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
  });
});
