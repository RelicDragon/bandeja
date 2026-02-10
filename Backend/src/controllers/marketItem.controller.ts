import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { MarketItemService } from '../services/marketItem/marketItem.service';
import { MarketItemParticipantService } from '../services/marketItem/participant.service';
import { MarketItemStatus, MarketItemTradeType } from '@prisma/client';
import prisma from '../config/database';
import { SUPPORTED_CURRENCIES } from '../utils/constants';

export const getMarketCategories = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const categories = await prisma.marketItemCategory.findMany({
    where: { isActive: true },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, order: true },
  });
  res.json({ success: true, data: categories });
});

export const createMarketItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentCityId: true },
  });
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
  } = req.body;

  const city = cityId || user?.currentCityId;
  if (!city) {
    throw new ApiError(400, 'City is required. Set your city in profile or specify it.');
  }

  if (currency && !SUPPORTED_CURRENCIES.includes(currency)) {
    throw new ApiError(400, `Invalid currency. Supported currencies: ${SUPPORTED_CURRENCIES.join(', ')}`);
  }

  const item = await MarketItemService.createMarketItem({
    sellerId: userId,
    categoryId,
    cityId: city,
    additionalCityIds: Array.isArray(additionalCityIds) ? additionalCityIds : undefined,
    title,
    description,
    mediaUrls: mediaUrls || [],
    tradeTypes: Array.isArray(tradeTypes) ? tradeTypes : [],
    priceCents,
    currency,
    auctionEndsAt: auctionEndsAt ? new Date(auctionEndsAt) : undefined,
  });

  res.status(201).json({ success: true, data: item });
});

export const getMarketItems = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cityId, categoryId, tradeType, status, sellerId, page, limit } = req.query;

  const filters: any = {};
  if (cityId && typeof cityId === 'string') filters.cityId = cityId;
  if (categoryId && typeof categoryId === 'string') filters.categoryId = categoryId;
  if (sellerId && typeof sellerId === 'string') filters.sellerId = sellerId;
  if (tradeType && Object.values(MarketItemTradeType).includes(tradeType as MarketItemTradeType)) {
    filters.tradeType = tradeType;
  }
  if (status && Object.values(MarketItemStatus).includes(status as MarketItemStatus)) {
    filters.status = status;
  }
  if (page) filters.page = parseInt(page as string, 10) || 1;
  if (limit) filters.limit = Math.min(parseInt(limit as string, 10) || 20, 50);

  const result = await MarketItemService.getMarketItems(filters);
  res.json({ success: true, data: result.data, pagination: result.pagination });
});

export const getMarketItemById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const item = await MarketItemService.getMarketItemById(id, req.userId);
  res.json({ success: true, data: item });
});

export const updateMarketItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { categoryId, cityId, additionalCityIds, title, description, mediaUrls, tradeTypes, priceCents, currency, auctionEndsAt } =
    req.body;

  if (currency && !SUPPORTED_CURRENCIES.includes(currency)) {
    throw new ApiError(400, `Invalid currency. Supported currencies: ${SUPPORTED_CURRENCIES.join(', ')}`);
  }

  const item = await MarketItemService.updateMarketItem(id, req.userId!, {
    categoryId,
    cityId,
    additionalCityIds: Array.isArray(additionalCityIds) ? additionalCityIds : undefined,
    title,
    description,
    mediaUrls,
    tradeTypes: Array.isArray(tradeTypes) ? tradeTypes : undefined,
    priceCents,
    currency,
    auctionEndsAt: auctionEndsAt ? new Date(auctionEndsAt) : undefined,
  });
  res.json({ success: true, data: item });
});

export const withdrawMarketItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (status && status !== 'WITHDRAWN' && status !== 'SOLD' && status !== 'RESERVED') {
    throw new ApiError(400, 'Status must be WITHDRAWN, SOLD, or RESERVED');
  }

  const item = await MarketItemService.withdrawMarketItem(id, req.userId!, status || 'WITHDRAWN');
  res.json({ success: true, data: item });
});

export const joinMarketItemChat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await MarketItemParticipantService.joinMarketItemChat(id, req.userId!);
  res.json({ success: true, data: result });
});

export const leaveMarketItemChat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await MarketItemParticipantService.leaveMarketItemChat(id, req.userId!);
  res.json({ success: true, data: result });
});

export const reserveMarketItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { reserve } = req.body;

  if (typeof reserve !== 'boolean') {
    throw new ApiError(400, 'Reserve field must be a boolean');
  }

  const item = await MarketItemService.reserveMarketItem(id, req.userId!, reserve);
  res.json({ success: true, data: item });
});

export const expressInterest = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { tradeType } = req.body;

  if (!tradeType || !Object.values(MarketItemTradeType).includes(tradeType)) {
    throw new ApiError(400, 'Valid trade type is required');
  }

  const result = await MarketItemService.expressInterest(id, req.userId!, tradeType);
  res.json({ success: true, message: result.message, chatId: result.chatId });
});

export const getSellerChats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // Market item ID
  const userId = req.userId!;

  const chats = await MarketItemService.getSellerChats(id, userId);

  res.status(200).json({
    success: true,
    data: chats,
  });
});

export const getBuyerChat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // Market item ID
  const userId = req.userId!;

  const chat = await prisma.groupChannel.findUnique({
    where: {
      GroupChannel_marketItemId_buyerId_key: {
        marketItemId: id,
        buyerId: userId,
      },
    },
    include: {
      participants: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        },
      },
    },
  });

  res.status(200).json({
    success: true,
    data: chat || null,
  });
});

export const createBuyerChat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // Market item ID
  const userId = req.userId!;

  const chat = await MarketItemService.getOrCreateBuyerChat(id, userId);

  res.status(200).json({
    success: true,
    data: chat,
  });
});
