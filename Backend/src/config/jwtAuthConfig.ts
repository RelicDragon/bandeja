/** JWT auth config (#315): production fail-closed secret + TTL policy. */

export const DEFAULT_DEV_JWT_SECRET = 'your-secret-key';
export const SAMPLE_JWT_SECRET = 'your-secret-key-change-in-production';

/** Long-lived legacy JWT TTL (non-production / pre-refresh only). */
export const DEFAULT_JWT_LEGACY_EXPIRES_IN = '90d';

/** Short-lived access JWT (`typ=access`) — HITL #315. */
export const DEFAULT_JWT_ACCESS_EXPIRES_IN = '30m';

/** Opaque refresh session TTL. */
export const DEFAULT_REFRESH_TOKEN_EXPIRES_IN = '60d';

/** Production floor: 32 chars ≈ 128-bit hex / random secret. */
export const MIN_PRODUCTION_JWT_SECRET_LENGTH = 32;

/** Production ceiling for access JWT lifetime (HITL: 30m). */
export const MAX_PRODUCTION_ACCESS_TTL_MS = 30 * 60 * 1000;

/** Production floor for access JWT lifetime (avoid sub-second / broken clocks). */
export const MIN_PRODUCTION_ACCESS_TTL_MS = 60 * 1000;

/** Production refresh session bounds. */
export const MIN_PRODUCTION_REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_PRODUCTION_REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const INSECURE_JWT_SECRETS = new Set(
  [
    '',
    DEFAULT_DEV_JWT_SECRET,
    SAMPLE_JWT_SECRET,
    'secret',
    'password',
    'changeme',
    'change-me',
    'jwt_secret',
    'jwt-secret',
    'padelpulse',
    'bandeja',
    'test',
    'dev',
    'development',
  ].map((s) => s.toLowerCase())
);

export function normalizeNodeEnv(nodeEnv: string | null | undefined): string {
  const raw = (nodeEnv ?? '').trim().toLowerCase();
  return raw || 'development';
}

export function isProductionNodeEnv(nodeEnv: string | null | undefined): boolean {
  return normalizeNodeEnv(nodeEnv) === 'production';
}

/** Parse `30m` / `90d` style durations used by JWT + refresh session expiry. */
export function parseExpiresInToMs(expiresIn: string): number {
  const m = /^(\d+)([smhd])$/i.exec(expiresIn.trim().replace(/\s/g, ''));
  if (!m) {
    throw new Error(`Unsupported expires string: ${expiresIn}`);
  }
  const amount = parseInt(m[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Unsupported expires string: ${expiresIn}`);
  }
  const unit = m[2].toLowerCase();
  if (unit === 's') return amount * 1000;
  if (unit === 'm') return amount * 60_000;
  if (unit === 'h') return amount * 3_600_000;
  return amount * 86_400_000;
}

export function isInsecureJwtSecret(secret: string | null | undefined): boolean {
  const trimmed = (secret ?? '').trim();
  if (!trimmed) return true;
  if (INSECURE_JWT_SECRETS.has(trimmed.toLowerCase())) return true;
  return false;
}

function assertProductionSecretStrength(secret: string): void {
  if (isInsecureJwtSecret(secret)) {
    throw new Error(
      'JWT_SECRET must be set to a strong non-default value in production (refusing empty/default secret)'
    );
  }
  if (secret.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters in production`
    );
  }
}

/**
 * Resolve JWT signing secret.
 * Production: refuse missing/empty/default/short secrets (boot must fail).
 * Non-production: allow unset → insecure local default.
 */
export function resolveJwtSecret(input: {
  nodeEnv: string;
  jwtSecretEnv?: string | null;
}): string {
  const raw = (input.jwtSecretEnv ?? '').trim();
  if (isProductionNodeEnv(input.nodeEnv)) {
    assertProductionSecretStrength(raw);
    return raw;
  }
  return raw || DEFAULT_DEV_JWT_SECRET;
}

