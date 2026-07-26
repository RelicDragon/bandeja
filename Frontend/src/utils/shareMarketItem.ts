import { Share } from '@capacitor/share';
import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';
import { isCapacitor } from '@/utils/capacitor';
import { getMarketItemShareUrl } from '@/utils/shareUrl';

export async function shareMarketItem(options: {
  itemId: string;
  t: TFunction;
  onFallbackModal: (url: string) => void;
}): Promise<void> {
  const { itemId, t, onFallbackModal } = options;
  const shareUrl = getMarketItemShareUrl(itemId);

  if (isCapacitor()) {
    try {
      await Share.share({ url: shareUrl });
      return;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Error sharing market item:', error);
    }
  }

  if (navigator.share && (window.isSecureContext || location.protocol === 'https:')) {
    try {
      await navigator.share({ url: shareUrl });
      return;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Error sharing market item:', error);
    }
  }

  if (navigator.clipboard && (window.isSecureContext || location.protocol === 'https:')) {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t('gameDetails.linkCopied'));
      return;
    } catch (error) {
      console.error('Error copying market item link:', error);
    }
  }

  onFallbackModal(shareUrl);
}
