import { getRedisClient, getRedisSubscriber } from '../redis/redisClient';

const WAKE_CHANNEL = 'pp:translation-queue:wake';
const CLAIM_KEY_PREFIX = 'pp:tq:claim:';

export class TranslationQueueRedis {
  static async publishWake(): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) return;
    try {
      await redis.publish(WAKE_CHANNEL, '1');
    } catch (err) {
      console.error('[translation-queue] redis publish wake failed', err);
    }
  }

  static async tryAcquireClaimLock(jobId: string, ttlSec: number): Promise<boolean> {
    const redis = await getRedisClient();
    if (!redis) return true;
    try {
      const ok = await redis.set(`${CLAIM_KEY_PREFIX}${jobId}`, '1', {
        NX: true,
        EX: ttlSec,
      });
      return ok === 'OK';
    } catch (err) {
      console.error('[translation-queue] redis claim lock failed', { jobId, err });
      return true;
    }
  }

  static async releaseClaimLock(jobId: string): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) return;
    try {
      await redis.del(`${CLAIM_KEY_PREFIX}${jobId}`);
    } catch {
      /* best-effort */
    }
  }

  static async startWakeListener(onWake: () => void): Promise<void> {
    const sub = await getRedisSubscriber();
    if (!sub) return;
    try {
      await sub.subscribe(WAKE_CHANNEL, () => {
        onWake();
      });
    } catch (err) {
      console.error('[translation-queue] redis wake subscribe failed', err);
    }
  }
}
