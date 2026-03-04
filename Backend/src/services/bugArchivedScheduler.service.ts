import * as cron from 'node-cron';
import { subDays } from 'date-fns';
import prisma from '../config/database';
import { BugStatus } from '@prisma/client';

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
          const testResult = await prisma.bug.updateMany({
            where: {
              status: BugStatus.TEST,
              testingStartedAt: { not: null, lt: testCutoff },
            },
            data: { status: BugStatus.FINISHED, finishedAt: now, testingStartedAt: null },
          });
          if (testResult.count > 0) {
            console.log(`🐛 Bug archived scheduler: ${testResult.count} bug(s) TEST→FINISHED (15d)`);
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
