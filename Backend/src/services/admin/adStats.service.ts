import { AdEventType, AdPlacementKey } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';

export type AdStatsFilters = {
  startDate?: string;
  endDate?: string;
  placement?: AdPlacementKey;
  cityId?: string;
  locale?: string;
  view?: 'sponsor' | 'campaign';
};

function parseDateRange(filters: AdStatsFilters) {
  const start = filters.startDate ? new Date(filters.startDate) : undefined;
  const end = filters.endDate ? new Date(filters.endDate) : undefined;
  if (start && Number.isNaN(start.getTime())) throw new ApiError(400, 'Invalid startDate');
  if (end && Number.isNaN(end.getTime())) throw new ApiError(400, 'Invalid endDate');
  return { start, end };
}

export class AdminAdStatsService {
  static async campaignStats(campaignId: string, filters: AdStatsFilters) {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true, sponsorId: true },
    });
    if (!campaign) throw new ApiError(404, 'Campaign not found');

    const { start, end } = parseDateRange(filters);

    const rollupWhere: Record<string, unknown> = { campaignId };
    if (start || end) {
      rollupWhere.date = {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      };
    }
    if (filters.placement) rollupWhere.placement = filters.placement;
    if (filters.cityId) rollupWhere.cityId = filters.cityId;
    if (filters.locale) rollupWhere.locale = filters.locale;

    const rollups = await prisma.adCampaignDailyStats.findMany({
      where: rollupWhere,
      orderBy: [{ date: 'asc' }, { placement: 'asc' }],
    });

    const totals = rollups.reduce(
      (acc, row) => ({
        impressions: acc.impressions + row.impressions,
        uniqueUsers: acc.uniqueUsers + row.uniqueUsers,
        clicks: acc.clicks + row.clicks,
        dismisses: acc.dismisses + row.dismisses,
      }),
      { impressions: 0, uniqueUsers: 0, clicks: 0, dismisses: 0 }
    );

    const useRaw =
      !start ||
      start > new Date(Date.now() - 90 * 86400000);

    let rawBreakdown: Array<{
      placement: AdPlacementKey;
      cityId: string | null;
      locale: string | null;
      impressions: number;
      clicks: number;
      dismisses: number;
      uniqueUsers: number;
    }> = [];

    if (useRaw) {
      const eventWhere: Record<string, unknown> = { campaignId };
      if (start || end) {
        eventWhere.createdAt = {
          ...(start ? { gte: start } : {}),
          ...(end ? { lte: end } : {}),
        };
      }
      if (filters.placement) eventWhere.placement = filters.placement;
      if (filters.cityId) eventWhere.cityId = filters.cityId;
      if (filters.locale) eventWhere.locale = filters.locale;

      const events = await prisma.adEvent.findMany({
        where: eventWhere,
        select: {
          type: true,
          placement: true,
          cityId: true,
          locale: true,
          userId: true,
        },
      });

      const map = new Map<string, typeof rawBreakdown[0] & { users: Set<string> }>();
      for (const evt of events) {
        const key = `${evt.placement}|${evt.cityId ?? ''}|${evt.locale ?? ''}`;
        let row = map.get(key);
        if (!row) {
          row = {
            placement: evt.placement,
            cityId: evt.cityId,
            locale: evt.locale,
            impressions: 0,
            clicks: 0,
            dismisses: 0,
            uniqueUsers: 0,
            users: new Set(),
          };
          map.set(key, row);
        }
        if (evt.type === AdEventType.IMPRESSION) row.impressions += 1;
        if (evt.type === AdEventType.CLICK) row.clicks += 1;
        if (evt.type === AdEventType.DISMISS) row.dismisses += 1;
        if (evt.userId) row.users.add(evt.userId);
      }
      rawBreakdown = [...map.values()].map(({ users, ...rest }) => ({
        ...rest,
        uniqueUsers: users.size,
      }));
    }

    return {
      campaign,
      totals,
      rollups,
      rawBreakdown,
      ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
      dismissRate: totals.impressions > 0 ? totals.dismisses / totals.impressions : 0,
    };
  }

  static async sponsorStats(sponsorId: string, filters: AdStatsFilters) {
    const sponsor = await prisma.adSponsor.findUnique({ where: { id: sponsorId } });
    if (!sponsor) throw new ApiError(404, 'Sponsor not found');

    const { start, end } = parseDateRange(filters);

    const rollupWhere: Record<string, unknown> = { sponsorId };
    if (start || end) {
      rollupWhere.date = {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      };
    }
    if (filters.placement) rollupWhere.placement = filters.placement;
    if (filters.cityId) rollupWhere.cityId = filters.cityId;
    if (filters.locale) rollupWhere.locale = filters.locale;

    const rollups = await prisma.adCampaignDailyStats.findMany({
      where: rollupWhere,
      orderBy: [{ date: 'asc' }, { campaignId: 'asc' }],
      include: {
        campaign: { select: { id: true, name: true } },
      },
    });

    const totals = rollups.reduce(
      (acc, row) => ({
        impressions: acc.impressions + row.impressions,
        uniqueUsers: acc.uniqueUsers + row.uniqueUsers,
        clicks: acc.clicks + row.clicks,
        dismisses: acc.dismisses + row.dismisses,
      }),
      { impressions: 0, uniqueUsers: 0, clicks: 0, dismisses: 0 }
    );

    const byCampaign = new Map<
      string,
      { campaignId: string; name: string; impressions: number; clicks: number; dismisses: number }
    >();
    for (const row of rollups) {
      const existing = byCampaign.get(row.campaignId) ?? {
        campaignId: row.campaignId,
        name: row.campaign.name,
        impressions: 0,
        clicks: 0,
        dismisses: 0,
      };
      existing.impressions += row.impressions;
      existing.clicks += row.clicks;
      existing.dismisses += row.dismisses;
      byCampaign.set(row.campaignId, existing);
    }

    return {
      sponsor,
      totals,
      rollups,
      byCampaign: [...byCampaign.values()],
      ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
    };
  }

  static async overviewStats(filters: AdStatsFilters) {
    const { start, end } = parseDateRange(filters);

    const rollupWhere: Record<string, unknown> = {};
    if (start || end) {
      rollupWhere.date = {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      };
    }
    if (filters.placement) rollupWhere.placement = filters.placement;
    if (filters.cityId) rollupWhere.cityId = filters.cityId;
    if (filters.locale) rollupWhere.locale = filters.locale;

    const rollups = await prisma.adCampaignDailyStats.findMany({
      where: rollupWhere,
      orderBy: [{ date: 'asc' }, { placement: 'asc' }, { campaignId: 'asc' }],
      include: {
        campaign: { select: { id: true, name: true, sponsorId: true } },
      },
    });

    const totals = rollups.reduce(
      (acc, row) => ({
        impressions: acc.impressions + row.impressions,
        uniqueUsers: acc.uniqueUsers + row.uniqueUsers,
        clicks: acc.clicks + row.clicks,
        dismisses: acc.dismisses + row.dismisses,
      }),
      { impressions: 0, uniqueUsers: 0, clicks: 0, dismisses: 0 }
    );

    return {
      view: filters.view ?? 'campaign',
      totals,
      rollups,
      ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
      dismissRate: totals.impressions > 0 ? totals.dismisses / totals.impressions : 0,
    };
  }
}
