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
}

export interface MarketItemFilters {
  cityId?: string;
  categoryId?: string;
  tradeType?: MarketItemTradeType;
  status?: MarketItemStatus;
  sellerId?: string;
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

    const name = title.length > 100 ? title.substring(0, 97) + '...' : title;

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
          isChannel: false,
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
      const itemContent = `🏷️ ${created.title}\n${priceStr}${created.description ? `\n\n${created.description}` : ''}`;
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
      status = MarketItemStatus.ACTIVE,
      sellerId,
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
    if (status) where.status = status;
    if (sellerId) where.sellerId = sellerId;

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

    const { categoryId, cityId, additionalCityIds, title, description, mediaUrls, tradeTypes, priceCents, currency, auctionEndsAt } = data;

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
          ...(additionalCityIds !== undefined && { additionalCityIds }),
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
    }).then(async (updated) => {
      if (!updated) return updated;

      const seller = await prisma.user.findUnique({
        where: { id: updated.sellerId },
        select: { language: true },
      });
      const lang = seller?.language && seller.language !== 'auto' ? seller.language : 'en';

      const changes = this.buildUpdateChanges(item, updated, lang);
      if (changes.length > 0) {
        const content = `✏️ ${t('marketplace.listingUpdated', lang)}:\n${changes.join('\n')}`;
        const newMediaUrls = mediaUrls !== undefined
          && JSON.stringify(mediaUrls) !== JSON.stringify(item.mediaUrls)
          ? mediaUrls
          : [];
        await MessageService.createMessage({
          chatContextType: ChatContextType.GROUP,
          contextId: updated.id,
          senderId: updated.sellerId,
          content,
          mediaUrls: newMediaUrls,
          chatType: ChatType.PUBLIC,
        }).catch((err) => {
          console.error('[MarketItemService] Failed to send update message to chat:', err);
        });
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
