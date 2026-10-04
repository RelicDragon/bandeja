/**
 * Per-user daily budget of the AI agent (phase 5, docs/domains/agent.md § Budget).
 *
 * The unit is the budget token of `agentTokensUsedToday` (LLM tokens with cache hits weighted,
 * plus web / voice token-equivalents), counted per UTC day. Which budget a user gets, first match:
 *
 *   1. a per-user override: `AGENT_USER_DAILY_TOKEN_BUDGETS` PlatformSetting, a JSON object
 *      `{ "<userId>": <tokens> }` (0 = that user is paused; for testers, heavy users, abuse);
 *   2. platform admins (`User.isAdmin`): `AGENT_ADMIN_DAILY_TOKEN_BUDGET` row, else the env
 *      `AGENT_ADMIN_DAILY_TOKEN_BUDGET` (default 10M: higher, not unlimited, so a runaway loop
 *      still stops);
 *   3. everyone else: `AGENT_DAILY_TOKEN_BUDGET` row, else the env (default 1.5M).
 *
 * Rows go through `platformSetting.service.ts` (60 s per-process cache; Admin → Platform settings).
 * A malformed row is ignored (the next source wins); a settings read failure falls back to the env.
 */
import prisma from '../../config/database';
import type { AgentEnvConfig } from '../../config/agentEnv';
import { PLATFORM_SETTING_KEYS, getSetting } from '../platformSetting.service';

export const AGENT_BUDGET_SETTING_KEYS = {
  USER: PLATFORM_SETTING_KEYS.AGENT_DAILY_TOKEN_BUDGET,
  ADMIN: PLATFORM_SETTING_KEYS.AGENT_ADMIN_DAILY_TOKEN_BUDGET,
  PER_USER: PLATFORM_SETTING_KEYS.AGENT_USER_DAILY_TOKEN_BUDGETS,
} as const;

/** Upper bound of any configured budget (also caps a typo with extra zeros). */
export const AGENT_BUDGET_MAX_TOKENS = 1_000_000_000;

export type AgentBudgetConfig = Pick<AgentEnvConfig, 'dailyTokenBudget' | 'adminDailyTokenBudget'>;

export type AgentBudgetSource = 'user' | 'admin' | 'override';

export type AgentDailyBudget = { tokens: number; source: AgentBudgetSource };

type SettingReader = (key: string) => Promise<string | null>;

/** A whole, non-negative token count from a setting value; null when it isn't one. */
export function parseAgentBudgetTokens(raw: unknown): number | null {
  const value = typeof raw === 'string' ? (raw.trim() === '' ? NaN : Number(raw.trim())) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.min(Math.floor(value), AGENT_BUDGET_MAX_TOKENS);
}

/** `{ "<userId>": <tokens> }` → map; invalid JSON / entries are skipped. */
export function parseAgentUserBudgetOverrides(raw: string | null): Map<string, number> {
  const overrides = new Map<string, number>();
  if (!raw) return overrides;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return overrides;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return overrides;
  for (const [userId, value] of Object.entries(parsed as Record<string, unknown>)) {
    const tokens = parseAgentBudgetTokens(value);
    if (userId.trim() && tokens != null) overrides.set(userId.trim(), tokens);
  }
  return overrides;
}

async function readSafe(read: SettingReader, key: string): Promise<string | null> {
  try {
    return await read(key);
  } catch {
    return null;
  }
}

/** The tier budgets after PlatformSetting rows (no per-user override): what the admin page shows. */
export async function resolveAgentBudgetTiers(
  base: AgentBudgetConfig,
  read: SettingReader = getSetting,
): Promise<{ user: number; admin: number; overrides: number }> {
  const [userRaw, adminRaw, perUserRaw] = await Promise.all([
    readSafe(read, AGENT_BUDGET_SETTING_KEYS.USER),
    readSafe(read, AGENT_BUDGET_SETTING_KEYS.ADMIN),
    readSafe(read, AGENT_BUDGET_SETTING_KEYS.PER_USER),
  ]);
  return {
    user: parseAgentBudgetTokens(userRaw) ?? base.dailyTokenBudget,
    admin: parseAgentBudgetTokens(adminRaw) ?? base.adminDailyTokenBudget,
    overrides: parseAgentUserBudgetOverrides(perUserRaw).size,
  };
}

/**
 * The user's budget for today. `isAdmin` saves the user lookup when the caller has a principal;
 * without it the flag is read from the DB (unknown user = normal tier).
 */
export async function resolveAgentDailyBudget(
  userId: string,
  base: AgentBudgetConfig,
  options: { isAdmin?: boolean; read?: SettingReader } = {},
): Promise<AgentDailyBudget> {
  const read = options.read ?? getSetting;
  const override = parseAgentUserBudgetOverrides(await readSafe(read, AGENT_BUDGET_SETTING_KEYS.PER_USER)).get(userId);
  if (override != null) return { tokens: override, source: 'override' };
  const isAdmin =
    options.isAdmin ??
    Boolean((await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } }))?.isAdmin);
  if (isAdmin) {
    const raw = await readSafe(read, AGENT_BUDGET_SETTING_KEYS.ADMIN);
    return { tokens: parseAgentBudgetTokens(raw) ?? base.adminDailyTokenBudget, source: 'admin' };
  }
  const raw = await readSafe(read, AGENT_BUDGET_SETTING_KEYS.USER);
  return { tokens: parseAgentBudgetTokens(raw) ?? base.dailyTokenBudget, source: 'user' };
}
