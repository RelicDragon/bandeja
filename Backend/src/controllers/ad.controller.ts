import { Response } from 'express';
import { AdPlacementKey, Sport } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { AdDeliveryService } from '../services/ads/ad.delivery.service';
import { AdEventService } from '../services/ads/ad.event.service';
import { adDeliveryContextSchema, adPlacementKeySchema } from '../services/ads/ad.schemas';
import { resolveAdClickUserName, resolveAdClickLocale } from '../services/ads/ad.clickUrl.util';
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
  let fromJson: {
    cityId?: string;
    sportsByPlacement?: Partial<Record<AdPlacementKey, Sport>>;
    locale?: string;
    theme?: 'light' | 'dark';
  } | null = null;

  const raw = req.query.context;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const json = JSON.parse(raw);
      const result = adDeliveryContextSchema.safeParse(json);
      if (!result.success) throw new ApiError(400, result.error.message);
      fromJson = result.data;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(400, 'Invalid context JSON');
    }
  }

  const sportsByPlacement: Partial<Record<AdPlacementKey, Sport>> = {
    ...(fromJson?.sportsByPlacement ?? {}),
  };
  for (const key of Object.values(AdPlacementKey)) {
    const param = req.query[`sport_${key}`];
    if (typeof param === 'string' && param) {
      sportsByPlacement[key] = param as Sport;
    }
  }

  const cityId =
    fromJson?.cityId ??
    (typeof req.query.cityId === 'string' ? req.query.cityId : undefined) ??
    req.user?.currentCityId ??
    undefined;

  return {
    cityId,
    sportsByPlacement: Object.keys(sportsByPlacement).length ? sportsByPlacement : undefined,
    locale: fromJson?.locale,
    theme: fromJson?.theme,
  };
}

function parseAcceptLanguageCandidates(header: string | undefined): string[] {
  if (!header?.trim()) return [];
  return header
    .split(',')
    .map((part) => part.trim().split(';')[0]?.trim())
    .filter((part): part is string => Boolean(part));
}

function resolveUserLocale(req: AuthRequest, contextLocale?: string): string {
  const acceptCandidates = parseAcceptLanguageCandidates(req.get('Accept-Language'));
  return resolveAdClickLocale(
    contextLocale,
    req.user?.language,
    ...acceptCandidates,
  );
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
    resolveUserLocale(req, context.locale),
    req.user?.primarySport,
    resolveAdClickUserName(req.user?.firstName, req.user?.lastName)
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
