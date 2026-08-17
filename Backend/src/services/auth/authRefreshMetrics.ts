import prisma from '../../config/database';

const AUTH_REFRESH_OUTCOMES = [
  'success',
  'refreshTokenRequired',
  'refreshInvalid',
  'refreshExpired',
  'refreshReused',
  'refreshBusy',
  'refreshRequestIdInvalid',
  'error',
] as const;

export type AuthRefreshOutcome = (typeof AUTH_REFRESH_OUTCOMES)[number];

const PLATFORMS = ['web', 'ios', 'android', 'unknown'] as const;
type Platform = (typeof PLATFORMS)[number];

const CODE_TO_OUTCOME: Record<string, AuthRefreshOutcome> = {
  'auth.refreshTokenRequired': 'refreshTokenRequired',
  'auth.refreshInvalid': 'refreshInvalid',
  'auth.refreshExpired': 'refreshExpired',
  'auth.refreshReused': 'refreshReused',
  'auth.refreshBusy': 'refreshBusy',
  'auth.refreshRequestIdInvalid': 'refreshRequestIdInvalid',
  'auth.userInactive': 'error',
  'auth.userNotFound': 'error',
};

const outcomes = Object.fromEntries(AUTH_REFRESH_OUTCOMES.map((key) => [key, 0])) as Record<
  AuthRefreshOutcome,
  number
>;
const successesByPlatform = Object.fromEntries(PLATFORMS.map((key) => [key, 0])) as Record<
  Platform,
  number
>;

let totalDurationMs = 0;
let maxDurationMs = 0;

function normalizeRefreshPlatform(platform: string): Platform {
  return platform === 'web' || platform === 'ios' || platform === 'android' ? platform : 'unknown';
}

export function authRefreshOutcomeFromCode(code: unknown): AuthRefreshOutcome {
  return typeof code === 'string' ? (CODE_TO_OUTCOME[code] ?? 'error') : 'error';
}

export function recordAuthRefreshMetric(input: {
  outcome: AuthRefreshOutcome;
  platform: string;
  durationMs: number;
}): void {
  outcomes[input.outcome] += 1;
  const duration = Math.max(0, Math.round(input.durationMs));
  totalDurationMs += duration;
  maxDurationMs = Math.max(maxDurationMs, duration);
  if (input.outcome === 'success') successesByPlatform[normalizeRefreshPlatform(input.platform)] += 1;
}

export function persistAuthRefreshMetric(input: {
  outcome: AuthRefreshOutcome;
  platform: string;
  clientVersion?: string | null;
  durationMs: number;
}): Promise<unknown> {
  return prisma.authRefreshEvent.create({
    data: {
      outcome: input.outcome,
      platform: normalizeRefreshPlatform(input.platform),
      clientVersion: input.clientVersion?.trim().slice(0, 32) || null,
      durationMs: Math.max(0, Math.round(input.durationMs)),
    },
  });
}

export function recordAndPersistAuthRefreshMetric(input: {
  outcome: AuthRefreshOutcome;
  platform: string;
  clientVersion?: string | null;
  durationMs: number;
}): void {
  recordAuthRefreshMetric(input);
  void persistAuthRefreshMetric(input).catch((error) => {
    console.error(new Error('Failed to persist auth refresh metric', { cause: error }));
  });
}

export function getAuthRefreshMetrics() {
  const attempts = Object.values(outcomes).reduce((sum, count) => sum + count, 0);
  return {
    attempts,
    outcomes: { ...outcomes },
    successesByPlatform: { ...successesByPlatform },
    durationMs: {
      average: attempts > 0 ? Math.round(totalDurationMs / attempts) : 0,
      max: maxDurationMs,
    },
  };
}

export function resetAuthRefreshMetricsForTests(): void {
  for (const key of AUTH_REFRESH_OUTCOMES) outcomes[key] = 0;
  for (const key of PLATFORMS) successesByPlatform[key] = 0;
  totalDurationMs = 0;
  maxDurationMs = 0;
}
