import { createHash, randomUUID } from 'node:crypto';
import { getRedisClient } from '../redis/redisClient';

type CachedImportResult = {
  mediaUrl: string;
  thumbnailUrl: string;
};

const RESULT_TTL_SECONDS = 24 * 60 * 60;
const LOCK_TTL_MS = 60_000;
const WAIT_ATTEMPTS = 150;
const WAIT_INTERVAL_MS = 200;
const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

function cacheKey(downloadUrl: string): string {
  return `gif-import:v1:${createHash('sha256').update(downloadUrl).digest('hex')}`;
}

function parseResult(raw: string | null): CachedImportResult | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CachedImportResult>;
    if (
      typeof value.mediaUrl !== 'string' ||
      !value.mediaUrl ||
      typeof value.thumbnailUrl !== 'string' ||
      !value.thumbnailUrl
    ) {
      return null;
    }
    return { mediaUrl: value.mediaUrl, thumbnailUrl: value.thumbnailUrl };
  } catch {
    return null;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function cachedGifImportResult(
  downloadUrl: string,
  work: () => Promise<CachedImportResult | null>
): Promise<CachedImportResult | null> {
  const redis = await getRedisClient();
  if (!redis) return work();

  const resultKey = cacheKey(downloadUrl);
  const lockKey = `${resultKey}:lock`;
  try {
    const cached = parseResult(await redis.get(resultKey));
    if (cached) return cached;
  } catch {
    return work();
  }

  const lockToken = randomUUID();
  let acquired = false;
  try {
    acquired =
      (await redis.set(lockKey, lockToken, { NX: true, PX: LOCK_TTL_MS })) === 'OK';
  } catch {
    return work();
  }

  if (!acquired) {
    for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt += 1) {
      await wait(WAIT_INTERVAL_MS);
      try {
        const cached = parseResult(await redis.get(resultKey));
        if (cached) return cached;
      } catch {
        return work();
      }
    }
    return work();
  }

  try {
    const result = await work();
    if (result) {
      await redis.set(resultKey, JSON.stringify(result), { EX: RESULT_TTL_SECONDS }).catch(() => {});
    }
    return result;
  } finally {
    await redis
      .eval(RELEASE_LOCK_SCRIPT, { keys: [lockKey], arguments: [lockToken] })
      .catch(() => {});
  }
}
