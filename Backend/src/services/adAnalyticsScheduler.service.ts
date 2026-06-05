import * as cron from 'node-cron';
import { subDays, startOfDay } from 'date-fns';
import { AdEventType, Prisma } from '@prisma/client';
import prisma from '../config/database';

export class AdAnalyticsScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private running = false;

  start() {
    const tz = process.env.TZ || 'local';
    console.log(`📊 Ad analytics scheduler started (daily 03:00, TZ=${tz})`);
    this.cronJob = cron.schedule('0 3 * * *', () => this.run());
  }

  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.rollupYesterday();
      await this.purgeOldEvents();
    } catch (error) {
      console.error('Ad analytics scheduler error:', error);
    } finally {
      this.running = false;
    }
  }

  async rollupYesterday() {
    const yesterday = startOfDay(subDays(new Date(), 1));
    const dayEnd = startOfDay(new Date());

    const events = await prisma.adEvent.findMany({
      where: {
        createdAt: { gte: yesterday, lt: dayEnd },
      },
      select: {
        type: true,
        campaignId: true,
        placement: true,
        cityId: true,
        locale: true,
        userId: true,
        campaign: { select: { sponsorId: true } },
      },
    });

    type BucketKey = string;
    const buckets = new Map<
      BucketKey,
      {
        campaignId: string;
        sponsorId: string;
        placement: typeof events[0]['placement'];
        cityId: string | null;
        locale: string | null;
        impressions: number;
        clicks: number;
        dismisses: number;
        userIds: Set<string>;
      }
    >();

    for (const evt of events) {
      const key = `${evt.campaignId}|${evt.placement}|${evt.cityId ?? ''}|${evt.locale ?? ''}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          campaignId: evt.campaignId,
          sponsorId: evt.campaign.sponsorId,
          placement: evt.placement,
          cityId: evt.cityId,
          locale: evt.locale,
          impressions: 0,
          clicks: 0,
          dismisses: 0,
          userIds: new Set(),
        };
        buckets.set(key, bucket);
      }

      if (evt.type === AdEventType.IMPRESSION) bucket.impressions += 1;
      if (evt.type === AdEventType.CLICK) bucket.clicks += 1;
      if (evt.type === AdEventType.DISMISS) bucket.dismisses += 1;
      if (evt.userId) bucket.userIds.add(evt.userId);
    }

    for (const bucket of buckets.values()) {
      await prisma.adCampaignDailyStats.upsert({
        where: {
          campaignId_date_placement_cityId_locale: {
            campaignId: bucket.campaignId,
            date: yesterday,
            placement: bucket.placement,
            cityId: bucket.cityId,
            locale: bucket.locale,
          } as Prisma.AdCampaignDailyStatsCampaignIdDatePlacementCityIdLocaleCompoundUniqueInput,
        },
        create: {
          campaignId: bucket.campaignId,
          sponsorId: bucket.sponsorId,
          date: yesterday,
          placement: bucket.placement,
          cityId: bucket.cityId,
          locale: bucket.locale,
          impressions: bucket.impressions,
          uniqueUsers: bucket.userIds.size,
          clicks: bucket.clicks,
          dismisses: bucket.dismisses,
        },
        update: {
          impressions: bucket.impressions,
          uniqueUsers: bucket.userIds.size,
          clicks: bucket.clicks,
          dismisses: bucket.dismisses,
        },
      });
    }

    if (buckets.size > 0) {
      console.log(`📊 Ad rollup: ${buckets.size} stat row(s) for ${yesterday.toISOString().slice(0, 10)}`);
    }
  }

  async purgeOldEvents() {
    const cutoff = subDays(new Date(), 90);
    const result = await prisma.adEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      console.log(`📊 Ad purge: removed ${result.count} event(s) older than 90 days`);
    }
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Ad analytics scheduler stopped');
    }
  }
}
