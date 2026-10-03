import { createHash } from 'node:crypto';
import type { RedisClientType } from 'redis';

/**
 * A Lua script run with EVALSHA (the body is sent once per server, then by hash), falling
 * back to EVAL when the server doesn't have it cached (`NOSCRIPT`: restart, failover, flush).
 */
export class RedisScript {
  readonly sha: string;

  constructor(readonly source: string) {
    this.sha = createHash('sha1').update(source).digest('hex');
  }

  async run(client: RedisClientType, keys: string[], args: string[]): Promise<unknown> {
    try {
      return await client.evalSha(this.sha, { keys, arguments: args });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('NOSCRIPT')) throw error;
      return client.eval(this.source, { keys, arguments: args });
    }
  }
}
