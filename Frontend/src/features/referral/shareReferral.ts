import { Share } from '@capacitor/share';
import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';
import { isCapacitor } from '@/utils/capacitor';

/**
 * PRD 351 — the share action behind every invite surface.
 *
 * Mobile gets the native share sheet (Capacitor first, then Web Share), web
 * falls back to copying. That order matters: on an installed app
 * `navigator.share` exists but the Capacitor bridge gives the OS sheet the user
 * expects, and `shareAppInvite.ts` already established it for the plain app
 * invite.
 */

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && (window.isSecureContext || location.protocol === 'https:')) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the execCommand path */
    }
  }
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
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

export type ShareReferralResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Shares `url` with `text`, falling back to a clipboard copy.
 *
 * `cancelled` is a distinct result so a caller never shows a "Copied" toast
 * after the user dismissed the OS sheet — that reads as if something happened
 * when nothing did.
 */
export async function shareReferralLink(options: {
  url: string;
  text: string;
  t: TFunction;
  /** Suppress the built-in toasts when the caller renders its own feedback. */
  silent?: boolean;
}): Promise<ShareReferralResult> {
  const { url, text, t, silent } = options;

  if (isCapacitor()) {
    try {
      await Share.share({ url, text });
      return 'shared';
    } catch (error) {
      if ((error as Error).name === 'AbortError') return 'cancelled';
    }
  }

  if (navigator.share && (window.isSecureContext || location.protocol === 'https:')) {
    try {
      await navigator.share({ url, text });
      return 'shared';
    } catch (error) {
      if ((error as Error).name === 'AbortError') return 'cancelled';
    }
  }

  if (await copyTextToClipboard(url)) {
    if (!silent) toast.success(t('referral.copiedLink'));
    return 'copied';
  }

  if (!silent) toast.error(t('referral.copyFailed'));
  return 'failed';
}
