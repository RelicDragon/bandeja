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
  const [validationMin, setValidationMin] = useState<string | null>(null);
  const [apiError, setApiError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationMin(null);
    setApiError('');
    const cents = Math.round(parseFloat(amount || '0') * 100);
    if (cents < minCents) {
      setValidationMin(formatPrice(minCents, currency));
      return;
    }
    setLoading(true);
    try {
      await onPlace(cents);
      setAmount('');
      onClose();
    } catch (err: any) {
      setApiError(err.response?.data?.message || t('marketplace.bidFailed', { defaultValue: 'Failed to place bid' }));
    } finally {
      setLoading(false);
    }
  };

  const hasError = validationMin || apiError;

  const suggested = isHolland ? (currentPriceCents ?? minCents) : minCents;

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('marketplace.placeBid', { defaultValue: 'Place a bid' })}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="space-y-3 p-4">
          {isHolland ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('marketplace.hollandBidHint', { defaultValue: 'Current price' })}: {formatPrice(suggested, currency)}
            </p>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('marketplace.minBid', { defaultValue: 'Minimum bid' })}: {formatPrice(minCents, currency)}
            </p>
          )}
          <div className="space-y-0.5">
            <Input
              type="number"
              step="0.01"
              value={amount}
              onKeyDown={(e) => { if (e.key === 'e' || e.key === 'E') e.preventDefault(); }}
              onChange={(e) => { setAmount(e.target.value); setValidationMin(null); setApiError(''); }}
              placeholder={(suggested / 100).toFixed(2)}
              className={`w-full ${hasError ? 'border-red-500 dark:border-red-400 focus-visible:ring-red-500' : ''}`}
            />
            {validationMin && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 px-0.5">
                {t('marketplace.bidMinHint', { min: validationMin, defaultValue: 'Min. {{min}}' })}
              </p>
            )}
            {apiError && <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 px-0.5">{apiError}</p>}
          </div>
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
