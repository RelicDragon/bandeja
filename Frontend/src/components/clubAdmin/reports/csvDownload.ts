/**
 * Report CSV delivery. The export is fetched as an authenticated blob (`clubAdminBillingApi.
 * exportReportCsv`) and handed to the platform: on native (Capacitor) it is written to the cache
 * directory and opened in the share sheet (save to Files, mail, Drive…); on the web it downloads
 * through an object-URL anchor. Same shape as the recap card / results share delivery.
 */
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isCapacitor } from '@/utils/capacitor';
import { blobToBase64 } from '@/utils/imageBlobResolve';

/** `bandeja-<club>-<dataset>-<from>_<to>.csv`, file-system safe. */
export function reportCsvFileName(clubName: string, dataset: string, from: string, to: string): string {
  const slug =
    clubName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'club';
  return `bandeja-${slug}-${dataset}-${from}_${to}.csv`;
}

/** "The user closed the share sheet" is not a failure. */
export function isShareDismissal(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  if (!e) return false;
  if (e.name === 'AbortError') return true;
  const message = (e.message ?? '').toLowerCase();
  return message.includes('cancel') || message.includes('dismiss');
}

export interface CsvDeliveryDeps {
  native: boolean;
  shareNative: (blob: Blob, fileName: string) => Promise<void>;
  download: (blob: Blob, fileName: string) => void;
}

async function shareNative(blob: Blob, fileName: string): Promise<void> {
  const data = await blobToBase64(blob);
  const directory = Directory.Cache;
  await Filesystem.writeFile({ path: fileName, data, directory });
  const { uri } = await Filesystem.getUri({ path: fileName, directory });
  await Share.share({ url: uri, title: fileName, dialogTitle: fileName });
}

function anchorDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    // Some browsers read the URL after click returns.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

const defaultDeps = (): CsvDeliveryDeps => ({ native: isCapacitor(), shareNative, download: anchorDownload });

/**
 * Delivers a CSV blob. Resolves `'shared' | 'downloaded' | 'dismissed'`; other failures throw.
 */
export async function deliverCsv(
  blob: Blob,
  fileName: string,
  deps: CsvDeliveryDeps = defaultDeps()
): Promise<'shared' | 'downloaded' | 'dismissed'> {
  const csv = blob.type.includes('csv') ? blob : new Blob([blob], { type: 'text/csv;charset=utf-8' });
  if (deps.native) {
    try {
      await deps.shareNative(csv, fileName);
      return 'shared';
    } catch (e) {
      if (isShareDismissal(e)) return 'dismissed';
      throw e;
    }
  }
  deps.download(csv, fileName);
  return 'downloaded';
}
