import * as cron from 'node-cron';
import { subDays } from 'date-fns';
import prisma from '../config/database';
import { BugStatus } from '@prisma/client';
import { tryGrantBugShippedAchievementById } from './achievements/bugShippedGrant.service';

const TEST_TO_FINISHED_DAYS = 15;
const FINISHED_TO_ARCHIVED_DAYS = 3;

export class BugArchivedScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private running = false;

  start() {
    const tz = process.env.TZ || 'local';
    console.log(`🐛 Bug archived scheduler started (daily 04:30, TZ=${tz})`);
    this.cronJob = cron.schedule('30 4 * * *', () => this.run());
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    const maxAttempts = 2;
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const now = new Date();
          const testCutoff = subDays(now, TEST_TO_FINISHED_DAYS);
          const staleTestBugs = await prisma.bug.findMany({
            where: {
              status: BugStatus.TEST,
              testingStartedAt: { not: null, lt: testCutoff },
            },
            select: { id: true },
          });
          for (const row of staleTestBugs) {
            await prisma.bug.update({
              where: { id: row.id },
              data: { status: BugStatus.FINISHED, finishedAt: now },
            });
            await tryGrantBugShippedAchievementById(row.id).catch((err: unknown) =>
              console.error(`Bug shipped grant failed for ${row.id}:`, err),
            );
          }
          if (staleTestBugs.length > 0) {
            console.log(
              `🐛 Bug archived scheduler: ${staleTestBugs.length} bug(s) TEST→FINISHED (15d)`,
            );
          }

          const finishedCutoff = subDays(now, FINISHED_TO_ARCHIVED_DAYS);
          const result = await prisma.bug.updateMany({
            where: {
              status: BugStatus.FINISHED,
              finishedAt: { not: null, lt: finishedCutoff },
            },
            data: { status: BugStatus.ARCHIVED },
          });
          if (result.count > 0) {
            console.log(`🐛 Bug archived: ${result.count} bug(s) moved to ARCHIVED`);
          }
          return;
        } catch (error) {
          console.error(`Bug archived scheduler error (attempt ${attempt}/${maxAttempts}):`, error);
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 5000));
          }
        }
      }
    } finally {
      this.running = false;
    }
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Bug archived scheduler stopped');
    }
  }
}