export function resolveJwtAccessExpiresIn(
  envValue?: string | null,
  nodeEnv?: string
): string {
  const raw = (envValue ?? '').trim();
  const value = raw || DEFAULT_JWT_ACCESS_EXPIRES_IN;
  const ms = parseExpiresInToMs(value);
  if (isProductionNodeEnv(nodeEnv)) {
    if (ms < MIN_PRODUCTION_ACCESS_TTL_MS || ms > MAX_PRODUCTION_ACCESS_TTL_MS) {
      throw new Error(
        `JWT_ACCESS_EXPIRES_IN must be between 1m and 30m in production (got ${value})`
      );
    }
  }
  return value;
}

export function resolveJwtLegacyExpiresIn(envValue?: string | null): string {
  const raw = (envValue ?? '').trim();
  const value = raw || DEFAULT_JWT_LEGACY_EXPIRES_IN;
  parseExpiresInToMs(value);
  return value;
}

export function resolveRefreshTokenExpiresIn(
  envValue?: string | null,
  nodeEnv?: string
): string {
  const raw = (envValue ?? '').trim();
  const value = raw || DEFAULT_REFRESH_TOKEN_EXPIRES_IN;
  const ms = parseExpiresInToMs(value);
  if (isProductionNodeEnv(nodeEnv)) {
    if (ms < MIN_PRODUCTION_REFRESH_TTL_MS || ms > MAX_PRODUCTION_REFRESH_TTL_MS) {
      throw new Error(
        `REFRESH_TOKEN_EXPIRES_IN must be between 1d and 90d in production (got ${value})`
      );
    }
  }
  return value;
}

export type JwtAuthRuntimeConfig = {
  nodeEnv: string;
  jwtSecret: string;
  jwtAccessExpiresIn: string;
  refreshTokenExpiresIn: string;
  refreshTokenEnabled: boolean;
  /** null = sunset calendar disabled (`LEGACY_JWT_ISSUANCE_END_AT=off`). */
  legacyJwtIssuanceEndAt: Date | null;
};

/**
 * Fail closed for production auth posture: strong secret, short access TTL,
 * refresh required, legacy issuance calendar must remain on.
 */
export function assertProductionJwtAuthConfig(input: JwtAuthRuntimeConfig): void {
  if (!isProductionNodeEnv(input.nodeEnv)) return;

  assertProductionSecretStrength(input.jwtSecret.trim());

  if (!input.refreshTokenEnabled) {
    throw new Error(
      'REFRESH_TOKEN_ENABLED cannot be false in production (refresh session model is required)'
    );
  }

  if (input.legacyJwtIssuanceEndAt == null) {
    throw new Error(
      'LEGACY_JWT_ISSUANCE_END_AT cannot be disabled in production (legacy long-lived JWTs must stay sunset)'
    );
  }
  if (Number.isNaN(input.legacyJwtIssuanceEndAt.getTime())) {
    throw new Error('LEGACY_JWT_ISSUANCE_END_AT must be a valid date in production');
  }

  const accessMs = parseExpiresInToMs(input.jwtAccessExpiresIn);
  if (accessMs < MIN_PRODUCTION_ACCESS_TTL_MS || accessMs > MAX_PRODUCTION_ACCESS_TTL_MS) {
    throw new Error(
      `JWT_ACCESS_EXPIRES_IN must be between 1m and 30m in production (got ${input.jwtAccessExpiresIn})`
    );
  }

  const refreshMs = parseExpiresInToMs(input.refreshTokenExpiresIn);
  if (refreshMs < MIN_PRODUCTION_REFRESH_TTL_MS || refreshMs > MAX_PRODUCTION_REFRESH_TTL_MS) {
    throw new Error(
      `REFRESH_TOKEN_EXPIRES_IN must be between 1d and 90d in production (got ${input.refreshTokenExpiresIn})`
    );
  }
  // Bounds already guarantee refresh (min 1d) > access (max 30m).
}

/** Call at process start so workers/servers fail fast even if config was imported lazily. */
export function assertProductionJwtSecret(input: {
  nodeEnv: string;
  jwtSecret: string;
}): void {
  if (!isProductionNodeEnv(input.nodeEnv)) return;
  assertProductionSecretStrength(input.jwtSecret);
}
