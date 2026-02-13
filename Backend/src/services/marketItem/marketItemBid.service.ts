import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { AuctionType, MarketItemStatus, MarketItemTradeType } from '@prisma/client';
import { USER_SELECT_FIELDS } from '../../utils/constants';

const MIN_BID_INCREMENT_CENTS = 50;
const BID_INCREMENT_PERCENT = 0.01;

export class MarketItemBidService {
  static minNextBidCents(currentHighCents: number): number {
    const increment = Math.max(MIN_BID_INCREMENT_CENTS, Math.ceil(currentHighCents * BID_INCREMENT_PERCENT));
    return currentHighCents + increment;
  }

  static async getCurrentHighBid(marketItemId: string): Promise<{ amountCents: number; bidderId: string; bidId: string } | null> {
    const bid = await prisma.marketItemBid.findFirst({
      where: { marketItemId, outbidAt: null },
      orderBy: { amountCents: 'desc' },
      take: 1,
      include: { bidder: { select: { id: true } } },
    });
    if (!bid) return null;
    return { amountCents: bid.amountCents, bidderId: bid.bidderId, bidId: bid.id };
  }

  static async getBids(marketItemId: string, _userId?: string) {
    const item = await prisma.marketItem.findUnique({
      where: { id: marketItemId },
      select: {
        id: true,
        sellerId: true,
        tradeTypes: true,
        auctionType: true,
        startingPriceCents: true,
        priceCents: true,
        currentPriceCents: true,
      },
    });
    if (!item) throw new ApiError(404, 'Item not found');
    if (!item.tradeTypes.includes(MarketItemTradeType.AUCTION)) {
      throw new ApiError(400, 'This item is not an auction');
    }

    const bids = await prisma.marketItemBid.findMany({
      where: { marketItemId },
      orderBy: { createdAt: 'desc' },
      include: { bidder: { select: { ...USER_SELECT_FIELDS } } },
    });

    const high = await this.getCurrentHighBid(marketItemId);
    const startingCents = item.startingPriceCents ?? item.priceCents ?? 0;
    const minNext = high ? this.minNextBidCents(high.amountCents) : startingCents;

    return {
      bids,
      currentHighCents: high?.amountCents ?? null,
      currentHighBidderId: high?.bidderId ?? null,
      minNextBidCents: minNext,
      bidCount: bids.length,
    };
  }

  static async placeBid(marketItemId: string, bidderId: string, amountCents: number) {
    const item = await prisma.marketItem.findUnique({
      where: { id: marketItemId },
      select: {
        id: true,
        sellerId: true,
        status: true,
        tradeTypes: true,
        auctionType: true,
        auctionEndsAt: true,
        startingPriceCents: true,
        priceCents: true,
        currentPriceCents: true,
        reservePriceCents: true,
        winnerId: true,
      },
    });

    if (!item) throw new ApiError(404, 'Item not found');
    if (item.sellerId === bidderId) throw new ApiError(400, 'Cannot bid on your own listing');
    if (!item.tradeTypes.includes(MarketItemTradeType.AUCTION)) {
      throw new ApiError(400, 'This item is not an auction');
    }
    if (item.status !== MarketItemStatus.ACTIVE) {
      throw new ApiError(400, 'Auction is not active');
    }
    if (item.winnerId) throw new ApiError(400, 'Auction already has a winner');
    if (item.auctionEndsAt && new Date(item.auctionEndsAt) <= new Date()) {
      throw new ApiError(400, 'Auction has ended');
    }

    const auctionType = item.auctionType ?? AuctionType.RISING;
    const startingCents = item.startingPriceCents ?? item.priceCents ?? 0;

    if (auctionType === AuctionType.HOLLAND) {
      const currentCents = item.currentPriceCents ?? startingCents;
      if (amountCents < currentCents) {
        throw new ApiError(400, `Bid must be at least current price (${currentCents} cents)`);
      }
      const reserveCents = item.reservePriceCents ?? null;
      if (reserveCents != null && amountCents < reserveCents) {
        throw new ApiError(400, `Bid must meet or exceed the reserve price (${reserveCents} cents)`);
      }
    } else {
      const high = await this.getCurrentHighBid(marketItemId);
      const minNext = high ? this.minNextBidCents(high.amountCents) : startingCents;
      if (amountCents < startingCents) {
        throw new ApiError(400, 'Bid must be at least the starting price');
      }
      if (amountCents < minNext) {
        throw new ApiError(400, `Minimum next bid is ${minNext} cents`);
      }
    }

    return prisma.$transaction(async (tx) => {
      const previousHigh = await this.getCurrentHighBid(marketItemId);

      if (previousHigh && previousHigh.bidderId === bidderId) {
        throw new ApiError(400, 'You already have the highest bid');
      }

      if (previousHigh) {
        await tx.marketItemBid.update({
          where: { id: previousHigh.bidId },
          data: { outbidAt: new Date() },
        });
      }

      const bid = await tx.marketItemBid.create({
        data: { marketItemId, bidderId, amountCents },
        include: { bidder: { select: { ...USER_SELECT_FIELDS } } },
      });

      if (auctionType === AuctionType.HOLLAND) {
        await tx.marketItem.update({
          where: { id: marketItemId },
          data: { winnerId: bidderId, status: MarketItemStatus.SOLD },
        });
      }

      return {
        bid,
        previousHighBidderId: previousHigh?.bidderId ?? null,
        auctionType,
        isHollandWin: auctionType === AuctionType.HOLLAND,
      };
    });
  }

