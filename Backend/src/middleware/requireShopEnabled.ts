/**
 * PRD 355 — the `SHOP_ENABLED` gate (CONTRACT §7.7).
 *
 * With the flag off the shop must behave as if it does not exist: a plain 404,
 * never a half-working storefront. The frontend flag keeps the entry points
 * from rendering at all, so this is the backstop, not the primary path.
 */
import { NextFunction, Request, Response } from 'express';
import { config } from '../config/env';
import { ApiError } from '../utils/ApiError';

export const requireShopEnabled = (_req: Request, _res: Response, next: NextFunction) => {
  if (!config.shopEnabled) {
    next(new ApiError(404, 'shop.disabled', true, { code: 'shop.disabled' }));
    return;
  }
  next();
};
