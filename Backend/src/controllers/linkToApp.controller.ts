import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { PIXEL_GIF } from '../services/linkToApp/linkToApp.constants';
import { aidSetCookieHeader, parseAidCookie } from '../services/linkToApp/linkToApp.aid';
import { config } from '../config/env';
import {
  applyAuthAttributionSafely,
  getLinkToAppStats,
  recordLinkToAppEvent,
  resolveLinkToAppRedirect,
} from '../services/linkToApp/linkToApp.service';
import {
  deleteLinkToAppCampaignLabel,
  listLinkToAppCampaignLabels,
  upsertLinkToAppCampaignLabel,
} from '../services/linkToApp/linkToApp.campaignLabel';
import { isLinkToAppChoice, isLinkToAppKind } from '../services/linkToApp/linkToApp.urls';
import { AuthRequest } from '../middleware/auth';

function queryRecord(query: Request['query']): Record<string, unknown> {
  return query as Record<string, unknown>;
}

function attachAidCookie(res: Response, aid: string): void {
  res.append('Set-Cookie', aidSetCookieHeader(aid, config.nodeEnv === 'production'));
}

async function recordPublicEvent(kind: Parameters<typeof recordLinkToAppEvent>[0]['kind'], req: Request): Promise<string | null> {
  try {
    return await recordLinkToAppEvent({
      kind,
      query: queryRecord(req.query),
      userAgent: req.get('user-agent'),
      referer: req.get('referer') ?? req.get('referrer'),
      cookieAid: parseAidCookie(req.get('cookie')),
    });
  } catch (error) {
    console.error('link-to-app event failed', error);
    return null;
  }
}

export const hitLinkToApp = asyncHandler(async (req: Request, res: Response) => {
  const kindRaw = typeof req.query.kind === 'string' ? req.query.kind : 'view';
  const kind = isLinkToAppKind(kindRaw) ? kindRaw : 'view';
  const aid = await recordPublicEvent(kind, req);
  if (aid) attachAidCookie(res, aid);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.type('gif').status(200).send(PIXEL_GIF);
});

export const goLinkToApp = asyncHandler(async (req: Request, res: Response) => {
  const choice = typeof req.params.choice === 'string' ? req.params.choice : '';
  if (!isLinkToAppChoice(choice)) {
    throw new ApiError(404, 'Unknown destination', true, { code: 'linkToApp.unknownChoice' });
  }
  const aid = await recordPublicEvent(choice, req);
  const destination = resolveLinkToAppRedirect(choice, queryRecord(req.query), aid);
  attachAidCookie(res, destination.aid);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.redirect(302, destination.url);
});

export const postAuthAttribution = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new ApiError(401, 'Unauthorized');
  }
  await applyAuthAttributionSafely(req, req.userId, 'login', { attachOnly: true });
  res.json({ success: true });
});

export const getAdminLinkToAppStats = asyncHandler(async (req: Request, res: Response) => {
  const parsed = Number.parseInt(String(req.query.days ?? '30'), 10);
  const days = Number.isFinite(parsed) ? Math.min(365, Math.max(1, parsed)) : 30;
  const stats = await getLinkToAppStats(days);
  res.json({ success: true, data: stats });
});

export const getAdminLinkToAppCampaignLabels = asyncHandler(async (_req: Request, res: Response) => {
  const labels = await listLinkToAppCampaignLabels();
  res.json({ success: true, data: labels });
});

export const putAdminLinkToAppCampaignLabel = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { utmCampaign?: unknown; label?: unknown };
  const row = await upsertLinkToAppCampaignLabel(body.utmCampaign, body.label);
  res.json({ success: true, data: row });
});

export const deleteAdminLinkToAppCampaignLabel = asyncHandler(async (req: Request, res: Response) => {
  await deleteLinkToAppCampaignLabel(req.params.utmCampaign);
  res.json({ success: true });
});
