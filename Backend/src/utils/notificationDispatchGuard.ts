import prisma from '../config/database';
import { config } from '../config/env';
import { isProdLikeDatabase } from './dbEnvironment';
import { shouldSuppressOutboundNotifications } from './e2eRequestContext';

export type NotificationChannel = 'push' | 'telegram' | 'broadcast';

export interface DispatchGuardResult {
  allowed: boolean;
  reason: string;
}

const E2E_DEFAULT_PHONE = '+79672825552';

const testUserCache = new Map<string, boolean>();

function parseCsvEnv(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isNonProductionRuntime(): boolean {
  const appEnv = (process.env.APP_ENV || '').toLowerCase();
  return config.nodeEnv !== 'production' || appEnv === 'development';
}

export function shouldSuppressAllOutboundNotifications(): boolean {
  return shouldSuppressOutboundNotifications();
}

function logBlocked(reason: string, detail: Record<string, unknown>): void {
  console.error('[NotificationDispatchGuard] BLOCKED outbound notification', { reason, ...detail });
}

function getTestPhones(): Set<string> {
  const phones = new Set(parseCsvEnv('TEST_USER_PHONES'));
  phones.add(E2E_DEFAULT_PHONE);
  const e2ePhone = (process.env.E2E_PHONE || '').trim();
  if (e2ePhone) phones.add(e2ePhone);
  return phones;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\s/g, '');
}

function matchesTestPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const normalized = normalizePhone(phone);
  for (const testPhone of getTestPhones()) {
    if (normalized === normalizePhone(testPhone)) return true;
  }
  return false;
}

function matchesTestEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return lower.includes('+e2e') || lower.includes('@e2e.') || lower.startsWith('e2e@') || lower.includes('.e2e@');
}

function isWhitelistedTestUserId(userId: string): boolean {
  return parseCsvEnv('TEST_USER_IDS').includes(userId);
}

export async function isTestOrDevUser(userId: string): Promise<boolean> {
  if (isWhitelistedTestUserId(userId)) return true;

  const cached = testUserCache.get(userId);
  if (cached !== undefined) return cached;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true, email: true },
  });

  const allowed = matchesTestPhone(user?.phone) || matchesTestEmail(user?.email);
  testUserCache.set(userId, allowed);
  return allowed;
}

export function evaluateBroadcastDispatch(kind: string): DispatchGuardResult {
  if (shouldSuppressAllOutboundNotifications()) {
    return { allowed: false, reason: 'e2e-test-context' };
  }

  if (!isNonProductionRuntime()) {
    return { allowed: true, reason: 'production-runtime' };
  }

  if (isProdLikeDatabase()) {
    logBlocked('dev-broadcast-prod-db', { kind });
    return { allowed: false, reason: 'dev-broadcast-prod-db' };
  }

  logBlocked('dev-broadcast-blocked', { kind });
  return { allowed: false, reason: 'dev-broadcast-blocked' };
}

export async function evaluateUserDispatch(
  userId: string,
  channel: NotificationChannel,
  kind: string,
): Promise<DispatchGuardResult> {
  if (shouldSuppressAllOutboundNotifications()) {
    return { allowed: false, reason: 'e2e-test-context' };
  }

  if (!isNonProductionRuntime()) {
    return { allowed: true, reason: 'production-runtime' };
  }

  if (await isTestOrDevUser(userId)) {
    return { allowed: true, reason: 'test-user' };
  }

  if (isProdLikeDatabase()) {
    logBlocked('dev-prod-db-non-test-user', { userId, channel, kind });
    return { allowed: false, reason: 'dev-prod-db-non-test-user' };
  }

  logBlocked('dev-non-test-user', { userId, channel, kind });
  return { allowed: false, reason: 'dev-non-test-user' };
}

export function canDispatchBroadcast(kind: string): boolean {
  return evaluateBroadcastDispatch(kind).allowed;
}

export async function canDispatchToUser(
  userId: string,
  channel: NotificationChannel,
  kind: string,
): Promise<boolean> {
  return (await evaluateUserDispatch(userId, channel, kind)).allowed;
}
