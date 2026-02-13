import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Gavel, ShoppingCart } from 'lucide-react';
import type { MarketItem, PriceCurrency } from '@/types';
import { marketplaceApi } from '@/api/marketplace';
import { formatPrice } from '@/utils/currency';
import { socketService } from '@/services/socketService';
import { useAuthStore } from '@/store/authStore';
import { PlaceBidModal } from './PlaceBidModal';
import { AuctionBidsModal } from './AuctionBidsModal';

interface AuctionBidSectionProps {
  marketItem: MarketItem;
  userCurrency: PriceCurrency;
  isOwner: boolean;
  onItemUpdate?: (item: MarketItem) => void;
  onCollapse?: () => void;
}

export const AuctionBidSection = ({
  marketItem,
  userCurrency: _userCurrency,
  isOwner,
  onItemUpdate,
  onCollapse,
}: AuctionBidSectionProps) => {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const [bidsData, setBidsData] = useState<{
    currentHighCents: number | null;
    minNextBidCents: number;
    bidCount: number;
    currentHighBidderId: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showBidModal, setShowBidModal] = useState(false);
  const [showBidsModal, setShowBidsModal] = useState(false);
  const [binLoading, setBinLoading] = useState(false);
  const itemIdRef = useRef(marketItem.id);

  const isHolland = marketItem.auctionType === 'HOLLAND';
  const hasWinner = !!marketItem.winnerId;
  const ended = marketItem.auctionEndsAt ? new Date(marketItem.auctionEndsAt) <= new Date() : false;
  const canBid = !isOwner && !hasWinner && !ended && (marketItem.status === 'ACTIVE' || marketItem.status === 'RESERVED');

  const fetchBids = useCallback(async () => {
    try {
      const res = await marketplaceApi.getBids(marketItem.id);
      const d = res.data;
      if (d) {
        setBidsData({
          currentHighCents: d.currentHighCents,
          minNextBidCents: d.minNextBidCents,
          bidCount: d.bidCount,
          currentHighBidderId: d.currentHighBidderId,
        });
      }
    } catch {
      setBidsData(null);
    }
  }, [marketItem.id]);

  useEffect(() => {
    if (!marketItem.tradeTypes?.includes('AUCTION') || hasWinner) return;
    fetchBids();
    socketService.joinMarketItemRoom(marketItem.id);
    const onBid = (data: { marketItemId: string; newHighCents: number; bidCount: number; winnerId?: string }) => {
      if (data.marketItemId !== marketItem.id) return;
      if (data.winnerId) {
        onItemUpdate?.({ ...marketItem, winnerId: data.winnerId, status: 'SOLD' });
      }
      setBidsData((prev) =>
        prev
          ? { ...prev, currentHighCents: data.newHighCents, bidCount: data.bidCount }
          : { currentHighCents: data.newHighCents, minNextBidCents: data.newHighCents, bidCount: data.bidCount, currentHighBidderId: null }
      );
    };
    const onBin = (data: { marketItemId: string; winnerId: string }) => {
      if (data.marketItemId !== marketItem.id) return;
      onItemUpdate?.({ ...marketItem, winnerId: data.winnerId, status: 'SOLD' });
    };
    socketService.on('auction:bid', onBid);
    socketService.on('auction:bin-accepted', onBin);
    return () => {
      socketService.off('auction:bid', onBid);
      socketService.off('auction:bin-accepted', onBin);
      socketService.leaveMarketItemRoom(marketItem.id);
    };
  }, [marketItem.id, marketItem, hasWinner, fetchBids, onItemUpdate]);

  useEffect(() => {
    if (marketItem.id !== itemIdRef.current) {
      itemIdRef.current = marketItem.id;
      setBidsData(null);
    }
  }, [marketItem.id]);

  const handlePlaceBid = async (amountCents: number) => {
    setLoading(true);
    try {
      await marketplaceApi.placeBid(marketItem.id, amountCents);
      toast.success(t('marketplace.bidPlaced', { defaultValue: 'Bid placed' }));
      await fetchBids();
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptBIN = async () => {
    setBinLoading(true);
    try {
      await marketplaceApi.acceptBuyItNow(marketItem.id);
      toast.success(t('marketplace.purchaseConfirmed', { defaultValue: 'Purchase confirmed' }));
      onItemUpdate?.({ ...marketItem, winnerId: undefined, status: 'SOLD' });
      onCollapse?.();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('marketplace.binFailed', { defaultValue: 'Failed to buy' }));
    } finally {
      setBinLoading(false);
    }
  };

  const currency = (marketItem.currency || 'EUR') as PriceCurrency;
  const currentDisplayCents = isHolland
    ? (marketItem.currentPriceCents ?? bidsData?.currentHighCents ?? marketItem.startingPriceCents ?? marketItem.priceCents)
    : (bidsData?.currentHighCents ?? marketItem.startingPriceCents ?? marketItem.priceCents);
  const minNext = bidsData?.minNextBidCents ?? marketItem.startingPriceCents ?? marketItem.priceCents ?? 0;
  const isLeading = canBid && bidsData?.currentHighBidderId && currentUser?.id === bidsData.currentHighBidderId;

  return (
    <>
      <div className="space-y-2 rounded-lg p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/30">
        {isHolland ? (
          <>
            <p className="text-sm font-medium text-violet-800 dark:text-violet-200">
              {t('marketplace.currentPrice', { defaultValue: 'Current price' })}: {currentDisplayCents != null ? formatPrice(currentDisplayCents, currency) : '—'}
            </p>
            {(bidsData?.bidCount ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => setShowBidsModal(true)}
                className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
              >
                {bidsData!.bidCount} {t('marketplace.bids', { defaultValue: 'bid(s)' })}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowBidsModal(true)}
                className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
              >
                {t('marketplace.viewBids', { defaultValue: 'View bids' })}
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-violet-800 dark:text-violet-200">
              {bidsData?.currentHighCents != null
                ? t('marketplace.currentBid', { defaultValue: 'Current bid' }) + ': ' + formatPrice(bidsData.currentHighCents, currency)
                : t('marketplace.startingPrice', { defaultValue: 'Starting price' }) + ': ' + formatPrice(marketItem.startingPriceCents ?? marketItem.priceCents ?? 0, currency)}
            </p>
            {bidsData && bidsData.bidCount > 0 && (
              <button
                type="button"
                onClick={() => setShowBidsModal(true)}
                className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
              >
                {bidsData.bidCount} {t('marketplace.bids', { defaultValue: 'bid(s)' })}
              </button>
            )}
            {(bidsData?.bidCount === 0 || (!bidsData && marketItem.tradeTypes?.includes('AUCTION'))) && (
              <button
                type="button"
                onClick={() => setShowBidsModal(true)}
                className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
              >
                {t('marketplace.viewBids', { defaultValue: 'View bids' })}
              </button>
            )}
            {canBid && isLeading && (
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {t('marketplace.youAreLeading', { defaultValue: 'You are the highest bidder' })}
              </p>
            )}
            {ended && !hasWinner && (marketItem.reservePriceCents ?? 0) > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t('marketplace.reserveNotMet', { defaultValue: 'Reserve not met — auction ended without sale.' })}
              </p>
            )}
          </>
        )}
        {canBid && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowBidModal(true)}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-500 text-white rounded-lg hover:bg-violet-600 font-medium text-sm disabled:opacity-50"
            >
              <Gavel size={16} />
              {isHolland ? t('marketplace.buyAtCurrentPrice', { defaultValue: 'Buy at current price' }) : t('marketplace.placeBid', { defaultValue: 'Place a bid' })}
            </button>
            {marketItem.buyItNowPriceCents != null && marketItem.buyItNowPriceCents > 0 && (
              <button
                type="button"
                onClick={handleAcceptBIN}
                disabled={binLoading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 font-medium text-sm disabled:opacity-50"
              >
                <ShoppingCart size={16} />
                {t('marketplace.buyNow', { defaultValue: 'Buy now' })} {formatPrice(marketItem.buyItNowPriceCents, currency)}
              </button>
            )}
          </div>
        )}
      </div>
      <PlaceBidModal
        isOpen={showBidModal}
        onClose={() => setShowBidModal(false)}
        minCents={minNext}
        currency={currency}
        isHolland={!!isHolland}
        currentPriceCents={marketItem.currentPriceCents}
        onPlace={handlePlaceBid}
      />
      <AuctionBidsModal
        isOpen={showBidsModal}
        onClose={() => setShowBidsModal(false)}
        marketItem={marketItem}
        onBidPlaced={fetchBids}
      />
    </>
  );
};

