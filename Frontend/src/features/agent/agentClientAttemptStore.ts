import type { AgentClientPlan, AgentClientReportResult } from '@shared/agentContract';

/**
 * Local record of a client-executed action attempt (booking plan §14.5 step 6). Written
 * before and after every provider call so a crash / app kill never runs a provider call
 * twice for one `attemptId`, and results that never reached the server are re-reported.
 *
 * - `claimed`: lease taken, no provider call started yet.
 * - `running`: provider call `inFlight` started; its outcome is unknown until it returns.
 * - `ran`: every call finished; `results` still has to be reported.
 * - `abandoned`: died mid-call with nothing known to have succeeded; never reported or re-run
 *   (the lease sweep makes it UNKNOWN); dropped once the lease is over.
 * - `rolling_back`: a multi-court booking failed part-way (`plan.rollbackOnPartial`) and the
 *   courts already booked are being cancelled again; `rollbackInFlight` is the cancel running.
 */
export type AgentClientAttemptPhase = 'claimed' | 'running' | 'ran' | 'abandoned' | 'rolling_back';

export interface StoredAgentClientAttempt {
  actionId: string;
  chatId: string;
  attemptId: string;
  leaseExpiresAt: string | null;
  plan: AgentClientPlan;
  phase: AgentClientAttemptPhase;
  results: AgentClientReportResult[];
  /** Index of the provider call in flight (phase `running`). */
  inFlight: number | null;
  /** Phase `rolling_back`: index into `results` of the undo (cancel) in flight. */
  rollbackInFlight?: number | null;
  updatedAt: number;
}

export interface AgentClientAttemptStorage {
  get(actionId: string): StoredAgentClientAttempt | null;
  list(): StoredAgentClientAttempt[];
  put(attempt: StoredAgentClientAttempt): void;
  remove(actionId: string): void;
}

const ATTEMPTS_KEY = 'pp:agent:client-attempts:v1';
const CLIENT_KEY = 'pp:agent:client-key:v1';
/** Attempts older than this are dropped: the server long since settled them (UNKNOWN or late report). */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Backing = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultBacking(): Backing | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readAll(backing: Backing | null): Record<string, StoredAgentClientAttempt> {
  if (!backing) return {};
  try {
    const raw = backing.getItem(ATTEMPTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, StoredAgentClientAttempt>) : {};
  } catch {
    return {};
  }
}

function writeAll(backing: Backing | null, all: Record<string, StoredAgentClientAttempt>): void {
  if (!backing) return;
  if (Object.keys(all).length === 0) backing.removeItem(ATTEMPTS_KEY);
  else backing.setItem(ATTEMPTS_KEY, JSON.stringify(all));
}

export function createAgentClientAttemptStorage(
  backing: Backing | null = defaultBacking(),
  now: () => number = Date.now,
): AgentClientAttemptStorage {
  const load = () => {
    const all = readAll(backing);
    const cutoff = now() - MAX_AGE_MS;
    let pruned = false;
    for (const [id, attempt] of Object.entries(all)) {
      if (!attempt || typeof attempt.updatedAt !== 'number' || attempt.updatedAt < cutoff) {
        delete all[id];
        pruned = true;
      }
    }
    if (pruned) writeAll(backing, all);
    return all;
  };
  return {
    get: (actionId) => load()[actionId] ?? null,
    list: () => Object.values(load()),
    put: (attempt) => {
      const all = load();
      all[attempt.actionId] = { ...attempt, updatedAt: now() };
      writeAll(backing, all);
    },
    remove: (actionId) => {
      const all = load();
      if (!(actionId in all)) return;
      delete all[actionId];
      writeAll(backing, all);
    },
  };
}

function randomKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stable per-device key for `/claim`: a repeated claim from this device within the lease
 * gets the same attempt; another device gets 409 `ACTION_HANDLED`.
 */
export function getAgentClientKey(backing: Backing | null = defaultBacking()): string {
  try {
    const existing = backing?.getItem(CLIENT_KEY);
    if (existing && existing.length >= 8) return existing;
    const key = randomKey();
    backing?.setItem(CLIENT_KEY, key);
    return key;
  } catch {
    return randomKey();
  }
}
