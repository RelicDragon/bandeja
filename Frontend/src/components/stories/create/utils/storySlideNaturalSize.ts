import type { StorySlide } from '../types/storyEditor.types';

export function probeImageNaturalSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth > 0 ? img.naturalWidth : 1080,
        height: img.naturalHeight > 0 ? img.naturalHeight : 1920,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 1080, height: 1920 });
    };
    img.src = url;
  });
}

export function probeVideoNaturalSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: video.videoWidth > 0 ? video.videoWidth : 1080,
        height: video.videoHeight > 0 ? video.videoHeight : 1920,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 1080, height: 1920 });
    };
    video.src = url;
  });
}

/** Ensure overlay source dimensions exist before publish/export. */
export async function ensureSlideNaturalDimensions(slide: StorySlide): Promise<StorySlide> {
  const nw = slide.media.naturalWidth;
  const nh = slide.media.naturalHeight;
  if (nw != null && nh != null && nw > 0 && nh > 0) return slide;

  const size =
    slide.media.type === 'IMAGE'
      ? await probeImageNaturalSize(slide.media.file)
      : await probeVideoNaturalSize(slide.media.file);

  return {
    ...slide,
    media: { ...slide.media, naturalWidth: size.width, naturalHeight: size.height },
  };
}
