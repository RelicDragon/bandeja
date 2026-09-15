import type { Request } from 'express';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { createLinkToAppAid, isLinkToAppAid, parseAidCookie } from './linkToApp.aid';
import {
  attributionHasSignal,
  coalesceUtm,
  parseLinkToAppAttributionInput,
  type LinkToAppAttributionInput,
  type LinkToAppAuthKind,
} from './linkToApp.attributionParse';
import {
  campaignLabelMap,
  displayCampaignName,
  listLinkToAppCampaignLabels,
} from './linkToApp.campaignLabel';
import {
  buildLinkToAppDestination,
  detectLinkToAppPlatform,
  type LinkToAppChoice,
  type LinkToAppKind,
} from './linkToApp.urls';

const TEXT_MAX = 512;

function clip(value: string | undefined | null, max = TEXT_MAX): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function queryRecord(query: Request['query'] | Record<string, unknown>): Record<string, unknown> {
  return query as Record<string, unknown>;
}

export function readAttributionFromRequest(req: Request): LinkToAppAttributionInput {
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const query = queryRecord(req.query);
  return parseLinkToAppAttributionInput(
    { ...query, ...body },
    parseAidCookie(req.get('cookie'))
  );
}

async function upsertAttribution(input: LinkToAppAttributionInput) {
  const aid = input.aid && isLinkToAppAid(input.aid) ? input.aid : createLinkToAppAid();
  const existing = await prisma.linkToAppAttribution.findUnique({ where: { id: aid } });
  const utm = existing
    ? coalesceUtm(
        {
          source: existing.utmSource,
          medium: existing.utmMedium,
          campaign: existing.utmCampaign,
          content: existing.utmContent,
          term: existing.utmTerm,
        },
        input.utm
      )
    : input.utm;
  const lastChoice = input.choice ?? existing?.lastChoice ?? null;
  const row = await prisma.linkToAppAttribution.upsert({
    where: { id: aid },
    create: {
      id: aid,
      utmSource: utm.source,
      utmMedium: utm.medium,
      utmCampaign: utm.campaign,
      utmContent: utm.content,
      utmTerm: utm.term,
      lastChoice,
    },
    update: {
      lastSeenAt: new Date(),
      utmSource: utm.source,
      utmMedium: utm.medium,
      utmCampaign: utm.campaign,
      utmContent: utm.content,
      utmTerm: utm.term,
      lastChoice,
    },
  });
  return row;
}

export async function recordLinkToAppEvent(opts: {
  kind: LinkToAppKind | LinkToAppAuthKind;
  query: Record<string, unknown>;
  userAgent?: string | null;
  referer?: string | null;
  cookieAid?: string | null;
  userId?: string | null;
}): Promise<string> {
  const input = parseLinkToAppAttributionInput(opts.query, opts.cookieAid);
  const attribution = await upsertAttribution({
    ...input,
    aid: input.aid ?? createLinkToAppAid(),
  });
  const utm = {
    source: attribution.utmSource,
    medium: attribution.utmMedium,
    campaign: attribution.utmCampaign,
    content: attribution.utmContent,
    term: attribution.utmTerm,
  };
  const userAgent = clip(opts.userAgent);
  await prisma.linkToAppEvent.create({
    data: {
      kind: opts.kind,
      attributionId: attribution.id,
      userId: opts.userId ?? null,
      utmSource: utm.source,
      utmMedium: utm.medium,
      utmCampaign: utm.campaign,
      utmContent: utm.content,
      utmTerm: utm.term,
      userAgent,
      referer: clip(opts.referer),
      platform: detectLinkToAppPlatform(userAgent),
    },
  });
  return attribution.id;
}

export function resolveLinkToAppRedirect(
  choice: LinkToAppChoice,
  query: Record<string, unknown>,
  cookieAid?: string | null
): { url: string; aid: string } {
  const input = parseLinkToAppAttributionInput(query, cookieAid);
  const aid = input.aid ?? createLinkToAppAid();
  return {
    aid,
    url: buildLinkToAppDestination({
      choice,
      utm: input.utm,
      aid,
      frontendUrl: config.frontendUrl,
      appStoreCampaignProviderToken: config.appStoreCampaignProviderToken,
    }),
  };
}

