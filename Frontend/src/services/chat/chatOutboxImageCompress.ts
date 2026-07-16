const MAX_EDGE_PX = 2048;
const JPEG_QUALITY = 0.82;
const SKIP_BELOW_BYTES = 350_000;

function mimeOf(blob: Blob): string {
  return (blob.type || '').toLowerCase();
}

/** GIF / PNG / WebP keep alpha — never re-encode as JPEG (breaks Save as sticker). */
export function preservesAlphaChannel(blob: Blob, fileName?: string): boolean {
  const t = mimeOf(blob);
  if (t.includes('gif') || t.includes('png') || t.includes('webp')) return true;
  if (fileName) {
    return /\.(gif|png|webp)$/i.test(fileName);
  }
  return false;
}

function isJpegOrHeic(blob: Blob, fileName?: string): boolean {
  const t = mimeOf(blob);
  if (t.includes('jpeg') || t.includes('jpg') || t.includes('heic') || t.includes('heif')) {
    return true;
  }
  if (fileName) {
    return /\.(jpe?g|heic|heif)$/i.test(fileName);
  }
  return t.startsWith('image/') && !preservesAlphaChannel(blob, fileName);
}

function hasImageFileExtension(name: string): boolean {
  return /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(name);
}

async function blobToJpegBlob(blob: Blob, maxEdge: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    let { width, height } = bitmap;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const out = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });
    if (!out || out.size >= blob.size) return blob;
    return out;
  } finally {
    bitmap.close();
  }
}

/** Resize/compress chat photo blobs before Dexie outbox storage. */
export async function compressChatOutboxImageBlob(blob: Blob): Promise<Blob> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return blob;
  if (preservesAlphaChannel(blob)) return blob;
  if (!isJpegOrHeic(blob) && !mimeOf(blob).startsWith('image/')) return blob;
  if (blob.size <= SKIP_BELOW_BYTES) return blob;
  try {
    return await blobToJpegBlob(blob, MAX_EDGE_PX, JPEG_QUALITY);
  } catch {
    return blob;
  }
}

export async function compressChatOutboxImageBlobs(blobs: Blob[]): Promise<Blob[]> {
  return Promise.all(blobs.map(compressChatOutboxImageBlob));
}

/** Resize/compress a chat photo File before upload (non-outbox paths). */
export async function compressChatImageFile(file: File): Promise<File> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return file;
  }

  if (preservesAlphaChannel(file, file.name)) return file;

  const shouldCompress =
    (isJpegOrHeic(file, file.name) || hasImageFileExtension(file.name)) &&
    !mimeOf(file).includes('gif');
  if (!shouldCompress) return file;

  if (
    file.size <= SKIP_BELOW_BYTES &&
    isJpegOrHeic(file, file.name) &&
    !mimeOf(file).includes('heic') &&
    !mimeOf(file).includes('heif')
  ) {
    return file;
  }

  try {
    const blob = await blobToJpegBlob(file, MAX_EDGE_PX, JPEG_QUALITY);
    if (blob === file) return file;
    const base = file.name.replace(/\.[^.]+$/i, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: blob.type || 'image/jpeg' });
  } catch {
    return file;
  }
}
