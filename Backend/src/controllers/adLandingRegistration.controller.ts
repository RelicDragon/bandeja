import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { saveAdLandingRegistration } from '../services/ads/adLandingRegistration.service';
import {
  adLandingRegistrationCreateSchema,
  adLandingRegistrationKeyParamSchema,
} from '../services/ads/adLandingRegistration.schemas';

export const postAdLandingRegistration = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const keyParsed = adLandingRegistrationKeyParamSchema.safeParse(req.params.landingKey);
    if (!keyParsed.success) {
      throw new ApiError(404, 'Landing not found', true, {
        code: 'ads.landing.notFound',
      });
    }

    const bodyParsed = adLandingRegistrationCreateSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      throw new ApiError(400, bodyParsed.error.message, true, {
        code: 'ads.landing.registrationInvalid',
      });
    }

    const registration = await saveAdLandingRegistration(keyParsed.data, bodyParsed.data);
    if (!registration) {
      throw new ApiError(401, 'This registration link is missing or expired', true, {
        code: 'ads.landing.registrationTokenInvalid',
      });
    }

    res.status(registration.created ? 201 : 200).json({
      success: true,
      registration: {
        id: registration.id,
        linkedUser: registration.userId !== null,
        created: registration.created,
        createdAt: registration.createdAt.toISOString(),
        updatedAt: registration.updatedAt.toISOString(),
      },
    });
  }
);
