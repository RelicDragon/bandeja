import type { TFunction } from 'i18next';
import toast from 'react-hot-toast';
import type { Sport } from '@shared/sport';
import { getPublicWebBaseUrl } from '@/utils/shareUrl';
import { appendLevelSportQuery } from '@/utils/levelSportQuery';

export function getPlayerProfileShareUrl(playerId: string, sport?: Sport): string {
  const base = `${getPublicWebBaseUrl()}/user-profile/${encodeURIComponent(playerId)}`;
  return appendLevelSportQuery(base, sport);
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
  sport?: Sport;
  t: TFunction;
  onFallbackModal: (url: string) => void;
}): Promise<void> {
  const { playerId, sport, t, onFallbackModal } = options;
  const shareUrl = getPlayerProfileShareUrl(playerId, sport);

  if (await copyUrlToClipboard(shareUrl)) {
    toast.success(t('gameDetails.linkCopied'));
    return;
  }

  onFallbackModal(shareUrl);
}
