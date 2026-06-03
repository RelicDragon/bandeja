import html2canvas from 'html2canvas';
import { Share } from '@capacitor/share';
import { getShareUrl } from '@/utils/shareUrl';

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