export async function applyAuthAttribution(
  req: Request,
  userId: string,
  kind: LinkToAppAuthKind,
  options?: { attachOnly?: boolean }
): Promise<void> {
  const input = readAttributionFromRequest(req);
  if (!attributionHasSignal(input)) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { attributionId: true },
  });
  if (!user) return;
  if (options?.attachOnly && user.attributionId) return;
  const attribution = await upsertAttribution(input);

  if (!user.attributionId) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        attributionId: attribution.id,
        utmSource: attribution.utmSource,
        utmMedium: attribution.utmMedium,
        utmCampaign: attribution.utmCampaign,
        utmContent: attribution.utmContent,
        utmTerm: attribution.utmTerm,
        attributedAt: new Date(),
        attributionChoice: attribution.lastChoice,
        attributionAuthKind: kind,
      },
    });
  }

  if (!attribution.convertedUserId) {
    await prisma.linkToAppAttribution.updateMany({
      where: { id: attribution.id, convertedUserId: null },
      data: {
        convertedUserId: userId,
        convertedAt: new Date(),
        convertedAuthKind: kind,
      },
    });
  }

  const userAgent = clip(req.get('user-agent'));
  await prisma.linkToAppEvent.create({
    data: {
      kind,
      attributionId: attribution.id,
      userId,
      utmSource: attribution.utmSource,
      utmMedium: attribution.utmMedium,
      utmCampaign: attribution.utmCampaign,
      utmContent: attribution.utmContent,
      utmTerm: attribution.utmTerm,
      userAgent,
      referer: clip(req.get('referer') ?? req.get('referrer')),
      platform: detectLinkToAppPlatform(userAgent),
    },
  });
}

export async function applyAuthAttributionSafely(
  req: Request,
  userId: string,
  kind: LinkToAppAuthKind,
  options?: { attachOnly?: boolean }
): Promise<void> {
  try {
    await applyAuthAttribution(req, userId, kind, options);
  } catch (error) {
    console.error('link-to-app auth attribution failed', error);
  }
}

export async function getLinkToAppStats(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.linkToAppEvent.groupBy({
    by: ['kind', 'utmCampaign', 'utmSource', 'utmMedium'],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });

  const emptyCounts = () => ({ view: 0, ios: 0, android: 0, web: 0, register: 0, login: 0 });
  const totals = emptyCounts();
  const byCampaignMap = new Map<
    string,
    { campaign: string | null; source: string | null; medium: string | null } & ReturnType<typeof emptyCounts>
  >();

  for (const row of rows) {
    const count = row._count._all;
    if (row.kind in totals) {
      totals[row.kind as keyof typeof totals] += count;
    }
    const key = `${row.utmCampaign ?? ''}\0${row.utmSource ?? ''}\0${row.utmMedium ?? ''}`;
    const current = byCampaignMap.get(key) ?? {
      campaign: row.utmCampaign,
      source: row.utmSource,
      medium: row.utmMedium,
      ...emptyCounts(),
    };
    if (row.kind in current) {
      current[row.kind as keyof ReturnType<typeof emptyCounts>] += count;
    }
    byCampaignMap.set(key, current);
  }

  const convertedUsers = await prisma.user.findMany({
    where: { attributedAt: { gte: since } },
    orderBy: { attributedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      createdAt: true,
      attributionId: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      attributedAt: true,
      attributionChoice: true,
      attributionAuthKind: true,
    },
  });

  const recent = await prisma.linkToAppEvent.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      kind: true,
      attributionId: true,
      userId: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      platform: true,
      createdAt: true,
    },
  });

  const byCampaign = [...byCampaignMap.values()].sort((a, b) => {
    const aTotal = a.view + a.ios + a.android + a.web + a.register + a.login;
    const bTotal = b.view + b.ios + b.android + b.web + b.register + b.login;
    return bTotal - aTotal;
  });
  const labels = await listLinkToAppCampaignLabels();
  const labelMap = await campaignLabelMap([
    ...byCampaign.map((row) => row.campaign),
    ...convertedUsers.map((row) => row.utmCampaign),
    ...recent.map((row) => row.utmCampaign),
  ]);

  return {
    days,
    totals,
    labels,
    byCampaign: byCampaign.map((row) => ({
      ...row,
      label: row.campaign ? labelMap.get(row.campaign) ?? null : null,
      displayName: displayCampaignName(row.campaign, row.campaign ? labelMap.get(row.campaign) : null),
    })),
    convertedUsers: convertedUsers.map((row) => ({
      ...row,
      utmCampaignLabel: row.utmCampaign ? labelMap.get(row.utmCampaign) ?? null : null,
      utmCampaignDisplay: displayCampaignName(
        row.utmCampaign,
        row.utmCampaign ? labelMap.get(row.utmCampaign) : null
      ),
    })),
    recent: recent.map((row) => ({
      ...row,
      utmCampaignLabel: row.utmCampaign ? labelMap.get(row.utmCampaign) ?? null : null,
      utmCampaignDisplay: displayCampaignName(
        row.utmCampaign,
        row.utmCampaign ? labelMap.get(row.utmCampaign) : null
      ),
    })),
  };
}
