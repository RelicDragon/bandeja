import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  ChatContextType,
  ChatType,
  MarketItemStatus,
  MarketItemTradeType,
  ParticipantRole,
  PriceCurrency,
} from '@prisma/client';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { MessageService } from '../chat/message.service';

export interface CreateMarketItemData {
  sellerId: string;
  categoryId: string;
  cityId: string;
  title: string;
  description?: string;
  mediaUrls?: string[];
  tradeTypes: MarketItemTradeType[];
  priceCents?: number;
  currency?: PriceCurrency;
  auctionEndsAt?: Date;
}

export interface MarketItemFilters {
  cityId?: string;
  categoryId?: string;
  tradeType?: MarketItemTradeType;
  status?: MarketItemStatus;
  page?: number;
  limit?: number;
}

export class MarketItemService {
  static async createMarketItem(data: CreateMarketItemData) {
    const {
      sellerId,
      categoryId,
      cityId,
      title,
      description,
      mediaUrls = [],
      tradeTypes,
      priceCents,
      currency = 'EUR',
      auctionEndsAt,
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
    if (!Array.isArray(tradeTypes)) {
      throw new ApiError(400, 'Trade types must be an array');
    }
    const invalid = tradeTypes.filter((t) => !Object.values(MarketItemTradeType).includes(t));
    if (invalid.length > 0) {
      throw new ApiError(400, 'Invalid trade type');
    }
    if (tradeTypes.includes(MarketItemTradeType.BUY_IT_NOW) && (priceCents == null || priceCents < 0)) {
      throw new ApiError(400, 'Price is required for Buy it now');
    }
    if (tradeTypes.includes(MarketItemTradeType.AUCTION)) {
      if (priceCents == null || priceCents < 0) {
        throw new ApiError(400, 'Starting bid is required for Auction');
      }
      if (!auctionEndsAt) {
        throw new ApiError(400, 'Auction end date is required');
      }
      if (new Date(auctionEndsAt) <= new Date()) {
        throw new ApiError(400, 'Auction end date must be in the future');
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

    const name = title.length > 100 ? title.substring(0, 97) + '...' : title;

    return prisma.$transaction(async (tx) => {
      const item = await tx.marketItem.create({
        data: {
          sellerId,
          categoryId,
          cityId,
          title: title.trim(),
          description: description?.trim() || null,
          mediaUrls,
          tradeTypes,
          priceCents: priceCents ?? null,
          currency,
          auctionEndsAt: auctionEndsAt ?? null,
          status: MarketItemStatus.ACTIVE,
        },
      });

      await tx.groupChannel.create({
        data: {
          id: item.id,
          name,
          isChannel: true,
          isPublic: true,
          marketItemId: item.id,
          cityId,
          participantsCount: 1,
        },
      });

      await tx.groupChannelParticipant.create({
        data: {
          groupChannelId: item.id,
          userId: sellerId,
          role: ParticipantRole.OWNER,
        },
      });

      return tx.marketItem.findUnique({
        where: { id: item.id },
        include: {
          seller: { select: { ...USER_SELECT_FIELDS } },
          category: true,
          city: true,
          groupChannel: true,
        },
      });
    }).then(async (created) => {
      if (!created) return created;
      const priceStr = created.priceCents != null
        ? `${(created.priceCents / 100).toFixed(2)} ${created.currency}`
        : 'Negotiable';
      const itemContent = `🏷️ ${created.title}\n${priceStr}`;
      await MessageService.createMessage({
        chatContextType: ChatContextType.GROUP,
        contextId: created.id,
        senderId: created.sellerId,
        content: itemContent,
        mediaUrls: created.mediaUrls,
        chatType: ChatType.PUBLIC,
      }).catch((err) => {
        console.error('[MarketItemService] Failed to send item message to chat:', err);
      });
      return created;
    });
  }

  static async getMarketItems(filters: MarketItemFilters = {}) {
    const {
      cityId,
      categoryId,
      tradeType,
      status = MarketItemStatus.ACTIVE,
      page = 1,
      limit = 20,
    } = filters;

    const where: any = {};
    if (cityId) where.cityId = cityId;
    if (categoryId) where.categoryId = categoryId;
    if (tradeType) where.tradeTypes = { has: tradeType };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.marketItem.findMany({
        where,
        include: {
          seller: { select: { ...USER_SELECT_FIELDS } },
          category: true,
          city: true,
          groupChannel: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.marketItem.count({ where }),
    ]);

    return {
      data: items,
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
        groupChannel: true,
      },
    });
    if (!item) {
      throw new ApiError(404, 'Item not found');
    }
    let isParticipant = false;
    if (userId && item.groupChannel) {
      const p = await prisma.groupChannelParticipant.findUnique({
        where: {
          groupChannelId_userId: {
            groupChannelId: item.groupChannel!.id,
            userId,
          },
        },
      });
      isParticipant = !!p;
    }
    return { ...item, isParticipant };
  }

  static async updateMarketItem(
    id: string,
    userId: string,
    data: Partial<CreateMarketItemData>
  ) {
    const item = await prisma.marketItem.findUnique({
      where: { id },
      include: { groupChannel: { select: { id: true } } },
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

    const { categoryId, cityId, title, description, mediaUrls, tradeTypes, priceCents, currency, auctionEndsAt } = data;

    const finalTradeTypes = tradeTypes ?? item.tradeTypes;
    const finalPriceCents = priceCents !== undefined ? priceCents : item.priceCents;
    const finalAuctionEndsAt = auctionEndsAt !== undefined ? auctionEndsAt : item.auctionEndsAt;
    if (finalTradeTypes.includes(MarketItemTradeType.BUY_IT_NOW) && (finalPriceCents == null || finalPriceCents < 0)) {
      throw new ApiError(400, 'Price is required for Buy it now');
    }
    if (finalTradeTypes.includes(MarketItemTradeType.AUCTION)) {
      if (finalPriceCents == null || finalPriceCents < 0) {
        throw new ApiError(400, 'Starting bid is required for Auction');
      }
      if (!finalAuctionEndsAt) {
        throw new ApiError(400, 'Auction end date is required');
      }
      if (new Date(finalAuctionEndsAt) <= new Date()) {
        throw new ApiError(400, 'Auction end date must be in the future');
      }
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.marketItem.update({
        where: { id },
        data: {
          ...(categoryId && { categoryId }),
          ...(cityId && { cityId }),
          ...(title !== undefined && { title: title.trim() }),
          ...(description !== undefined && { description: description?.trim() || null }),
          ...(mediaUrls !== undefined && { mediaUrls }),
          ...(tradeTypes && { tradeTypes }),
          ...(priceCents !== undefined && { priceCents }),
          ...(currency && { currency }),
          ...(auctionEndsAt !== undefined && { auctionEndsAt }),
        },
        include: {
          seller: { select: { ...USER_SELECT_FIELDS } },
          category: true,
          city: true,
          groupChannel: true,
        },
      });

      if (title && item.groupChannel) {
        const name = title.length > 100 ? title.substring(0, 97) + '...' : title;
        await tx.groupChannel.update({
          where: { id: item.groupChannel.id },
          data: { name },
        });
      }

      return updated;
    });
  }

  static async withdrawMarketItem(id: string, userId: string) {
    const item = await prisma.marketItem.findUnique({ where: { id } });
    if (!item) {
      throw new ApiError(404, 'Item not found');
    }
    if (item.sellerId !== userId) {
      throw new ApiError(403, 'Only seller can withdraw');
    }
    return prisma.marketItem.update({
      where: { id },
      data: { status: MarketItemStatus.WITHDRAWN },
      include: {
        seller: { select: { ...USER_SELECT_FIELDS } },
        category: true,
        city: true,
        groupChannel: true,
      },
    });
  }
}
