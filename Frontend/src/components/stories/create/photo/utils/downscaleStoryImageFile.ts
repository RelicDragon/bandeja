export const STORY_IMAGE_MAX_LONG_EDGE = 2160;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

export async function downscaleStoryImageFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const img = await loadImageFromFile(file);
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
  if (longEdge <= STORY_IMAGE_MAX_LONG_EDGE) return file;

  const scale = STORY_IMAGE_MAX_LONG_EDGE / longEdge;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
  });
  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'story';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}
