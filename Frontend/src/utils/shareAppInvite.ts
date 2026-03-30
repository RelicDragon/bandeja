import { Share } from '@capacitor/share';
import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';
import { isCapacitor } from '@/utils/capacitor';
import { getAppInviteUrl } from '@/utils/shareUrl';

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

export async function shareAppInviteLink(t: TFunction): Promise<void> {
  const url = getAppInviteUrl();
  const text = t('invites.shareAppBody', { url });

  if (isCapacitor()) {
    try {
      await Share.share({ url, text });
      return;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('shareAppInviteLink Capacitor:', error);
    }
  }

  if (navigator.share && (window.isSecureContext || location.protocol === 'https:')) {
    try {
      await navigator.share({ url, text });
      return;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('shareAppInviteLink Web Share:', error);
    }
  }

  if (await copyUrlToClipboard(url)) {
    toast.success(t('gameDetails.linkCopied'));
    return;
  }

  toast.error(t('gameDetails.copyError'));
}
