import { Response } from 'express';
import multer from 'multer';
import { AdPlacementKey } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { AdminAdCampaignService } from '../services/admin/adCampaign.service';
import { AdminAdCreativeService } from '../services/admin/adCreative.service';
import { AdminAdExportService } from '../services/admin/adExport.service';
import { AdminAdSponsorService } from '../services/admin/adSponsor.service';
import { AdminAdStatsService } from '../services/admin/adStats.service';
import { AdminAdTargetingPresetService } from '../services/admin/adTargetingPreset.service';
import { AdDeliveryService } from '../services/ads/ad.delivery.service';
import { adDeliveryContextSchema, adPlacementKeySchema } from '../services/ads/ad.schemas';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new ApiError(400, `Invalid file type: ${file.mimetype}`));
  },
});

export const adCreativeUpload = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'imageDark', maxCount: 1 },
]);

export const listAdSponsors = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const sponsors = await AdminAdSponsorService.list();
  res.json({ success: true, data: sponsors });
});

export const getAdSponsor = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sponsor = await AdminAdSponsorService.getById(req.params.id);
  res.json({ success: true, data: sponsor });
});

export const createAdSponsor = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sponsor = await AdminAdSponsorService.create(req.body);
  res.status(201).json({ success: true, data: sponsor });
});

export const updateAdSponsor = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sponsor = await AdminAdSponsorService.update(req.params.id, req.body);
  res.json({ success: true, data: sponsor });
});

export const deleteAdSponsor = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await AdminAdSponsorService.delete(req.params.id);
  res.json({ success: true, data: result });
});

export const listAdCampaigns = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sponsorId = typeof req.query.sponsorId === 'string' ? req.query.sponsorId : undefined;
  const campaigns = await AdminAdCampaignService.list(sponsorId);
  res.json({ success: true, data: campaigns });
});

export const getAdCampaign = asyncHandler(async (req: AuthRequest, res: Response) => {
  const campaign = await AdminAdCampaignService.getById(req.params.id);
  res.json({ success: true, data: campaign });
});

export const createAdCampaign = asyncHandler(async (req: AuthRequest, res: Response) => {
  const campaign = await AdminAdCampaignService.create(req.body);
  res.status(201).json({ success: true, data: campaign });
});

export const updateAdCampaign = asyncHandler(async (req: AuthRequest, res: Response) => {
  const campaign = await AdminAdCampaignService.update(req.params.id, req.body);
  res.json({ success: true, data: campaign });
});

export const deleteAdCampaign = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await AdminAdCampaignService.delete(req.params.id);
  res.json({ success: true, data: result });
});

export const uploadAdCreative = asyncHandler(async (req: AuthRequest, res: Response) => {
  const files = req.files as { image?: Express.Multer.File[]; imageDark?: Express.Multer.File[] };
  const creative = await AdminAdCreativeService.upload(
    req.params.id,
    req.body,
    {
      image: files?.image?.[0],
      imageDark: files?.imageDark?.[0],
    }
  );
  res.status(201).json({ success: true, data: creative });
});

export const deleteAdCreative = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await AdminAdCreativeService.delete(req.params.id, req.params.creativeId);
  res.json({ success: true, data: result });
});

export const getAdCampaignStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const stats = await AdminAdStatsService.campaignStats(req.params.id, {
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    placement: req.query.placement as AdPlacementKey | undefined,
    cityId: req.query.cityId as string | undefined,
    locale: req.query.locale as string | undefined,
  });
  res.json({ success: true, data: stats });
});

export const getAdSponsorStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const stats = await AdminAdStatsService.sponsorStats(req.params.id, {
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    placement: req.query.placement as AdPlacementKey | undefined,
    cityId: req.query.cityId as string | undefined,
    locale: req.query.locale as string | undefined,
  });
  res.json({ success: true, data: stats });
});

