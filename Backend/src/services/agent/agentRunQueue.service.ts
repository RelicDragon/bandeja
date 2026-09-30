/**
 * Agent run queue worker (`startQueueWorkers`, same shape as `TranslationQueueService`):
 * the durable queue is `AgentRun(status=QUEUED)`; this polls it every
 * `AGENT_QUEUE_POLL_INTERVAL_MS`, wakes on Redis pub/sub (`pp:agent-queue:wake`), sweeps
 * stale runs, and claims up to `AGENT_MAX_CONCURRENT_RUNS` per process.
 *
 * Always on. Without Redis the SSE event log is per-process memory,
 * so only the API process (`server.ts`) may execute runs; `worker.ts` then stays idle for
 * the agent. With Redis both processes claim.
 */
import { config } from '../../config/env';
import { getRedisSubscriber, isRedisConfigured } from '../redis/redisClient';
import { AGENT_QUEUE_WAKE_CHANNEL, getAgentRunService, setAgentWorkerRole } from './agentRun.service';

let pollTimer: ReturnType<typeof setInterval> | null = null;
let sweepTimer: ReturnType<typeof setInterval> | null = null;
let wakeSubscribed = false;

const SWEEP_EVERY_MS = 10_000;

export class AgentRunQueueService {
  static startWorker(options: { role: 'api' | 'worker' } = { role: 'api' }): void {
    if (pollTimer) return;
    const agentConfig = config.agent;
    if (options.role === 'worker' && !isRedisConfigured()) {
      console.log('[agent] run queue: worker process idle (no REDIS_URL; runs execute in the API process)');
      return;
    }
    setAgentWorkerRole(options.role);
    const service = getAgentRunService();
    void service.start().catch((error) => console.error('[agent] queue start failed', error));
    pollTimer = setInterval(() => void service.drain(), agentConfig.queuePollIntervalMs);
    pollTimer.unref?.();
    sweepTimer = setInterval(() => {
      void service.sweep().catch((error) => console.error('[agent] queue sweep failed', error));
    }, SWEEP_EVERY_MS);
    sweepTimer.unref?.();
    if (!wakeSubscribed) {
      wakeSubscribed = true;
      void (async () => {
        const sub = await getRedisSubscriber();
        if (!sub) return;
        try {
          await sub.subscribe(AGENT_QUEUE_WAKE_CHANNEL, () => void service.drain());
        } catch (error) {
          console.error('[agent] queue wake subscribe failed', error);
        }
      })();
    }
  }

  static stopWorker(): void {
    if (pollTimer) clearInterval(pollTimer);
    if (sweepTimer) clearInterval(sweepTimer);
    pollTimer = null;
    sweepTimer = null;
    getAgentRunService().stop();
  }
}
