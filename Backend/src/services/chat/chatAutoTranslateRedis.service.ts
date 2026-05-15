import { ChatContextType } from '@prisma/client';
import { getRedisClient } from '../redis/redisClient';

const CONFIG_PREFIX = 'pp:chat:auto-translate:';
const CONFIG_TTL_SEC = 300;

function configKey(
  chatContextType: ChatContextType,
  contextId: string,
  chatTypeKey: string
): string {
  return `${CONFIG_PREFIX}${chatContextType}:${contextId}:${chatTypeKey}`;
}

export class ChatAutoTranslateRedis {
  static async getLanguageCodes(
    chatContextType: ChatContextType,
    contextId: string,
    chatTypeKey: string
  ): Promise<string[] | null> {
    const redis = await getRedisClient();
    if (!redis) return null;
    try {
      const raw = await redis.get(configKey(chatContextType, contextId, chatTypeKey));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return null;
      return parsed.filter((c): c is string => typeof c === 'string');
    } catch {
      return null;
    }
  }

  static async setLanguageCodes(
    chatContextType: ChatContextType,
    contextId: string,
    chatTypeKey: string,
    languageCodes: string[]
  ): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) return;
    try {
      await redis.set(
        configKey(chatContextType, contextId, chatTypeKey),
        JSON.stringify(languageCodes),
        { EX: CONFIG_TTL_SEC }
      );
    } catch (err) {
      console.error('[auto-translate] redis config set failed', err);
    }
  }

  static async invalidate(
    chatContextType: ChatContextType,
    contextId: string,
    chatTypeKey: string
  ): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) return;
    try {
      await redis.del(configKey(chatContextType, contextId, chatTypeKey));
    } catch {
      /* best-effort */
    }
  }
}