export const exportAdSponsor = asyncHandler(async (req: AuthRequest, res: Response) => {
  const format = (req.query.format as string) || 'csv';
  const filters = {
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    placement: req.query.placement as AdPlacementKey | undefined,
    cityId: req.query.cityId as string | undefined,
    locale: req.query.locale as string | undefined,
  };

  if (format === 'pdf') {
    const pdf = await AdminAdExportService.sponsorPdf(req.params.id, filters);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="sponsor-${req.params.id}.pdf"`);
    res.send(pdf);
    return;
  }

  const csv = await AdminAdExportService.sponsorCsv(req.params.id, filters);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="sponsor-${req.params.id}.csv"`);
  res.send(csv);
});

export const exportAdCampaign = asyncHandler(async (req: AuthRequest, res: Response) => {
  const csv = await AdminAdExportService.campaignCsv(req.params.id, {
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    placement: req.query.placement as AdPlacementKey | undefined,
    cityId: req.query.cityId as string | undefined,
    locale: req.query.locale as string | undefined,
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="campaign-${req.params.id}.csv"`);
  res.send(csv);
});

export const getAdOverviewStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const view = req.query.view === 'sponsor' || req.query.view === 'campaign' ? req.query.view : undefined;
  const stats = await AdminAdStatsService.overviewStats({
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    placement: req.query.placement as AdPlacementKey | undefined,
    cityId: req.query.cityId as string | undefined,
    locale: req.query.locale as string | undefined,
    view,
  });
  res.json({ success: true, data: stats });
});

export const listAdTargetingPresets = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const presets = await AdminAdTargetingPresetService.list();
  res.json({ success: true, data: presets });
});

export const createAdTargetingPreset = asyncHandler(async (req: AuthRequest, res: Response) => {
  const preset = await AdminAdTargetingPresetService.create(req.body);
  res.status(201).json({ success: true, data: preset });
});

export const deleteAdTargetingPreset = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await AdminAdTargetingPresetService.delete(req.params.id);
  res.json({ success: true, data: result });
});

export const applyAdTargetingPreset = asyncHandler(async (req: AuthRequest, res: Response) => {
  const targeting = await AdminAdTargetingPresetService.apply(req.params.id);
  res.json({ success: true, data: { targeting } });
});

export const applyAdTargetingPresetToCampaign = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const campaign = await AdminAdTargetingPresetService.applyToCampaign(
      req.params.presetId,
      req.params.id
    );
    res.json({ success: true, data: campaign });
  }
);

export const previewAd = asyncHandler(async (req: AuthRequest, res: Response) => {
  const campaignId = req.query.campaignId;
  const userId = req.query.userId;
  const placement = req.query.placement;
  const locale = (req.query.locale as string) || 'en';

  if (typeof campaignId !== 'string' || typeof userId !== 'string' || typeof placement !== 'string') {
    throw new ApiError(400, 'campaignId, userId, and placement are required');
  }

  const placementResult = adPlacementKeySchema.safeParse(placement);
  if (!placementResult.success) throw new ApiError(400, 'Invalid placement');

  let context = {};
  if (typeof req.query.context === 'string' && req.query.context.trim()) {
    context = JSON.parse(req.query.context);
  }
  const contextResult = adDeliveryContextSchema.safeParse(context);
  if (!contextResult.success) throw new ApiError(400, contextResult.error.message);

  const user = await import('../config/database').then((m) =>
    m.default.user.findUnique({
      where: { id: userId },
      select: { primarySport: true, currentCityId: true },
    })
  );
  if (!user) throw new ApiError(404, 'User not found');

  const resolvedContext = {
    cityId: contextResult.data.cityId ?? user.currentCityId ?? undefined,
    sportsByPlacement: contextResult.data.sportsByPlacement,
  };

  const variantKey =
    typeof req.query.variantKey === 'string' && req.query.variantKey.trim()
      ? req.query.variantKey.trim()
      : undefined;

  const card = await AdDeliveryService.preview(
    campaignId,
    userId,
    placementResult.data,
    locale,
    resolvedContext,
    user.primarySport,
    variantKey
  );

  res.json({ success: true, data: card });
});
