import { Clipboard } from '@capacitor/clipboard';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isAndroid, isCapacitor } from '@/utils/capacitor';

const CLIPBOARD_IMAGE_MIME = 'image/png';

export type CopyImageOutcome = 'clipboard' | 'shared';

export type CopyImageOptions = {
  blob?: Blob | null;
  img?: HTMLImageElement | null;
};

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

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob);
  const comma = dataUrl.indexOf(',');
  if (comma === -1) throw new Error('invalid data URL');
  return dataUrl.slice(comma + 1);
}

function pngShareFile(pngBlob: Blob): File {
  return new File([pngBlob], 'image.png', { type: CLIPBOARD_IMAGE_MIME });
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
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), CLIPBOARD_IMAGE_MIME);
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

async function blobToPngBlob(blob: Blob): Promise<Blob> {
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

async function ensurePngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === CLIPBOARD_IMAGE_MIME) return blob;
  return blobToPngBlob(blob);
}

async function fetchImageBlob(imageUrl: string): Promise<Blob> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
  return response.blob();
}

async function resolvePngBlob(imageUrl: string, options?: CopyImageOptions): Promise<Blob> {
  let blob = options?.blob ?? null;

  if (!blob) {
    try {
      blob = await fetchImageBlob(imageUrl);
    } catch {
      blob = null;
    }
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

async function sharePngOnWeb(pngBlob: Blob): Promise<void> {
  const file = pngShareFile(pngBlob);
  if (!navigator.canShare?.({ files: [file] })) {
    throw new Error('share unavailable');
  }
  await navigator.share({ files: [file] });
}

async function sharePngOnCapacitor(pngBlob: Blob): Promise<void> {
  const file = pngShareFile(pngBlob);
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }

  const base64 = await blobToBase64(pngBlob);
  const fileName = `image-${Date.now()}.png`;
  const directory = isAndroid() ? Directory.ExternalStorage : Directory.Data;
  await Filesystem.writeFile({ path: fileName, data: base64, directory });
  const fileUri = await Filesystem.getUri({ path: fileName, directory });
  await Share.share({ url: fileUri.uri });
}

async function writePngToWebClipboardOrShare(pngBlob: Blob): Promise<CopyImageOutcome> {
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ [CLIPBOARD_IMAGE_MIME]: pngBlob })]);
      return 'clipboard';
    } catch {
      /* fall through to share */
    }
  }

  await sharePngOnWeb(pngBlob);
  return 'shared';
}

async function writePngOnCapacitor(pngBlob: Blob): Promise<CopyImageOutcome> {
  try {
    const dataUrl = await blobToDataUrl(pngBlob);
    await Clipboard.write({ image: dataUrl });
    return 'clipboard';
  } catch {
    await sharePngOnCapacitor(pngBlob);
    return 'shared';
  }
}

export async function copyImageToClipboard(
  imageUrl: string,
  options?: CopyImageOptions,
): Promise<CopyImageOutcome> {
  const pngBlob = await resolvePngBlob(imageUrl, options);

  if (isCapacitor()) {
    return writePngOnCapacitor(pngBlob);
  }

  return writePngToWebClipboardOrShare(pngBlob);
}
