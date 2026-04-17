import { Share } from '@capacitor/share';
import type { TFunction } from 'i18next';
import toast from 'react-hot-toast';
import { isCapacitor } from '@/utils/capacitor';
import { getPublicWebBaseUrl } from '@/utils/shareUrl';

export function getPlayerProfileShareUrl(playerId: string): string {
  return `${getPublicWebBaseUrl()}/user-profile/${encodeURIComponent(playerId)}`;
}

async function copyUrlToClipboard(url: string): Promise<boolean> {
  if (navigator.clipboard && (window.isSecureContext || location.protocol === 'https:')) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }
  try {
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textArea);
    return ok;
  } catch {
    return false;
  }
}

export async function sharePlayerProfile(options: {
  playerId: string;
  displayName: string;
  t: TFunction;
  onFallbackModal: (url: string) => void;
}): Promise<void> {
  const { playerId, displayName, t, onFallbackModal } = options;
  const shareUrl = getPlayerProfileShareUrl(playerId);
  const text = t('playerCard.shareProfileMessage', { name: displayName });
  const title = t('playerCard.shareProfileTitle');

  if (isCapacitor()) {
    try {
      await Share.share({ url: shareUrl, text, title });
      return;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('sharePlayerProfile Capacitor:', error);
    }
  }

  if (navigator.share && (window.isSecureContext || location.protocol === 'https:')) {
    try {
      await navigator.share({ url: shareUrl, text, title });
      return;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('sharePlayerProfile Web Share:', error);
    }
  }

  if (await copyUrlToClipboard(shareUrl)) {
    toast.success(t('gameDetails.linkCopied'));
    return;
  }

  onFallbackModal(shareUrl);
}
