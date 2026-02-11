import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { marketplaceApi } from '@/api/marketplace';
import type { MarketItem } from '@/types';
import { buildUrl } from '@/utils/urlSchema';

interface UseMarketItemExpressInterestOptions {
  onJoinChannel?: () => void;
  shouldNavigate?: boolean;
}

export const useMarketItemExpressInterest = (
  marketItem: MarketItem,
  options: UseMarketItemExpressInterestOptions = {}
) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [expressingInterest, setExpressingInterest] = useState<string | null>(null);

  const handleExpressInterest = useCallback(
    async (tradeType: 'BUY_IT_NOW' | 'SUGGESTED_PRICE' | 'AUCTION') => {
      setExpressingInterest(tradeType);

      try {
        const result = await marketplaceApi.expressInterest(marketItem.id, tradeType);

        if (options.onJoinChannel) {
          options.onJoinChannel();
        }

        if (options.shouldNavigate !== false) {
          navigate(buildUrl('channelChat', { id: result.chatId }));
        }
      } catch (error) {
        console.error('Failed to express interest:', error);
        toast.error(
          t('marketplace.expressInterestFailed', {
            defaultValue: 'Failed to send message'
          })
        );
      } finally {
        setExpressingInterest(null);
      }
    },
    [marketItem, navigate, options, t]
  );

  return {
    handleExpressInterest,
    expressingInterest,
  };
};
