import html2canvas from 'html2canvas';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { GamePhoto } from '@/api/gamePhotos';
import type { Game } from '@/types';
import { isCapacitor } from '@/utils/capacitor';
import { blobToBase64, blobToDataUrl } from '@/utils/imageBlobResolve';
import { gamePhotoOriginalUrl } from '@/utils/gamePhotoUrl';
import { getGameMainPhotoId } from '@/utils/gameMainPhoto';
import { getShareUrl } from '@/utils/shareUrl';

type ShareCardGame = Pick<Game, 'mainPhotoId' | 'mainPhoto'>;

export function resolveGameResultsSharePhotoUrl(
  game: ShareCardGame,
  photos: GamePhoto[] = []
): string | null {
  const mainPhotoId = getGameMainPhotoId(game);
  const fromStore = photos.find((p) => p.id === mainPhotoId) ?? photos[0];
  if (fromStore) {
    const url = gamePhotoOriginalUrl(fromStore);
    if (url) return url;
  }
  if (game.mainPhoto) {
    const url = gamePhotoOriginalUrl(game.mainPhoto);
    if (url) return url;
  }
  return null;
}

export function canShowGameResultsShareCard(
  game: ShareCardGame,
  photos: GamePhoto[] = []
): boolean {
  return resolveGameResultsSharePhotoUrl(game, photos) !== null;
}

export function isShareDismissal(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  if (!e) return false;
  if (e.name === 'AbortError') return true;
  const msg = (e.message ?? '').toLowerCase();
  return msg.includes('cancel') || msg.includes('dismiss');
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
  return blobToDataUrl(await response.blob());
}

function imgElementToDataUrl(img: HTMLImageElement): string | null {
  if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** Resolve card images to data URLs so html2canvas is not blocked by CORS. */
export async function resolveCardImageDataUrls(el: HTMLElement): Promise<(string | null)[]> {
  const imgs = Array.from(el.querySelectorAll('img'));
  return Promise.all(
    imgs.map(async (img) => {
      const src = img.currentSrc || img.src;
      if (!src) return null;
      if (src.startsWith('data:')) return src;
      try {
        return await fetchAsDataUrl(src);
      } catch {
        return imgElementToDataUrl(img);
      }
    })
  );
}

export async function exportElementToPngBlob(el: HTMLElement): Promise<Blob> {
  const dataUrls = await resolveCardImageDataUrls(el);
  const canvas = await html2canvas(el, {
    backgroundColor: '#0f172a',
    scale: Math.min(2, window.devicePixelRatio || 1),
    useCORS: true,
    logging: false,
    onclone: (_doc, cloned) => {
      cloned.querySelectorAll('img').forEach((img, index) => {
        const dataUrl = dataUrls[index];
        if (dataUrl) {
          img.removeAttribute('crossorigin');
          img.src = dataUrl;
          return;
        }
        // Drop unresolved remote images so html2canvas cannot taint/fail the canvas.
        img.remove();
      });
    },
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to export image'));
    }, 'image/png');
  });
}

function resultsShareFile(blob: Blob): File {
  return new File([blob], 'game-results.png', { type: 'image/png' });
}

function buildShareText(options: {
  summaryText?: string | null;
  gameTitle?: string;
}): string {
  const url = getShareUrl();
  return [options.gameTitle, options.summaryText?.trim(), url].filter(Boolean).join('\n\n');
}

async function sharePngViaFilesystem(blob: Blob, text: string, title?: string): Promise<void> {
  const base64 = await blobToBase64(blob);
  const fileName = `game-results-${Date.now()}.png`;
  const directory = Directory.Cache;
  await Filesystem.writeFile({ path: fileName, data: base64, directory });
  const { uri } = await Filesystem.getUri({ path: fileName, directory });
  await Share.share({ url: uri, text, title });
}

async function downloadPng(blob: Blob): Promise<void> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'game-results.png';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function tryWebShareFiles(file: File, text: string, title?: string): Promise<boolean> {
  if (!navigator.canShare?.({ files: [file] })) return false;
  await navigator.share({ files: [file], text, title });
  return true;
}

export async function shareGameResultsCard(options: {
  cardElement: HTMLElement;
  summaryText?: string | null;
  gameTitle?: string;
}): Promise<void> {
  const blob = await exportElementToPngBlob(options.cardElement);
  const file = resultsShareFile(blob);
  const text = buildShareText(options);
  const title = options.gameTitle;

  if (isCapacitor()) {
    try {
      if (await tryWebShareFiles(file, text, title)) return;
    } catch (err: unknown) {
      if (isShareDismissal(err)) throw err;
    }
    await sharePngViaFilesystem(blob, text, title);
    return;
  }

  try {
    if (await tryWebShareFiles(file, text, title)) return;
  } catch (err: unknown) {
    if (isShareDismissal(err)) throw err;
  }

  // Prefer delivering the PNG card over text-only Web Share.
  await downloadPng(blob);
}
