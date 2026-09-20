import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isCapacitor } from '@/utils/capacitor';
import { blobToBase64 } from '@/utils/imageBlobResolve';

/**
 * PRD 353 — "Save image".
 *
 * The card itself is rendered by the backend's `recap-card` template, so this
 * only has to deliver the PNG: the native share sheet on mobile, a download on
 * web — the same three-step fallback the results share card uses (Web Share
 * with files → Capacitor Filesystem + Share → anchor download).
 */

/**
 * "The user tapped cancel" is not a failure and must not raise a toast.
 * Deliberately a local copy of the results-share predicate: importing that
 * module would pull `html2canvas` into the Home bundle, and the recap card is
 * rendered on the server.
 */
export function isRecapShareDismissal(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  if (!e) return false;
  if (e.name === 'AbortError') return true;
  const message = (e.message ?? '').toLowerCase();
  return message.includes('cancel') || message.includes('dismiss');
}

export function recapImageFileName(monthKey: string): string {
  return `bandeja-recap-${monthKey}.png`;
}

async function shareViaFilesystem(blob: Blob, fileName: string, text: string): Promise<void> {
  const base64 = await blobToBase64(blob);
  const directory = Directory.Cache;
  await Filesystem.writeFile({ path: fileName, data: base64, directory });
  const { uri } = await Filesystem.getUri({ path: fileName, directory });
  await Share.share({ url: uri, text });
}

function download(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function tryWebShareFile(file: File, text: string): Promise<boolean> {
  if (!navigator.canShare?.({ files: [file] })) return false;
  await navigator.share({ files: [file], text });
  return true;
}

/**
 * Fetches the rendered card and hands it to the platform.
 * Throws the platform's dismissal error untouched so callers can tell "the user
 * changed their mind" from "this failed".
 */
export async function deliverRecapCard(options: {
  imageUrl: string;
  monthKey: string;
  shareText: string;
}): Promise<void> {
  const response = await fetch(options.imageUrl, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`recap card fetch failed: ${response.status}`);
  const blob = await response.blob();
  const fileName = recapImageFileName(options.monthKey);
  const file = new File([blob], fileName, { type: 'image/png' });

  try {
    if (await tryWebShareFile(file, options.shareText)) return;
  } catch (err: unknown) {
    if (isRecapShareDismissal(err)) throw err;
  }

  if (isCapacitor()) {
    await shareViaFilesystem(blob, fileName, options.shareText);
    return;
  }

  download(blob, fileName);
}
