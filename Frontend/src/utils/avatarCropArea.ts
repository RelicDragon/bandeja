import { rotateSize } from './cropUtils';

export type CropPoint = { x: number; y: number };

export type CropSize = { width: number; height: number };

export type MediaSize = {
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
};

export type PixelCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AvatarCropLiveState = {
  crop: CropPoint;
  zoom: number;
  rotation: number;
  mediaSize: MediaSize | null;
  cropSize: CropSize | null;
  aspect?: number;
  restrictPosition?: boolean;
};

function limitArea(max: number, value: number): number {
  return Math.min(max, Math.max(0, value));
}

function identityArea(_max: number, value: number): number {
  return value;
}

export function computePixelCrop(
  crop: CropPoint,
  mediaSize: MediaSize,
  cropSize: CropSize,
  zoom: number,
  options?: {
    rotation?: number;
    aspect?: number;
    restrictPosition?: boolean;
  }
): PixelCrop | null {
  if (zoom <= 0) return null;
  if (cropSize.width <= 0 || cropSize.height <= 0) return null;
  if (mediaSize.width <= 0 || mediaSize.height <= 0) return null;
  if (mediaSize.naturalWidth <= 0 || mediaSize.naturalHeight <= 0) return null;

  const rotation = options?.rotation ?? 0;
  const aspect = options?.aspect ?? 1;
  const restrictPosition = options?.restrictPosition ?? true;
  const clampArea = restrictPosition ? limitArea : identityArea;

  const mediaBBoxSize = rotateSize(mediaSize.width, mediaSize.height, rotation);
  const mediaNaturalBBoxSize = rotateSize(
    mediaSize.naturalWidth,
    mediaSize.naturalHeight,
    rotation
  );

  const croppedAreaPercentages = {
    x: clampArea(
      100,
      (((mediaBBoxSize.width - cropSize.width / zoom) / 2 - crop.x / zoom) /
        mediaBBoxSize.width) *
        100
    ),
    y: clampArea(
      100,
      (((mediaBBoxSize.height - cropSize.height / zoom) / 2 - crop.y / zoom) /
        mediaBBoxSize.height) *
        100
    ),
    width: clampArea(100, ((cropSize.width / mediaBBoxSize.width) * 100) / zoom),
    height: clampArea(100, ((cropSize.height / mediaBBoxSize.height) * 100) / zoom),
  };

  const widthInPixels = Math.round(
    clampArea(
      mediaNaturalBBoxSize.width,
      (croppedAreaPercentages.width * mediaNaturalBBoxSize.width) / 100
    )
  );
  const heightInPixels = Math.round(
    clampArea(
      mediaNaturalBBoxSize.height,
      (croppedAreaPercentages.height * mediaNaturalBBoxSize.height) / 100
    )
  );
  const isImgWiderThanHigh =
    mediaNaturalBBoxSize.width >= mediaNaturalBBoxSize.height * aspect;

  const sizePixels = isImgWiderThanHigh
    ? {
        width: Math.round(heightInPixels * aspect),
        height: heightInPixels,
      }
    : {
        width: widthInPixels,
        height: Math.round(widthInPixels / aspect),
      };

  return {
    ...sizePixels,
    x: Math.round(
      clampArea(
        mediaNaturalBBoxSize.width - sizePixels.width,
        (croppedAreaPercentages.x * mediaNaturalBBoxSize.width) / 100
      )
    ),
    y: Math.round(
      clampArea(
        mediaNaturalBBoxSize.height - sizePixels.height,
        (croppedAreaPercentages.y * mediaNaturalBBoxSize.height) / 100
      )
    ),
  };
}

export function resolveAvatarExportPixelCrop(
  live: AvatarCropLiveState,
  lastKnownPixels: PixelCrop | null
): PixelCrop | null {
  if (live.mediaSize && live.cropSize) {
    const computed = computePixelCrop(live.crop, live.mediaSize, live.cropSize, live.zoom, {
      rotation: live.rotation,
      aspect: live.aspect ?? 1,
      restrictPosition: live.restrictPosition,
    });
    if (computed) return computed;
  }
  return lastKnownPixels;
}
