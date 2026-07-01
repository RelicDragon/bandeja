import { Clipboard } from '@capacitor/clipboard';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isAndroid, isCapacitor } from '@/utils/capacitor';
import {
  blobToBase64,
  blobToDataUrl,
  resolvePngBlob,
  type ImageBlobOptions,
} from '@/utils/imageBlobResolve';

const CLIPBOARD_IMAGE_MIME = 'image/png';

export type CopyImageOutcome = 'clipboard' | 'shared';

export type CopyImageOptions = ImageBlobOptions;

function pngShareFile(pngBlob: Blob): File {
  return new File([pngBlob], 'image.png', { type: CLIPBOARD_IMAGE_MIME });
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
