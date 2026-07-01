import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isCapacitor } from '@/utils/capacitor';
import {
  blobToBase64,
  resolveImageBlob,
  type ImageBlobOptions,
} from '@/utils/imageBlobResolve';

export type DownloadImageOutcome = 'downloaded' | 'shared';
export type DownloadImageOptions = ImageBlobOptions;

function extensionForBlob(blob: Blob): string {
  const mime = blob.type?.split(';')[0]?.trim() ?? '';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  return 'png';
}

function downloadFileName(blob: Blob): string {
  return `image-${Date.now()}.${extensionForBlob(blob)}`;
}

function imageFile(blob: Blob): File {
  const fileName = downloadFileName(blob);
  const mime = blob.type?.trim() || 'image/png';
  return new File([blob], fileName, { type: mime });
}

function isMobileWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function shareImageFile(blob: Blob): Promise<void> {
  const file = imageFile(blob);
  if (!navigator.canShare?.({ files: [file] })) {
    throw new Error('share unavailable');
  }
  await navigator.share({ files: [file] });
}

async function anchorDownload(blob: Blob): Promise<void> {
  const fileName = downloadFileName(blob);
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function downloadOnWeb(blob: Blob): Promise<DownloadImageOutcome> {
  if (isMobileWeb()) {
    try {
      await shareImageFile(blob);
      return 'shared';
    } catch {
      /* fall through to anchor download */
    }
  }

  try {
    await anchorDownload(blob);
    return 'downloaded';
  } catch {
    await shareImageFile(blob);
    return 'shared';
  }
}

async function downloadOnCapacitor(blob: Blob): Promise<DownloadImageOutcome> {
  try {
    await shareImageFile(blob);
    return 'shared';
  } catch {
    /* fall through to filesystem share */
  }

  const fileName = downloadFileName(blob);
  const base64 = await blobToBase64(blob);
  const directory = Directory.Cache;
  await Filesystem.writeFile({ path: fileName, data: base64, directory });
  const { uri } = await Filesystem.getUri({ path: fileName, directory });
  await Share.share({ url: uri });
  return 'shared';
}

export async function downloadImage(
  imageUrl: string,
  options?: DownloadImageOptions,
): Promise<DownloadImageOutcome> {
  const blob = await resolveImageBlob(imageUrl, options);

  if (isCapacitor()) {
    return downloadOnCapacitor(blob);
  }

  return downloadOnWeb(blob);
}
