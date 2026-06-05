import * as cron from 'node-cron';
import { AdCampaignStatus } from '@prisma/client';
import prisma from '../config/database';
import { AdCampaignCache } from './ads/ad.cache';

export class AdCampaignScheduleScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private running = false;

  start() {
    console.log('📢 Ad campaign schedule scheduler started (every 10 min)');
    this.cronJob = cron.schedule('*/10 * * * *', () => this.run());
    void this.run();
  }

  async run() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      let changed = 0;

      const toActivate = await prisma.adCampaign.updateMany({
        where: {
          status: AdCampaignStatus.SCHEDULED,
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        data: { status: AdCampaignStatus.ACTIVE },
      });
      changed += toActivate.count;

      const toEnd = await prisma.adCampaign.updateMany({
        where: {
          status: { in: [AdCampaignStatus.ACTIVE, AdCampaignStatus.SCHEDULED, AdCampaignStatus.PAUSED] },
          endsAt: { lte: now },
        },
        data: { status: AdCampaignStatus.ENDED },
      });
      changed += toEnd.count;

      const toSchedule = await prisma.adCampaign.updateMany({
        where: {
          status: AdCampaignStatus.DRAFT,
          startsAt: { gt: now },
        },
        data: { status: AdCampaignStatus.SCHEDULED },
      });
      changed += toSchedule.count;

      if (changed > 0) {
        AdCampaignCache.clearCache();
        console.log(`📢 Ad schedule cron: updated ${changed} campaign(s)`);
      }
    } catch (error) {
      console.error('Ad campaign schedule scheduler error:', error);
    } finally {
      this.running = false;
    }
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Ad campaign schedule scheduler stopped');
    }
  }
}