  static async acceptBuyItNow(marketItemId: string, userId: string) {
    const item = await prisma.marketItem.findUnique({
      where: { id: marketItemId },
      select: {
        id: true,
        sellerId: true,
        status: true,
        tradeTypes: true,
        buyItNowPriceCents: true,
        winnerId: true,
        auctionEndsAt: true,
      },
    });

    if (!item) throw new ApiError(404, 'Item not found');
    if (item.sellerId === userId) throw new ApiError(400, 'Cannot buy your own listing');
    if (item.status !== MarketItemStatus.ACTIVE) throw new ApiError(400, 'Item is not available');
    if (item.winnerId) throw new ApiError(400, 'Item already sold');
    const buyItNowCents = item.buyItNowPriceCents ?? null;
    if (buyItNowCents == null || buyItNowCents < 0) {
      throw new ApiError(400, 'Buy it now is not available for this item');
    }

    await prisma.marketItem.update({
      where: { id: marketItemId },
      data: { winnerId: userId, status: MarketItemStatus.SOLD },
    });

    return { success: true, amountCents: buyItNowCents };
  }

  static async resolveEndedAuctions() {
    const now = new Date();
    const items = await prisma.marketItem.findMany({
      where: {
        status: MarketItemStatus.ACTIVE,
        tradeTypes: { has: MarketItemTradeType.AUCTION },
        auctionEndsAt: { lte: now },
        winnerId: null,
      },
      select: { id: true, auctionType: true, reservePriceCents: true },
    });

    for (const item of items) {
      const high = await this.getCurrentHighBid(item.id);
      if (item.auctionType === AuctionType.HOLLAND) {
        if (!high) continue;
      }
      if (high) {
        const reserveCents = item.reservePriceCents ?? null;
        if (reserveCents != null && high.amountCents < reserveCents) {
          continue;
        }
        await prisma.marketItem.update({
          where: { id: item.id },
          data: { winnerId: high.bidderId, status: MarketItemStatus.SOLD },
        });
      }
    }
    return items.length;
  }

  static async tickHollandPrices() {
    const now = new Date();
    const items = await prisma.marketItem.findMany({
      where: {
        status: MarketItemStatus.ACTIVE,
        tradeTypes: { has: MarketItemTradeType.AUCTION },
        auctionType: AuctionType.HOLLAND,
        auctionEndsAt: { gt: now },
        winnerId: null,
        hollandDecrementCents: { not: null },
        hollandIntervalMinutes: { not: null },
      },
      select: {
        id: true,
        currentPriceCents: true,
        startingPriceCents: true,
        priceCents: true,
        hollandDecrementCents: true,
        hollandIntervalMinutes: true,
      },
    });

    let updated = 0;
    for (const item of items) {
      const start = item.startingPriceCents ?? item.priceCents ?? 0;
      const current = item.currentPriceCents ?? start;
      const dec = item.hollandDecrementCents ?? 0;
      if (dec <= 0 || current <= 0) continue;

      const nextPrice = Math.max(0, current - dec);
      await prisma.marketItem.update({
        where: { id: item.id },
        data: { currentPriceCents: nextPrice },
      });
      updated++;
    }
    return updated;
  }
}
