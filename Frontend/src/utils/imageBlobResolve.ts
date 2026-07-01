const PNG_MIME = 'image/png';

export type ImageBlobOptions = {
  blob?: Blob | null;
  img?: HTMLImageElement | null;
};

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('readAsDataURL failed'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('readAsDataURL failed'));
    reader.readAsDataURL(blob);
  });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob);
  const comma = dataUrl.indexOf(',');
  if (comma === -1) throw new Error('invalid data URL');
  return dataUrl.slice(comma + 1);
}

function pngBlobFromCanvasSource(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas context');
  ctx.drawImage(source, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), PNG_MIME);
  });
}

function pngBlobFromImageElement(img: HTMLImageElement): Promise<Blob> {
  return pngBlobFromCanvasSource(img, img.naturalWidth, img.naturalHeight);
}

async function blobToPngBlobViaImage(blob: Blob): Promise<Blob> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image decode failed'));
      img.src = objectUrl;
    });
    return pngBlobFromImageElement(img);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function blobToPngBlob(blob: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      return await pngBlobFromCanvasSource(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  } catch {
    return blobToPngBlobViaImage(blob);
  }
}

export async function ensurePngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === PNG_MIME) return blob;
  return blobToPngBlob(blob);
}

async function fetchImageBlob(imageUrl: string): Promise<Blob> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
  return response.blob();
}

function isImageBlob(blob: Blob): boolean {
  return blob.type.startsWith('image/');
}

export async function resolveImageBlob(imageUrl: string, options?: ImageBlobOptions): Promise<Blob> {
  let blob = options?.blob ?? null;

  if (!blob) {
    try {
      blob = await fetchImageBlob(imageUrl);
    } catch {
      blob = null;
    }
  }

  if (blob && isImageBlob(blob)) {
    return blob;
  }

  if (blob) {
    try {
      return await ensurePngBlob(blob);
    } catch {
      /* try displayed image */
    }
  }

  const img = options?.img;
  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    return pngBlobFromImageElement(img);
  }

  throw new Error('image unavailable');
}

export async function resolvePngBlob(imageUrl: string, options?: ImageBlobOptions): Promise<Blob> {
  const blob = await resolveImageBlob(imageUrl, options);
  return ensurePngBlob(blob);
}
