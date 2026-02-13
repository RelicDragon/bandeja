import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  AuctionType,
  ChatContextType,
  ChatType,
  MarketItemStatus,
  MarketItemTradeType,
  ParticipantRole,
  PriceCurrency,
} from '@prisma/client';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { MessageService } from '../chat/message.service';
import { t } from '../../utils/translations';
import notificationService from '../notification.service';

export interface CreateMarketItemData {
  sellerId: string;
  categoryId: string;
  cityId: string;
  additionalCityIds?: string[];
  title: string;
  description?: string;
  mediaUrls?: string[];
  tradeTypes: MarketItemTradeType[];
  priceCents?: number;
  currency?: PriceCurrency;
  auctionEndsAt?: Date;
  auctionType?: AuctionType;
  startingPriceCents?: number;
  reservePriceCents?: number;
  buyItNowPriceCents?: number;
  hollandDecrementCents?: number;
  hollandIntervalMinutes?: number;
  negotiationAcceptable?: boolean;
}

export interface MarketItemFilters {
  cityId?: string;
  categoryId?: string;
  tradeType?: MarketItemTradeType;
  status?: MarketItemStatus;
  sellerId?: string;
  userId?: string;
  page?: number;
  limit?: number;
}

export class MarketItemService {
  static async createMarketItem(data: CreateMarketItemData) {
    const {
      sellerId,
      categoryId,
      cityId,
      additionalCityIds = [],
      title,
      description,
      mediaUrls = [],
      tradeTypes,
      priceCents,
      currency = 'EUR',
      auctionEndsAt,
      auctionType,
      startingPriceCents,
      reservePriceCents,
      buyItNowPriceCents,
      hollandDecrementCents,
      hollandIntervalMinutes,
      negotiationAcceptable,
    } = data;

    if (!title?.trim()) {
      throw new ApiError(400, 'Title is required');
    }
    if (!categoryId) {
      throw new ApiError(400, 'Category is required');
    }
    if (!cityId) {
      throw new ApiError(400, 'City is required');
    }
    if (!Array.isArray(tradeTypes) || tradeTypes.length !== 1) {
      throw new ApiError(400, 'Exactly one trade type must be selected');
    }
    const invalid = tradeTypes.filter((t) => !Object.values(MarketItemTradeType).includes(t));
    if (invalid.length > 0) {
      throw new ApiError(400, 'Invalid trade type');
    }

    if (tradeTypes.includes(MarketItemTradeType.FREE)) {
      if (priceCents != null && priceCents > 0) {
        throw new ApiError(400, 'FREE items cannot have a price');
      }
    } else {
      // Non-FREE items validation
      if (tradeTypes.includes(MarketItemTradeType.BUY_IT_NOW) && (priceCents == null || priceCents < 0)) {
        throw new ApiError(400, 'Price is required for Buy it now');
      }
      if (tradeTypes.includes(MarketItemTradeType.AUCTION)) {
        const startPrice = startingPriceCents ?? priceCents;
        if (startPrice == null || startPrice < 0) {
          throw new ApiError(400, 'Starting bid is required for Auction');
        }
        if (!auctionEndsAt) {
          throw new ApiError(400, 'Auction end date is required');
        }
        if (new Date(auctionEndsAt) <= new Date()) {
          throw new ApiError(400, 'Auction end date must be in the future');
        }
        if (reservePriceCents != null && (reservePriceCents < startPrice || (buyItNowPriceCents != null && reservePriceCents > buyItNowPriceCents))) {
          throw new ApiError(400, 'Reserve price must be between starting price and buy it now price (if set)');
        }
        if (buyItNowPriceCents != null && buyItNowPriceCents < startPrice) {
          throw new ApiError(400, 'Buy it now price must be at least the starting price');
        }
      }
    }

    const category = await prisma.marketItemCategory.findFirst({
      where: { id: categoryId, isActive: true },
    });
    if (!category) {
      throw new ApiError(400, 'Category not found');
    }

    const city = await prisma.city.findUnique({
      where: { id: cityId },
    });
    if (!city) {
      throw new ApiError(400, 'City not found');
    }

    // Validate additional cities
    if (additionalCityIds && additionalCityIds.length > 0) {
      // Ensure primary city not in additional cities
      if (additionalCityIds.includes(cityId)) {
        throw new ApiError(400, 'Primary city cannot be in additional cities list');
      }

      // Validate all additional city IDs exist
      const additionalCities = await prisma.city.findMany({
        where: { id: { in: additionalCityIds } },
        select: { id: true },
      });

      if (additionalCities.length !== additionalCityIds.length) {
        throw new ApiError(400, 'One or more additional cities not found');
      }

      // Check for duplicates
      const uniqueCities = new Set(additionalCityIds);
      if (uniqueCities.size !== additionalCityIds.length) {
        throw new ApiError(400, 'Duplicate cities in additional cities list');
      }
    }

    const startPrice = tradeTypes.includes(MarketItemTradeType.AUCTION)
      ? (startingPriceCents ?? priceCents ?? null)
      : (priceCents ?? null);
    const isHolland = tradeTypes.includes(MarketItemTradeType.AUCTION) && auctionType === AuctionType.HOLLAND;

    return prisma.$transaction(async (tx) => {
      const item = await tx.marketItem.create({
        data: {
          sellerId,
          categoryId,
          cityId,
          additionalCityIds: additionalCityIds || [],
          title: title.trim(),
          description: description?.trim() || null,
          mediaUrls,
          tradeTypes,
          priceCents: priceCents ?? startPrice ?? null,
          currency,
          auctionEndsAt: auctionEndsAt ?? null,
          auctionType: tradeTypes.includes(MarketItemTradeType.AUCTION) ? (auctionType ?? AuctionType.RISING) : null,
          startingPriceCents: startPrice,
          reservePriceCents: reservePriceCents ?? null,
          buyItNowPriceCents: buyItNowPriceCents ?? null,
          currentPriceCents: isHolland ? (startPrice ?? null) : null,
          hollandDecrementCents: isHolland ? (hollandDecrementCents ?? null) : null,
          hollandIntervalMinutes: isHolland ? (hollandIntervalMinutes ?? null) : null,
          negotiationAcceptable: tradeTypes.includes(MarketItemTradeType.BUY_IT_NOW) ? (negotiationAcceptable ?? false) : null,
          status: MarketItemStatus.ACTIVE,
        },
      });

      // NOTE: GroupChannel creation removed - chats are now created lazily when buyers interact
      // (via expressInterest or "Ask seller" button)

      return tx.marketItem.findUnique({
        where: { id: item.id },
        include: {
          seller: { select: { ...USER_SELECT_FIELDS } },
          category: true,
          city: true,
        },
      });
    }).then(async (created) => {
      if (!created) return created;

      // Send notifications
      notificationService.sendNewMarketItemNotification(
        { id: created.id, title: created.title, description: created.description, priceCents: created.priceCents, currency: created.currency, cityId: created.cityId, additionalCityIds: created.additionalCityIds },
        created.sellerId
      ).catch((err) => {
        console.error('[MarketItemService] Failed to send new market item notifications:', err);
      });
      return created;
    });
  }

