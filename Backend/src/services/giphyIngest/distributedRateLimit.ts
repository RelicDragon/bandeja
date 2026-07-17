import { getRedisClient } from '../redis/redisClient';

const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

export async function consumeDistributedRateLimit(
  key: string,
  max: number,
  windowMs: number,
  fallback: () => boolean
): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis) return fallback();
    const count = await redis.eval(FIXED_WINDOW_SCRIPT, {
      keys: [`rate-limit:${key}`],
      arguments: [String(windowMs)],
    });
    return Number(count) <= max;
  } catch {
    return fallback();
  }
}
