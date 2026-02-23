import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button, Input } from '@/components';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { formatPrice } from '@/utils/currency';
import { marketplaceApi } from '@/api/marketplace';
import { useAuthStore } from '@/store/authStore';
import { socketService } from '@/services/socketService';
import type { MarketItem, MarketItemBid, PriceCurrency } from '@/types';

interface AuctionBidsModalProps {
  isOpen: boolean;
  onClose: () => void;
  marketItem: MarketItem;
  onBidPlaced?: () => void;
}

function bidderName(bid: MarketItemBid): string {
  const b = bid.bidder;
  if (!b) return '—';
  return [b.firstName, b.lastName].filter(Boolean).join(' ') || '—';
}

export const AuctionBidsModal = ({
  isOpen,
  onClose,
  marketItem,
  onBidPlaced,
}: AuctionBidsModalProps) => {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const isOwner = currentUser?.id === marketItem.sellerId;
  const [bidsData, setBidsData] = useState<Awaited<ReturnType<typeof marketplaceApi.getBids>>['data'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [placing, setPlacing] = useState(false);
  const [bidValidationMin, setBidValidationMin] = useState<string | null>(null);
  const [bidApiError, setBidApiError] = useState('');

  const isHolland = marketItem.auctionType === 'HOLLAND';
  const currency = (marketItem.currency || 'EUR') as PriceCurrency;
  const hasWinner = !!marketItem.winnerId;
  const ended = marketItem.auctionEndsAt ? new Date(marketItem.auctionEndsAt) <= new Date() : false;
  const isActive = !hasWinner && !ended && (marketItem.status === 'ACTIVE' || marketItem.status === 'RESERVED');
  const canBid = isActive && !isOwner && !!currentUser;

  const fetchBids = useCallback(async () => {
    if (!marketItem.id) return;
    setLoading(true);
    try {
      const res = await marketplaceApi.getBids(marketItem.id);
      setBidsData(res.data);
    } catch {
      setBidsData(null);
    } finally {
      setLoading(false);
    }
  }, [marketItem.id]);

  useEffect(() => {
    if (isOpen && marketItem.id) fetchBids();
  }, [isOpen, marketItem.id, fetchBids]);

  useEffect(() => {
    if (!isOpen || !marketItem.id) return;
    const onBid = (data: { marketItemId: string }) => {
      if (data.marketItemId === marketItem.id) fetchBids();
    };
    socketService.on('auction:bid', onBid);
    return () => socketService.off('auction:bid', onBid);
  }, [isOpen, marketItem.id, fetchBids]);

  const sortedBids = bidsData?.bids
    ? [...bidsData.bids].sort((a, b) =>
        isHolland ? a.amountCents - b.amountCents : b.amountCents - a.amountCents
      )
    : [];

  const startingCents = marketItem.startingPriceCents ?? marketItem.priceCents ?? 0;
  const minCents = isHolland
    ? (marketItem.currentPriceCents ?? startingCents)
    : (bidsData?.minNextBidCents ?? startingCents);
  const suggested = isHolland ? (marketItem.currentPriceCents ?? startingCents) : minCents;

  const handlePlaceBid = async (e: React.FormEvent) => {
    e.preventDefault();
    setBidValidationMin(null);
    setBidApiError('');
    const cents = Math.round(parseFloat(bidAmount || '0') * 100);
    if (!Number.isFinite(cents) || cents < minCents) {
      setBidValidationMin(formatPrice(minCents, currency));
      return;
    }
    setPlacing(true);
    try {
      await marketplaceApi.placeBid(marketItem.id, cents);
      toast.success(t('marketplace.bidPlaced', { defaultValue: 'Bid placed' }));
      setBidAmount('');
      await fetchBids();
      onBidPlaced?.();
    } catch (err: any) {
      setBidApiError(err.response?.data?.message || t('marketplace.bidFailed', { defaultValue: 'Failed to place bid' }));
    } finally {
      setPlacing(false);
    }
  };

  const hasBidError = bidValidationMin || bidApiError;

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="auction-bids-modal">
      <DialogContent className="max-w-sm max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {t('marketplace.auctionBidsTitle', { defaultValue: 'Auction bids' })}
            {isHolland ? ` (${t('marketplace.auctionHolland', { defaultValue: 'Holland' })})` : ` (${t('marketplace.auctionClassical', { defaultValue: 'Classical' })})`}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col flex-1 min-h-0 p-4 pt-0">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4">{t('common.loading', { defaultValue: 'Loading...' })}</p>
          ) : (
            <>
              {canBid && (
                <div className="rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/30 p-3 mb-3">
                  <p className="text-sm font-medium text-violet-800 dark:text-violet-200">
                    {t('marketplace.minimumToBeat', { defaultValue: 'Minimum to beat' })}: {formatPrice(minCents, currency)}
                  </p>
                  <form onSubmit={handlePlaceBid} noValidate className="mt-2 flex flex-col gap-1">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1 space-y-0.5 min-w-0">
                        <Input
                          type="number"
                          step="0.01"
                          value={bidAmount}
                          onKeyDown={(e) => { if (e.key === 'e' || e.key === 'E') e.preventDefault(); }}
                          onChange={(e) => { setBidAmount(e.target.value); setBidValidationMin(null); setBidApiError(''); }}
                          placeholder={(suggested / 100).toFixed(2)}
                          className={`w-full ${hasBidError ? 'border-red-500 dark:border-red-400 focus-visible:ring-red-500' : ''}`}
                        />
                        {bidValidationMin && (
                          <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 px-0.5">
                            {t('marketplace.bidMinHint', { min: bidValidationMin, defaultValue: 'Min. {{min}}' })}
                          </p>
                        )}
                        {bidApiError && <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 px-0.5">{bidApiError}</p>}
                      </div>
                      <Button type="submit" variant="primary" size="md" disabled={placing} className="shrink-0">
                        {placing ? t('common.loading', { defaultValue: '...' }) : t('marketplace.placeBid', { defaultValue: 'Place bid' })}
                      </Button>
                    </div>
                  </form>
                </div>
              )}
              <div className="overflow-y-auto flex-1 min-h-0 space-y-1">
                {sortedBids.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                    {t('marketplace.noBidsYet', { defaultValue: 'No bids yet' })}
                  </p>
                ) : (
                  sortedBids.map((bid) => (
                    <div
                      key={bid.id}
                      className="flex items-center justify-between gap-2 py-2 px-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {bid.bidder ? (
                          <PlayerAvatar player={bid.bidder} extrasmall fullHideName showName={false} asDiv />
                        ) : null}
                        <span className="text-sm text-gray-800 dark:text-gray-200 truncate">
                          {bidderName(bid)}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-violet-700 dark:text-violet-300 tabular-nums shrink-0">
                        {formatPrice(bid.amountCents, currency)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
