import { getRedisClient, getRedisSubscriber } from '../redis/redisClient';

/** Separate from chat `pp:translation-queue:wake`. */
const WAKE_CHANNEL = 'pp:game-text-translation-queue:wake';

export class GameTextTranslationQueueRedis {
  static async publishWake(): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) return;
    try {
      await redis.publish(WAKE_CHANNEL, '1');
    } catch (err) {
      console.error('[game-text-translation-queue] redis publish wake failed', err);
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
      console.error('[game-text-translation-queue] redis wake subscribe failed', err);
    }
  }
}
