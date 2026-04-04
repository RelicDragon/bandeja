import * as cron from 'node-cron';
import prisma from '../config/database';
import { ChatSyncEventService } from './chat/chatSyncEvent.service';
import { ChatMutationIdempotencyService } from './chat/chatMutationIdempotency.service';

/**
 * Weekly Mon 05:30: optional stats log (CHAT_SYNC_STATS_LOG=true) and/or retention prune
 * (CHAT_SYNC_EVENT_RETENTION_DAYS > 0).
 */
export class ChatSyncStatsScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private running = false;

  start(): void {
    const logStats = process.env.CHAT_SYNC_STATS_LOG === 'true';
    const retentionDays = parseInt(process.env.CHAT_SYNC_EVENT_RETENTION_DAYS ?? '0', 10);
    const idemDays = parseInt(process.env.CHAT_MUTATION_IDEM_RETENTION_DAYS ?? '0', 10);
    if (!logStats && !(retentionDays > 0) && !(idemDays > 0)) return;
    const tz = process.env.TZ || 'local';
    console.log(
      `📊 Chat sync scheduler (weekly Mon 05:30, TZ=${tz}) stats=${logStats} retentionDays=${retentionDays} idemRetentionDays=${idemDays}`
    );
    this.cronJob = cron.schedule('30 5 * * 1', () => void this.run());
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      if (process.env.CHAT_SYNC_STATS_LOG === 'true') {
        const count = await prisma.chatSyncEvent.count();
        const oldest = await prisma.chatSyncEvent.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        });
        const newest = await prisma.chatSyncEvent.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        const syncContexts = await prisma.conversationSyncState.count();
        console.log(
          `[ChatSyncEvent] rows=${count} contexts=${syncContexts} oldest=${oldest?.createdAt?.toISOString() ?? 'n/a'} newest=${newest?.createdAt?.toISOString() ?? 'n/a'}`
        );
      }
      const retentionDays = parseInt(process.env.CHAT_SYNC_EVENT_RETENTION_DAYS ?? '0', 10);
      if (retentionDays > 0) {
        const removed = await ChatSyncEventService.pruneEventsOlderThanDays(retentionDays);
        if (removed > 0) {
          console.log(`[ChatSyncEvent] pruned ${removed} rows older than ${retentionDays}d`);
        }
      }
      const idemDays = parseInt(process.env.CHAT_MUTATION_IDEM_RETENTION_DAYS ?? '0', 10);
      if (idemDays > 0) {
        const pruned = await ChatMutationIdempotencyService.purgeOlderThanDays(idemDays);
        if (pruned > 0) {
          console.log(`[ChatMutationIdempotency] pruned ${pruned} rows older than ${idemDays}d`);
        }
      }
    } catch (error) {
      console.error('Chat sync stats scheduler error:', error);
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
  }
}