  static async getMarketItems(filters: MarketItemFilters = {}) {
    const {
      cityId,
      categoryId,
      tradeType,
      status,
      sellerId,
      userId,
      page = 1,
      limit = 20,
    } = filters;

    const where: any = {};
    if (cityId) {
      where.OR = [
        { cityId: cityId },
        { additionalCityIds: { has: cityId } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;
    if (tradeType) where.tradeTypes = { has: tradeType };
    if (status) {
      where.status = status;
    } else {
      where.status = { in: [MarketItemStatus.ACTIVE, MarketItemStatus.SOLD, MarketItemStatus.RESERVED, MarketItemStatus.WITHDRAWN] };
    }
    if (sellerId) where.sellerId = sellerId;

    // When filtering by specific status, sort by createdAt only
    // When showing all statuses, we'll sort in-memory by custom status priority
    const orderBy = status ? { createdAt: 'desc' as const } : { createdAt: 'desc' as const };

    const [allItems, total] = await Promise.all([
      prisma.marketItem.findMany({
        where,
        include: {
          seller: { select: { ...USER_SELECT_FIELDS } },
          category: true,
          city: true,
          groupChannels: userId ? { select: { id: true, buyerId: true } } : false,
        },
        orderBy,
      }),
      prisma.marketItem.count({ where }),
    ]);

    // If no specific status filter, sort by custom priority: ACTIVE -> RESERVED -> SOLD -> WITHDRAWN
    let items = allItems;
    if (!status) {
      const statusPriority: Record<MarketItemStatus, number> = {
        [MarketItemStatus.ACTIVE]: 1,
        [MarketItemStatus.RESERVED]: 2,
        [MarketItemStatus.SOLD]: 3,
        [MarketItemStatus.WITHDRAWN]: 4,
      };

      items = allItems.sort((a, b) => {
        const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
        if (priorityDiff !== 0) return priorityDiff;
        // Within same status, newer items first
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }

    const paginatedItems = items.slice((page - 1) * limit, page * limit);
    const data = userId
      ? paginatedItems.map((item) => {
          const { groupChannels, ...rest } = item as typeof item & {
            groupChannels?: { id: string; buyerId: string | null }[];
          };
          const channels = groupChannels ?? [];
          if (item.sellerId === userId)
            return { ...rest, groupChannels: channels.map((c) => ({ id: c.id })) };
          const buyerChannel = channels.find((c) => c.buyerId === userId);
          return { ...rest, groupChannel: buyerChannel ? { id: buyerChannel.id } : null };
        })
      : paginatedItems;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        hasMore: page * limit < total,
      },
    };
  }

  static async getMarketItemById(id: string, userId?: string) {
    const item = await prisma.marketItem.findUnique({
      where: { id },
      include: {
        seller: { select: { ...USER_SELECT_FIELDS } },
        category: true,
        city: true,
        groupChannels: userId ? {
          where: { buyerId: userId },
          take: 1,
        } : false,
      },
    });
    if (!item) {
      throw new ApiError(404, 'Item not found');
    }

    // If user is checking, find their private chat with seller
    let buyerChat = null;
    if (userId && userId !== item.sellerId) {
      buyerChat = await prisma.groupChannel.findFirst({
        where: {
          marketItemId: id,
          buyerId: userId,
        },
        select: { id: true },
      });
    }

    return { ...item, buyerChat };
  }

  static async updateMarketItem(
    id: string,
    userId: string,
    data: Partial<CreateMarketItemData>
  ) {
    const item = await prisma.marketItem.findUnique({
      where: { id },
      include: { groupChannels: { select: { id: true }, take: 1 } },
    });
    if (!item) {
      throw new ApiError(404, 'Item not found');
    }
    if (item.sellerId !== userId) {
      throw new ApiError(403, 'Only seller can update');
    }
    if (item.status !== MarketItemStatus.ACTIVE) {
      throw new ApiError(400, 'Can only update active items');
    }

    const {
      categoryId,
      cityId,
      additionalCityIds,
      title,
      description,
      mediaUrls,
      tradeTypes,
      priceCents,
      currency,
      auctionEndsAt,
      auctionType,
      startingPriceCents,
      reservePriceCents,
      buyItNowPriceCents,
      hollandDecrementCents,
      hollandIntervalMinutes,
      negotiationAcceptable,
    } = data;

    // Validate additional cities if provided
    if (additionalCityIds !== undefined && additionalCityIds.length > 0) {
      const finalCityId = cityId ?? item.cityId;

      // Ensure primary city not in additional cities
      if (additionalCityIds.includes(finalCityId)) {
        throw new ApiError(400, 'Primary city cannot be in additional cities list');
      }

      // Validate all additional city IDs exist
      const additionalCities = await prisma.city.findMany({
        where: { id: { in: additionalCityIds } },
        select: { id: true },
      });

      if (additionalCities.length !== additionalCityIds.length) {
        throw new ApiError(400, 'One or more additional cities not found');
      }

      // Check for duplicates
      const uniqueCities = new Set(additionalCityIds);
      if (uniqueCities.size !== additionalCityIds.length) {
        throw new ApiError(400, 'Duplicate cities in additional cities list');
      }
    }

    const finalTradeTypes = tradeTypes ?? item.tradeTypes;
    if (finalTradeTypes.length !== 1) {
      throw new ApiError(400, 'Exactly one trade type must be selected');
    }
    const finalPriceCents = priceCents !== undefined ? priceCents : item.priceCents;
    const finalStartPrice =
      startingPriceCents !== undefined ? startingPriceCents : (item.startingPriceCents ?? item.priceCents);
    const finalReserve = reservePriceCents !== undefined ? reservePriceCents : item.reservePriceCents;
    const finalBuyItNow = buyItNowPriceCents !== undefined ? buyItNowPriceCents : item.buyItNowPriceCents;
    const finalAuctionEndsAt = auctionEndsAt !== undefined ? auctionEndsAt : item.auctionEndsAt;

    if (finalTradeTypes.includes(MarketItemTradeType.FREE)) {
      if (finalPriceCents != null && finalPriceCents > 0) {
        throw new ApiError(400, 'FREE items cannot have a price');
      }
    } else {
      if (finalTradeTypes.includes(MarketItemTradeType.BUY_IT_NOW) && (finalPriceCents == null || finalPriceCents < 0)) {
        throw new ApiError(400, 'Price is required for Buy it now');
      }
      if (finalTradeTypes.includes(MarketItemTradeType.AUCTION)) {
        if (finalStartPrice == null || finalStartPrice < 0) {
          throw new ApiError(400, 'Starting bid is required for Auction');
        }
        if (!finalAuctionEndsAt) {
          throw new ApiError(400, 'Auction end date is required');
        }
        if (new Date(finalAuctionEndsAt) <= new Date()) {
          throw new ApiError(400, 'Auction end date must be in the future');
        }
        if (finalReserve != null && (finalReserve < finalStartPrice || (finalBuyItNow != null && finalReserve > finalBuyItNow))) {
          throw new ApiError(400, 'Reserve price must be between starting price and buy it now price (if set)');
        }
        if (finalBuyItNow != null && finalBuyItNow < finalStartPrice) {
          throw new ApiError(400, 'Buy it now price must be at least the starting price');
        }
      }
    }

    const isHolland =
      (finalTradeTypes.includes(MarketItemTradeType.AUCTION) && (auctionType ?? item.auctionType) === AuctionType.HOLLAND);
    const nextStartPrice = startingPriceCents !== undefined ? startingPriceCents : item.startingPriceCents;

    return prisma.$transaction(async (tx) => {
      const updated = await tx.marketItem.update({
        where: { id },
        data: {
          ...(categoryId && { categoryId }),
          ...(cityId && { cityId }),
          ...(additionalCityIds !== undefined && { additionalCityIds }),
          ...(title !== undefined && { title: title.trim() }),
          ...(description !== undefined && { description: description?.trim() || null }),
          ...(mediaUrls !== undefined && { mediaUrls }),
          ...(tradeTypes && { tradeTypes }),
          ...(priceCents !== undefined && { priceCents }),
          ...(currency && { currency }),
          ...(auctionEndsAt !== undefined && { auctionEndsAt }),
          ...(auctionType !== undefined && { auctionType }),
          ...(startingPriceCents !== undefined && { startingPriceCents }),
          ...(reservePriceCents !== undefined && { reservePriceCents }),
          ...(buyItNowPriceCents !== undefined && { buyItNowPriceCents }),
          ...(hollandDecrementCents !== undefined && { hollandDecrementCents }),
          ...(hollandIntervalMinutes !== undefined && { hollandIntervalMinutes }),
          ...(negotiationAcceptable !== undefined && {
            negotiationAcceptable: finalTradeTypes.includes(MarketItemTradeType.BUY_IT_NOW) ? negotiationAcceptable : null,
          }),
          ...(isHolland &&
            nextStartPrice != null &&
            item.currentPriceCents == null && { currentPriceCents: nextStartPrice }),
        },
        include: {
          seller: { select: { ...USER_SELECT_FIELDS } },
          category: true,
          city: true,
          groupChannels: true,
        },
      });

      // Update chat names if title changed (for all buyer chats)
      if (title && item.groupChannels && item.groupChannels.length > 0) {
        const name = title.length > 100 ? title.substring(0, 97) + '...' : title;
        await Promise.all(
          item.groupChannels.map((chat: any) =>
            tx.groupChannel.update({
              where: { id: chat.id },
              data: { name },
            })
          )
        );
      }

      return updated;
    }).then(async (updated) => {
      if (!updated) return updated;

      const seller = await prisma.user.findUnique({
        where: { id: updated.sellerId },
        select: { language: true },
      });
      const lang = seller?.language && seller.language !== 'auto' ? seller.language : 'en';

      const changes = this.buildUpdateChanges(item, updated, lang);
      if (changes.length > 0 && updated.groupChannels && updated.groupChannels.length > 0) {
        const content = `✏️ ${t('marketplace.listingUpdated', lang)}:\n${changes.join('\n')}`;
        const newMediaUrls = mediaUrls !== undefined
          && JSON.stringify(mediaUrls) !== JSON.stringify(item.mediaUrls)
          ? mediaUrls
          : [];
        // Send update message to all buyer chats
        await Promise.all(
          updated.groupChannels.map((chat: any) =>
            MessageService.createMessage({
              chatContextType: ChatContextType.GROUP,
              contextId: chat.id,
              senderId: updated.sellerId,
              content,
              mediaUrls: newMediaUrls,
              chatType: ChatType.PUBLIC,
            }).catch((err) => {
              console.error('[MarketItemService] Failed to send update message to chat:', err);
            })
          )
        );
      }

      return updated;
    });
  }

  private static buildUpdateChanges(
    oldItem: {
      title: string;
      description: string | null;
      mediaUrls: string[];
      tradeTypes: MarketItemTradeType[];
      priceCents: number | null;
      currency: PriceCurrency;
      auctionEndsAt: Date | null;
      categoryId: string;
    },
    newItem: {
      title: string;
      description: string | null;
      mediaUrls: string[];
      tradeTypes: MarketItemTradeType[];
      priceCents: number | null;
      currency: PriceCurrency;
      auctionEndsAt: Date | null;
      categoryId: string;
      category?: { name: string } | null;
    },
    lang: string = 'en'
  ): string[] {
    const changes: string[] = [];

    if (oldItem.title !== newItem.title) {
      changes.push(`• ${t('marketplace.update.title', lang)}: ${newItem.title}`);
    }
    if ((oldItem.description || '') !== (newItem.description || '')) {
      changes.push(`• ${t('marketplace.update.descriptionUpdated', lang)}`);
    }
    if (JSON.stringify(oldItem.mediaUrls) !== JSON.stringify(newItem.mediaUrls)) {
      const oldCount = oldItem.mediaUrls?.length ?? 0;
      const newCount = newItem.mediaUrls?.length ?? 0;
      if (newCount > oldCount) {
        changes.push(`• ${t('marketplace.update.photosAdded', lang).replace('{{count}}', String(newCount - oldCount))}`);
      } else if (newCount < oldCount) {
        changes.push(`• ${t('marketplace.update.photosRemoved', lang).replace('{{count}}', String(oldCount - newCount))}`);
      } else {
        changes.push(`• ${t('marketplace.update.photosUpdated', lang)}`);
      }
    }
    if (JSON.stringify([...oldItem.tradeTypes].sort()) !== JSON.stringify([...newItem.tradeTypes].sort())) {
      const labels = newItem.tradeTypes.map((tt) => t(`marketplace.tradeType.${tt}`, lang));
      changes.push(`• ${t('marketplace.update.sellingType', lang)}: ${labels.join(', ')}`);
    }
    if (oldItem.priceCents !== newItem.priceCents || oldItem.currency !== newItem.currency) {
      if (newItem.priceCents != null) {
        changes.push(`• ${t('marketplace.update.price', lang)}: ${(newItem.priceCents / 100).toFixed(2)} ${newItem.currency}`);
      } else {
        changes.push(`• ${t('marketplace.update.priceRemoved', lang)}`);
      }
    }
    if (oldItem.categoryId !== newItem.categoryId && newItem.category) {
      changes.push(`• ${t('marketplace.update.category', lang)}: ${newItem.category.name}`);
    }
    if (String(oldItem.auctionEndsAt ?? '') !== String(newItem.auctionEndsAt ?? '')) {
      if (newItem.auctionEndsAt) {
        changes.push(`• ${t('marketplace.update.auctionEnds', lang)}: ${new Date(newItem.auctionEndsAt).toLocaleDateString()}`);
      }
    }

    return changes;
  }

  static async withdrawMarketItem(id: string, userId: string, status: 'WITHDRAWN' | 'SOLD' | 'RESERVED' = 'WITHDRAWN') {
    const item = await prisma.marketItem.findUnique({ where: { id } });
    if (!item) {
      throw new ApiError(404, 'Item not found');
    }
    if (item.sellerId !== userId) {
      throw new ApiError(403, 'Only seller can withdraw');
    }
    if (item.status !== MarketItemStatus.ACTIVE && item.status !== MarketItemStatus.RESERVED) {
      throw new ApiError(400, 'Can only update active or reserved items');
    }

    const targetStatus = status === 'SOLD'
      ? MarketItemStatus.SOLD
      : status === 'RESERVED'
        ? MarketItemStatus.RESERVED
        : MarketItemStatus.WITHDRAWN;

    return prisma.$transaction(async (tx) => {
      const updated = await tx.marketItem.update({
        where: { id },
        data: { status: targetStatus },
        include: {
          seller: { select: { ...USER_SELECT_FIELDS } },
          category: true,
          city: true,
          groupChannels: true,
        },
      });

      // Post messages to all buyer chats about the status change
      if (updated.groupChannels && updated.groupChannels.length > 0) {
        const seller = await tx.user.findUnique({
          where: { id: updated.sellerId },
          select: { language: true },
        });
        const lang = seller?.language && seller.language !== 'auto' ? seller.language : 'en';

        const statusMessage = status === 'SOLD'
          ? t('marketplace.itemMarkedAsSold', lang)
          : status === 'RESERVED'
            ? t('marketplace.itemMarkedAsReserved', lang)
            : t('marketplace.itemWithdrawn', lang);

        // Send message to all buyer chats
        await Promise.all(
          updated.groupChannels.map((chat: any) =>
            MessageService.createMessage({
              chatContextType: ChatContextType.GROUP,
              contextId: chat.id,
              senderId: updated.sellerId,
              content: `ℹ️ ${statusMessage}`,
              mediaUrls: [],
              chatType: ChatType.PUBLIC,
            }).catch((err) => {
              console.error('[MarketItemService] Failed to send status change message to chat:', err);
            })
          )
        );
      }

      return updated;
    });
  }

  static async reserveMarketItem(id: string, userId: string, reserve: boolean) {
    const item = await prisma.marketItem.findUnique({ where: { id } });
    if (!item) {
      throw new ApiError(404, 'Item not found');
    }
    if (item.sellerId !== userId) {
      throw new ApiError(403, 'Only seller can reserve/unreserve');
    }

    // Validate current status
    if (reserve && item.status !== MarketItemStatus.ACTIVE) {
      throw new ApiError(400, 'Can only reserve active items');
    }
    if (!reserve && item.status !== MarketItemStatus.RESERVED) {
      throw new ApiError(400, 'Can only unreserve reserved items');
    }

    const targetStatus = reserve ? MarketItemStatus.RESERVED : MarketItemStatus.ACTIVE;

    return prisma.$transaction(async (tx) => {
      const updated = await tx.marketItem.update({
        where: { id },
        data: { status: targetStatus },
        include: {
          seller: { select: { ...USER_SELECT_FIELDS } },
          category: true,
          city: true,
          groupChannels: true,
        },
      });

      // Post messages to all buyer chats about the status change
      if (updated.groupChannels && updated.groupChannels.length > 0) {
        const seller = await tx.user.findUnique({
          where: { id: updated.sellerId },
          select: { language: true },
        });
        const lang = seller?.language && seller.language !== 'auto' ? seller.language : 'en';

        const statusMessage = reserve
          ? t('marketplace.itemReserved', lang)
          : t('marketplace.itemUnreserved', lang);

        // Send message to all buyer chats
        await Promise.all(
          updated.groupChannels.map((chat: any) =>
            MessageService.createMessage({
              chatContextType: ChatContextType.GROUP,
              contextId: chat.id,
              senderId: updated.sellerId,
              content: `ℹ️ ${statusMessage}`,
              mediaUrls: [],
              chatType: ChatType.PUBLIC,
            }).catch((err) => {
              console.error('[MarketItemService] Failed to send status change message to chat:', err);
            })
          )
        );
      }

      return updated;
    });
  }

  static async expressInterest(id: string, userId: string, tradeType: MarketItemTradeType) {
    const item = await prisma.marketItem.findUnique({
      where: { id },
      include: {
        seller: { select: { ...USER_SELECT_FIELDS, language: true } },
      },
    });

    if (!item) {
      throw new ApiError(404, 'Item not found');
    }

    if (item.sellerId === userId) {
      throw new ApiError(400, 'Cannot express interest in your own listing');
    }

    if (item.status !== MarketItemStatus.ACTIVE && item.status !== MarketItemStatus.RESERVED) {
      throw new ApiError(400, 'Can only express interest in active or reserved items');
    }

    if (!item.tradeTypes.includes(tradeType)) {
      throw new ApiError(400, 'This trade type is not available for this listing');
    }

    // Get or create private buyer-seller chat
    const chat = await this.getOrCreateBuyerChat(id, userId);

    // Get the seller's language
    const lang = item.seller?.language && item.seller.language !== 'auto' ? item.seller.language : 'en';

    // Get the translated message
    const message = t(`marketplace.buyerInterest.${tradeType}`, lang);

    // Send the message to the PRIVATE chat with socket event
    await MessageService.createMessageWithEvent({
      chatContextType: ChatContextType.GROUP,
      contextId: chat.id,
      senderId: userId,
      content: `💬 ${message}`,
      mediaUrls: [],
      chatType: ChatType.PUBLIC,
      mentionIds: [],
    });

    return { success: true, message: 'Interest expressed successfully', chatId: chat.id };
  }

  static async getOrCreateBuyerChat(marketItemId: string, buyerId: string) {
    // Validate: item exists and is active
    const item = await prisma.marketItem.findUnique({
      where: { id: marketItemId },
      select: { id: true, sellerId: true, status: true, title: true },
    });

    if (!item) {
      throw new ApiError(404, 'Market item not found');
    }

    // Prevent seller from creating chat with themselves
    if (item.sellerId === buyerId) {
      throw new ApiError(400, 'Cannot create chat with yourself');
    }

    // Check for blocked users
    const isBlocked = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { userId: item.sellerId, blockedUserId: buyerId },
          { userId: buyerId, blockedUserId: item.sellerId },
        ],
      },
    });

