import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { createAdLandingWish } from '../services/ads/adLandingWish.service';
import {
  adLandingKeyParamSchema,
  adLandingWishCreateSchema,
} from '../services/ads/adLandingWish.schemas';

export const postAdLandingWish = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const keyParsed = adLandingKeyParamSchema.safeParse(req.params.landingKey);
    if (!keyParsed.success) {
      throw new ApiError(404, 'Landing not found', true, { code: 'ads.landing.notFound' });
    }

    const bodyParsed = adLandingWishCreateSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      throw new ApiError(400, bodyParsed.error.message, true, { code: 'ads.landing.wishInvalid' });
    }

    const wish = await createAdLandingWish(keyParsed.data, bodyParsed.data);
    res.status(201).json({
      success: true,
      wish: {
        id: wish.id,
        donationIntent: wish.donationIntent,
        linkedUser: Boolean(wish.userId),
        createdAt: wish.createdAt.toISOString(),
      },
    });
  }
);
