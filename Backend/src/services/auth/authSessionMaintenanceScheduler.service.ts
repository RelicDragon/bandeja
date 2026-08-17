import * as cron from 'node-cron';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { reportCriticalError } from '../developerAlert.service';
import { purgeOldRefreshSessions } from './userRefreshSession.service';

export type AuthRefreshWindow = {
  attempts: number;
  failures: number;
  failurePercent: number;
  averageDurationMs: number;
  outcomes: Record<string, number>;
  platforms: Record<string, number>;
};

export function summarizeAuthRefreshWindow(
  events: Array<{ outcome: string; platform: string; durationMs: number }>
): AuthRefreshWindow {
  const outcomes: Record<string, number> = {};
  const platforms: Record<string, number> = {};
  let failures = 0;
  let durationTotal = 0;
  for (const event of events) {
    outcomes[event.outcome] = (outcomes[event.outcome] ?? 0) + 1;
    platforms[event.platform] = (platforms[event.platform] ?? 0) + 1;
    if (event.outcome !== 'success') failures += 1;
    durationTotal += Math.max(0, event.durationMs);
  }
  return {
    attempts: events.length,
    failures,
    failurePercent: events.length > 0 ? Math.round((failures / events.length) * 100) : 0,
    averageDurationMs: events.length > 0 ? Math.round(durationTotal / events.length) : 0,
    outcomes,
    platforms,
  };
}

export function shouldAlertAuthRefreshWindow(window: AuthRefreshWindow): boolean {
  return (
    window.attempts >= config.authRefreshAlertMinAttempts &&
    window.failurePercent >= config.authRefreshAlertFailurePercent
  );
}

export class AuthSessionMaintenanceScheduler {
  private monitorJob: cron.ScheduledTask | null = null;
  private cleanupJob: cron.ScheduledTask | null = null;
  private monitoring = false;
  private cleaning = false;

  start(): void {
    const tz = process.env.TZ || 'local';
    console.log(`🔐 Auth session monitor started (every 5m; cleanup daily 05:25, TZ=${tz})`);
    this.monitorJob = cron.schedule('*/5 * * * *', () => void this.monitor());
    this.cleanupJob = cron.schedule('25 5 * * *', () => void this.cleanup());
  }

  private async monitor(): Promise<void> {
    if (this.monitoring || config.nodeEnv !== 'production') return;
    this.monitoring = true;
    try {
      await prisma.$transaction(async (tx) => {
        const lock = await tx.$queryRaw<Array<{ locked: boolean }>>`
          SELECT pg_try_advisory_xact_lock(7263348101) AS locked
        `;
        if (!lock[0]?.locked) return;
        const since = new Date(Date.now() - 15 * 60 * 1000);
        const events = await tx.authRefreshEvent.findMany({
          where: { createdAt: { gte: since } },
          select: { outcome: true, platform: true, durationMs: true },
        });
        const summary = summarizeAuthRefreshWindow(events);
        if (!shouldAlertAuthRefreshWindow(summary)) return;
        await reportCriticalError(
          new Error(
            `Auth refresh degradation: ${summary.failures}/${summary.attempts} failed (${summary.failurePercent}%)`
          ),
          JSON.stringify(summary)
        );
      });
    } catch (error) {
      console.error('Auth refresh monitor error:', error);
    } finally {
      this.monitoring = false;
    }
  }

  private async cleanup(): Promise<void> {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      const eventCutoff = new Date(
        Date.now() - config.authRefreshEventRetentionDays * 24 * 60 * 60 * 1000
      );
      const [sessionsRemoved, eventsRemoved] = await Promise.all([
        purgeOldRefreshSessions(),
        prisma.authRefreshEvent.deleteMany({ where: { createdAt: { lt: eventCutoff } } }),
      ]);
      if (sessionsRemoved > 0 || eventsRemoved.count > 0) {
        console.log(
          `[auth-maintenance] purged sessions=${sessionsRemoved} refreshEvents=${eventsRemoved.count}`
        );
      }
    } catch (error) {
      console.error('Auth session cleanup error:', error);
    } finally {
      this.cleaning = false;
    }
  }

  stop(): void {
    this.monitorJob?.stop();
    this.cleanupJob?.stop();
    this.monitorJob = null;
    this.cleanupJob = null;
  }
}