    if (isBlocked) {
      throw new ApiError(403, 'Cannot create chat with this user');
    }

    // Check if chat already exists
    let chat = await prisma.groupChannel.findFirst({
      where: {
        marketItemId,
        buyerId,
      },
      include: {
        participants: {
          include: {
            user: { select: { ...USER_SELECT_FIELDS } },
          },
        },
      },
    });

    // If chat exists, return it
    if (chat) {
      return chat;
    }

    // Create new private chat in a transaction
    const createdChat = await prisma.$transaction(async (tx) => {
      // Create GroupChannel
      const newChat = await tx.groupChannel.create({
        data: {
          name: item.title.slice(0, 100), // Store item title (display name computed in UI)
          marketItemId,
          buyerId,
          isChannel: false,
          isPublic: false, // Private chat
          participantsCount: 2, // Seller + buyer
        },
      });

      // Add seller as OWNER
      await tx.groupChannelParticipant.create({
        data: {
          groupChannelId: newChat.id,
          userId: item.sellerId,
          role: ParticipantRole.OWNER,
        },
      });

      // Add buyer as PARTICIPANT
      await tx.groupChannelParticipant.create({
        data: {
          groupChannelId: newChat.id,
          userId: buyerId,
          role: ParticipantRole.PARTICIPANT,
        },
      });

      // Return full chat with participants
      return tx.groupChannel.findUnique({
        where: { id: newChat.id },
        include: {
          participants: {
            include: {
              user: { select: { ...USER_SELECT_FIELDS } },
            },
          },
        },
      });
    });

    if (!createdChat) {
      throw new ApiError(500, 'Failed to create chat');
    }

    return createdChat;
  }

  static async getSellerChats(marketItemId: string, sellerId: string) {
    // Verify ownership
    const item = await prisma.marketItem.findUnique({
      where: { id: marketItemId },
      select: { sellerId: true },
    });

    if (!item) {
      throw new ApiError(404, 'Market item not found');
    }

    if (item.sellerId !== sellerId) {
      throw new ApiError(403, 'Only the seller can view buyer conversations');
    }

    // Get all buyer chats for this item
    const chats = await prisma.groupChannel.findMany({
      where: {
        marketItemId,
        buyerId: { not: null },
      },
      include: {
        buyer: { select: { ...USER_SELECT_FIELDS } },
        participants: {
          include: {
            user: { select: { ...USER_SELECT_FIELDS } },
          },
        },
      },
      orderBy: {
        updatedAt: 'desc', // Most recent first
      },
    });

    return chats;
  }
}
