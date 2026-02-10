import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { marketplaceApi } from '@/api/marketplace';
import type { MarketItem } from '@/types';

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
        // Express interest (backend now returns chatId)
        const result = await marketplaceApi.expressInterest(marketItem.id, tradeType);

        // Notify parent that user joined the channel (for in-chat context)
        if (options.onJoinChannel) {
          options.onJoinChannel();
        }

        // Navigate to the PRIVATE chat if needed
        if (options.shouldNavigate !== false) {
          // Force a fresh load by adding a timestamp to state
          // This ensures GameChat reloads context even if navigating to same route
          navigate(`/channel-chat/${result.chatId}`, {
            state: {
              forceReload: Date.now(),
              fromExpressInterest: true
            }
          });
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
