import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { marketplaceApi } from '@/api/marketplace';
import type { MarketItem } from '@/types';

export const useMarketItemReserve = (
  marketItem: MarketItem,
  onUpdate?: (item: MarketItem) => void
) => {
  const { t } = useTranslation();
  const [isReserving, setIsReserving] = useState(false);

  const isReserved = marketItem.status === 'RESERVED';

  const handleReserveToggle = async () => {
    setIsReserving(true);
    try {
      const response = await marketplaceApi.reserveMarketItem(marketItem.id, !isReserved);
      const successMessage = !isReserved
        ? t('marketplace.reserved', { defaultValue: 'Listing reserved' })
        : t('marketplace.unreserved', { defaultValue: 'Listing unreserved' });
      toast.success(successMessage);
      if (response.data) {
        onUpdate?.(response.data);
      }
    } catch (error) {
      console.error('Failed to update reserve status:', error);
      const errorMessage = !isReserved
        ? t('marketplace.reserveFailed', { defaultValue: 'Failed to reserve listing' })
        : t('marketplace.unreserveFailed', { defaultValue: 'Failed to unreserve listing' });
      toast.error(errorMessage);
    } finally {
      setIsReserving(false);
    }
  };

  return {
    handleReserveToggle,
    isReserving,
    isReserved,
  };
};
