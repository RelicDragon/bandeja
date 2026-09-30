/**
 * Small persistent state of the Telegram assistant — no schema change:
 *
 * - **Assistant mode** per Telegram user (`pp:agent:tg:mode:{telegramId}`, sliding 24h TTL).
 *   While on, plain text in the private chat goes to the agent.
 * - **Run bindings** (`pp:agent:tg:run:{runId}` + index set `pp:agent:tg:runs`, 2h TTL):
 *   which Telegram message shows which run, so a bot restart can re-attach and finish it.
 *
 * Redis when `REDIS_URL` is set (survives restarts), else process memory (a restart then
 * forgets both: the mode is off and in-flight status messages are left as they were — only
 * relevant for local dev without Redis).
 */
import { getRedisClient, isRedisConfigured } from '../../redis/redisClient';

export type AgentBotRunBinding = {
  runId: string;
  userId: string;
  telegramChatId: number;
  statusMessageId: number;
  lang: string;
  /** The user's zone (current city) for booking / slot tz labels; absent on older bindings. */
  timeZone?: string | null;
  createdAt: number;
};

export interface AgentBotKv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  del(key: string): Promise<void>;
  sAdd(key: string, member: string): Promise<void>;
  sRem(key: string, member: string): Promise<void>;
  sMembers(key: string): Promise<string[]>;
}

export class MemoryAgentBotKv implements AgentBotKv {
  private readonly values = new Map<string, { value: string; expiresAt: number }>();
  private readonly sets = new Map<string, Set<string>>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async get(key: string): Promise<string | null> {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    this.values.set(key, { value, expiresAt: this.now() + ttlSec * 1000 });
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }

  async sAdd(key: string, member: string): Promise<void> {
    const set = this.sets.get(key) ?? new Set<string>();
    set.add(member);
    this.sets.set(key, set);
  }

  async sRem(key: string, member: string): Promise<void> {
    this.sets.get(key)?.delete(member);
  }

  async sMembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }
}

class RedisAgentBotKv implements AgentBotKv {
  private async client() {
    const redis = await getRedisClient();
    if (!redis) throw new Error('Redis unavailable');
    return redis;
  }

  async get(key: string): Promise<string | null> {
    const value = await (await this.client()).get(key);
    return value === null ? null : String(value);
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    await (await this.client()).set(key, value, { expiration: { type: 'EX', value: ttlSec } });
  }

  async del(key: string): Promise<void> {
    await (await this.client()).del(key);
  }

  async sAdd(key: string, member: string): Promise<void> {
    await (await this.client()).sAdd(key, member);
  }

  async sRem(key: string, member: string): Promise<void> {
    await (await this.client()).sRem(key, member);
  }

  async sMembers(key: string): Promise<string[]> {
    return (await (await this.client()).sMembers(key)).map(String);
  }
}

const MODE_PREFIX = 'pp:agent:tg:mode:';
const RUN_PREFIX = 'pp:agent:tg:run:';
const RUN_INDEX = 'pp:agent:tg:runs';
export const AGENT_BOT_MODE_TTL_SEC = 24 * 60 * 60;
export const AGENT_BOT_BINDING_TTL_SEC = 2 * 60 * 60;

export class AgentBotStateStore {
  constructor(private readonly kv: AgentBotKv) {}

  async isAssistantMode(telegramId: string): Promise<boolean> {
    try {
      return (await this.kv.get(MODE_PREFIX + telegramId)) === '1';
    } catch (error) {
      console.error('[telegram-agent] mode read failed', error);
      return false;
    }
  }

  /** On, or refreshed (sliding TTL) on every assistant interaction. */
  async enterAssistantMode(telegramId: string): Promise<void> {
    await this.kv.set(MODE_PREFIX + telegramId, '1', AGENT_BOT_MODE_TTL_SEC);
  }

  async exitAssistantMode(telegramId: string): Promise<void> {
    await this.kv.del(MODE_PREFIX + telegramId);
  }

  async saveBinding(binding: AgentBotRunBinding): Promise<void> {
    await this.kv.set(RUN_PREFIX + binding.runId, JSON.stringify(binding), AGENT_BOT_BINDING_TTL_SEC);
    await this.kv.sAdd(RUN_INDEX, binding.runId);
  }

  async getBinding(runId: string): Promise<AgentBotRunBinding | null> {
    const raw = await this.kv.get(RUN_PREFIX + runId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AgentBotRunBinding;
    } catch {
      return null;
    }
  }

  async removeBinding(runId: string): Promise<void> {
    await this.kv.del(RUN_PREFIX + runId);
    await this.kv.sRem(RUN_INDEX, runId);
  }

  /** Every live binding; index entries whose binding expired are pruned. */
  async listBindings(): Promise<AgentBotRunBinding[]> {
    const out: AgentBotRunBinding[] = [];
    for (const runId of await this.kv.sMembers(RUN_INDEX)) {
      const binding = await this.getBinding(runId);
      if (binding) out.push(binding);
      else await this.kv.sRem(RUN_INDEX, runId);
    }
    return out;
  }
}

let defaultStore: AgentBotStateStore | null = null;

export function getAgentBotStateStore(): AgentBotStateStore {
  if (!defaultStore) {
    defaultStore = new AgentBotStateStore(isRedisConfigured() ? new RedisAgentBotKv() : new MemoryAgentBotKv());
  }
  return defaultStore;
}
