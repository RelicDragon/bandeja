import { Response } from 'express';
import { AdPlacementKey, Sport } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { AdDeliveryService } from '../services/ads/ad.delivery.service';
import { AdEventService } from '../services/ads/ad.event.service';
import { adDeliveryContextSchema, adPlacementKeySchema } from '../services/ads/ad.schemas';
import { resolveSportForPlacement } from '../services/ads/ad.context.util';

function parsePlacementKeys(raw: unknown): AdPlacementKey[] {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ApiError(400, 'keys query param is required');
  }
  const keys = raw.split(',').map((k) => k.trim()).filter(Boolean);
  const parsed: AdPlacementKey[] = [];
  for (const key of keys) {
    const result = adPlacementKeySchema.safeParse(key);
    if (!result.success) throw new ApiError(400, `Invalid placement key: ${key}`);
    parsed.push(result.data);
  }
  return parsed;
}

function parseContext(req: AuthRequest) {
  const raw = req.query.context;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const json = JSON.parse(raw);
      const result = adDeliveryContextSchema.safeParse(json);
      if (!result.success) throw new ApiError(400, result.error.message);
      return result.data;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(400, 'Invalid context JSON');
    }
  }

  const cityId =
    (typeof req.query.cityId === 'string' ? req.query.cityId : undefined) ??
    req.user?.currentCityId ??
    undefined;

  const sportsByPlacement: Partial<Record<AdPlacementKey, Sport>> = {};
  for (const key of Object.values(AdPlacementKey)) {
    const param = req.query[`sport_${key}`];
    if (typeof param === 'string' && param) {
      sportsByPlacement[key] = param as Sport;
    }
  }

  return { cityId, sportsByPlacement: Object.keys(sportsByPlacement).length ? sportsByPlacement : undefined };
}

function resolveUserLocale(req: AuthRequest): string {
  const lang = req.user?.translateToLanguage ?? req.user?.language;
  if (lang && lang !== 'auto') return lang.split('-')[0];
  return 'en';
}

export const getAdPlacements = asyncHandler(async (req: AuthRequest, res: Response) => {
  const adSessionId = req.query.adSessionId;
  if (typeof adSessionId !== 'string' || !adSessionId.trim()) {
    throw new ApiError(400, 'adSessionId query param is required');
  }

  const keys = parsePlacementKeys(req.query.keys);
  const context = parseContext(req);

  const placements = await AdDeliveryService.resolvePlacements(
    req.userId!,
    adSessionId,
    keys,
    context,
    resolveUserLocale(req),
    req.user?.primarySport
  );

  res.json({ success: true, data: { placements } });
});

export const postAdEvents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await AdEventService.recordBatch(req.userId, req.body, {
    cityId: req.user?.currentCityId ?? undefined,
    locale: resolveUserLocale(req),
    primarySport: req.user?.primarySport ?? undefined,
    resolveSport: (placement) =>
      resolveSportForPlacement(placement, undefined, req.user?.primarySport ?? undefined),
  });
  res.json({ success: true, data: result });
});
