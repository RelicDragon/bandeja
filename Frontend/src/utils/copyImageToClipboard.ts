import { Clipboard } from '@capacitor/clipboard';
import { isCapacitor } from '@/utils/capacitor';

async function blobToDataUrl(blob: Blob): Promise<string> {
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

async function blobToPngBlob(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas context');
    ctx.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    });
  } finally {
    bitmap.close();
  }
}

async function fetchImageBlob(imageUrl: string): Promise<Blob> {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  const fromBlob = blob.type?.trim();
  const fromHeader = response.headers.get('content-type')?.split(';')[0]?.trim();
  const mime =
    fromBlob && fromBlob.startsWith('image/')
      ? fromBlob
      : fromHeader && fromHeader.startsWith('image/')
        ? fromHeader
        : '';

  if (mime) return blob;
  return blobToPngBlob(blob);
}

export async function copyImageToClipboard(imageUrl: string): Promise<void> {
  const blob = await fetchImageBlob(imageUrl);

  if (isCapacitor()) {
    const dataUrl = await blobToDataUrl(blob);
    await Clipboard.write({ image: dataUrl });
    return;
  }

  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('clipboard unavailable');
  }

  const mime = blob.type?.trim() && blob.type.startsWith('image/') ? blob.type : 'image/png';
  await navigator.clipboard.write([new ClipboardItem({ [mime]: Promise.resolve(blob) })]);
}
