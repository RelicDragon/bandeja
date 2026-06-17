import html2canvas from 'html2canvas';
import { Share } from '@capacitor/share';
import type { GamePhoto } from '@/api/gamePhotos';
import type { Game } from '@/types';
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

export async function exportElementToPngBlob(el: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(el, {
    backgroundColor: '#0f172a',
    scale: Math.min(2, window.devicePixelRatio || 1),
    useCORS: true,
    logging: false,
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to export image'));
    }, 'image/png');
  });
}

export async function shareGameResultsCard(options: {
  cardElement: HTMLElement;
  summaryText?: string | null;
  gameTitle?: string;
}): Promise<void> {
  const blob = await exportElementToPngBlob(options.cardElement);
  const file = new File([blob], 'game-results.png', { type: 'image/png' });
  const url = getShareUrl();
  const text = [options.gameTitle, options.summaryText?.trim(), url].filter(Boolean).join('\n\n');

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text, title: options.gameTitle });
    return;
  }

  try {
    await Share.share({ text, url });
    return;
  } catch {
    /* fall through */
  }

  if (navigator.share) {
    await navigator.share({ text, url });
    return;
  }

  await navigator.clipboard.writeText(text || url);
}
