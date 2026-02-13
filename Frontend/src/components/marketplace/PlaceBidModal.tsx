import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '@/components';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { formatPrice } from '@/utils/currency';
import type { PriceCurrency } from '@/types';

interface PlaceBidModalProps {
  isOpen: boolean;
  onClose: () => void;
  minCents: number;
  currency: PriceCurrency;
  isHolland: boolean;
  currentPriceCents?: number | null;
  onPlace: (amountCents: number) => Promise<void>;
}

export const PlaceBidModal = ({
  isOpen,
  onClose,
  minCents,
  currency,
  isHolland,
  currentPriceCents,
  onPlace,
}: PlaceBidModalProps) => {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cents = Math.round(parseFloat(amount || '0') * 100);
    if (cents < minCents) {
      setError(t('marketplace.bidTooLow', { defaultValue: 'Bid must be at least the minimum' }));
      return;
    }
    setLoading(true);
    try {
      await onPlace(cents);
      setAmount('');
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || t('marketplace.bidFailed', { defaultValue: 'Failed to place bid' }));
    } finally {
      setLoading(false);
    }
  };

  const suggested = isHolland ? (currentPriceCents ?? minCents) : minCents;

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('marketplace.placeBid', { defaultValue: 'Place a bid' })}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 p-4">
          {isHolland ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('marketplace.hollandBidHint', { defaultValue: 'Current price' })}: {formatPrice(suggested, currency)}
            </p>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('marketplace.minBid', { defaultValue: 'Minimum bid' })}: {formatPrice(minCents, currency)}
            </p>
          )}
          <Input
            type="number"
            step="0.01"
            min={minCents / 100}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={(suggested / 100).toFixed(2)}
            className="w-full"
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={loading}>
              {loading ? t('common.loading', { defaultValue: 'Loading...' }) : t('marketplace.placeBid', { defaultValue: 'Place bid' })}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
