import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let subscriber: RedisClient | null = null;
let connectPromise: Promise<RedisClient | null> | null = null;

export function getRedisUrl(): string {
  return (process.env.REDIS_URL || process.env.SOCKET_IO_REDIS_URL || '').trim();
}

export function isRedisConfigured(): boolean {
  return !!getRedisUrl();
}

export async function getRedisClient(): Promise<RedisClient | null> {
  const url = getRedisUrl();
  if (!url) return null;
  if (client?.isOpen) return client;
  if (!connectPromise) {
    connectPromise = (async () => {
      try {
        const c = createClient({ url });
        c.on('error', (err) => console.error('[redis] client error', err));
        await c.connect();
        client = c;
        return c;
      } catch (err) {
        console.error('[redis] connect failed', err);
        connectPromise = null;
        return null;
      }
    })();
  }
  return connectPromise;
}

export async function getRedisSubscriber(): Promise<RedisClient | null> {
  if (subscriber?.isOpen) return subscriber;
  const main = await getRedisClient();
  if (!main) return null;
  try {
    const sub = main.duplicate();
    sub.on('error', (err) => console.error('[redis] subscriber error', err));
    await sub.connect();
    subscriber = sub;
    return sub;
  } catch (err) {
    console.error('[redis] subscriber connect failed', err);
    return null;
  }
}
