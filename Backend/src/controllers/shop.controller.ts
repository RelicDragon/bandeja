/**
 * PRD 355 — cosmetics shop controller.
 *
 * Every handler runs behind `authenticate` and `requireShopEnabled`; the admin
 * catalogue lives on `goods.routes.ts` behind `requireAdmin`.
 */
import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import notificationService from '../services/notification.service';
import { ShopService } from '../services/shop/shop.service';
import { isShopKind } from '../services/shop/shopRules';
import {
  isDuplicateOwnershipError,
  purchaseGoods,
  shopRejectionError,
  type ShopPurchaseOutcome,
} from '../services/shop/shopPurchase.service';

/** Max ids one `GET /shop/equipped` call may resolve — keeps the fan-out bounded. */
const EQUIPPED_BATCH_LIMIT = 100;

function requireUserId(req: AuthRequest): string {
  if (!req.userId) throw new ApiError(401, 'Authentication required');
  return req.userId;
}

function readKindQuery(value: unknown) {
  if (value === undefined || value === '' || value === 'all') return undefined;
  if (!isShopKind(value)) throw new ApiError(400, 'Unknown category');
  return value;
}

export const getCatalog = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await ShopService.getCatalog(requireUserId(req), readKindQuery(req.query.kind));
  res.json({ success: true, data });
});

export const getItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await ShopService.getItem(requireUserId(req), req.params.goodsId);
  res.json({ success: true, data });
});

export const getCollection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await ShopService.getCollection(requireUserId(req));
  res.json({ success: true, data });
});

export const equipGoods = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await ShopService.equip(requireUserId(req), req.params.goodsId);
  res.json({ success: true, data });
});

export const unequipGoods = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await ShopService.unequip(requireUserId(req), req.params.goodsId);
  res.json({ success: true, data });
});

export const getEquippedForUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const raw = req.query.userIds;
  const ids = (typeof raw === 'string' ? raw.split(',') : Array.isArray(raw) ? raw.map(String) : [])
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length > EQUIPPED_BATCH_LIMIT) {
    throw new ApiError(400, `At most ${EQUIPPED_BATCH_LIMIT} user ids per request`);
  }
  const data = await ShopService.getPublicEquipped(ids);
  res.json({ success: true, data });
});

export const purchase = asyncHandler(async (req: AuthRequest, res: Response) => {
  const buyerUserId = requireUserId(req);
  const { goodsId, recipientUserId } = req.body as {
    goodsId?: unknown;
    recipientUserId?: unknown;
  };
  if (typeof goodsId !== 'string' || goodsId.trim() === '') {
    throw new ApiError(400, 'goodsId is required');
  }
  const recipient =
    recipientUserId === undefined || recipientUserId === null || recipientUserId === ''
      ? null
      : typeof recipientUserId === 'string'
        ? recipientUserId
        : null;
  if (recipientUserId !== undefined && recipientUserId !== null && recipient === null) {
    throw new ApiError(400, 'recipientUserId must be a string');
  }
  if (recipient === buyerUserId) {
    throw shopRejectionError('SELF_GIFT');
  }

  let outcome: ShopPurchaseOutcome;
  try {
    outcome = await purchaseGoods({ goodsId, buyerUserId, recipientUserId: recipient });
  } catch (error) {
    // Lost double-tap race: the unique index already granted the item once.
    if (isDuplicateOwnershipError(error)) throw shopRejectionError('ALREADY_OWNED');
    throw error;
  }

  if (outcome.isGift) {
    try {
      const sender = await prisma.user.findUnique({
        where: { id: buyerUserId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (sender) {
        await notificationService.sendGoodsGiftReceivedNotification(sender, outcome.ownerUserId, {
          id: outcome.goodsId,
          name: outcome.goodsName,
        });
      }
    } catch (error) {
      // A failed push must never undo a settled purchase.
      console.error('[ShopController] Gift notification failed:', error);
    }
  }

  // The buyer's own view: after a gift they still do not own the item, and the
  // sheet must not offer them an Equip button they cannot use.
  const item = await ShopService.getItem(outcome.buyerUserId, outcome.goodsId);
  res.status(201).json({
    success: true,
    data: {
      item,
      balance: outcome.buyerBalance,
      transactionId: outcome.transactionId,
      recipientUserId: outcome.isGift ? outcome.ownerUserId : null,
    },
  });
});
