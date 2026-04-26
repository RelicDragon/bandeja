import dotenv from 'dotenv';

dotenv.config();

function parseTrustProxy(): boolean | number | string {
  const v = (process.env.TRUST_PROXY || '').trim();
  if (v === '' || v === '1') return 1;
  if (v === 'false' || v === '0') return false;
  if (v === 'true') return true;
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  return v;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  /** Express trust proxy (default 1 hop). Set TRUST_PROXY=false behind no proxy. */
  trustProxy: parseTrustProxy(),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'padelpulse',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    schema: process.env.DB_SCHEMA || 'public',
  },
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '90d',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '30m',
  jwtIssuer: process.env.JWT_ISS || 'padelpulse',
  jwtAudience: process.env.JWT_AUD || 'padelpulse-app',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '60d',
  refreshTokenEnabled: process.env.REFRESH_TOKEN_ENABLED !== 'false',
  /** Web: Set-Cookie httpOnly refresh; omit refresh from JSON. Kill-switch: REFRESH_WEB_HTTPONLY_COOKIE=false */
  refreshWebHttpOnlyCookie: process.env.REFRESH_WEB_HTTPONLY_COOKIE !== 'false',
  /**
   * With web httpOnly cookie, also return refreshToken in JSON (login/register/refresh) so clients can persist
   * when Set-Cookie is dropped (e.g. strict mobile / cross-site). Set REFRESH_WEB_HTTPONLY_JSON_BODY=false for cookie-only JSON.
   */
  refreshWebHttpOnlyJsonBody: process.env.REFRESH_WEB_HTTPONLY_JSON_BODY !== 'false',
  refreshCookieName: process.env.REFRESH_COOKIE_NAME || 'pp_rt',
  refreshCookiePath: process.env.REFRESH_COOKIE_PATH || '/api',
  refreshCookieDomain: (process.env.REFRESH_COOKIE_DOMAIN || '').trim() || null,
  refreshCookieSameSite: (() => {
    const raw = (process.env.REFRESH_COOKIE_SAME_SITE || 'lax').toLowerCase();
    if (raw === 'strict' || raw === 'none') return raw as 'strict' | 'none';
    return 'lax' as const;
  })(),
  refreshCookieSecure:
    process.env.REFRESH_COOKIE_SECURE === 'true' ||
    ((process.env.NODE_ENV || 'development') === 'production' && process.env.REFRESH_COOKIE_SECURE !== 'false'),
  minClientVersionForRefresh: process.env.MIN_CLIENT_VERSION_FOR_REFRESH || '0.94.1',
  /**
   * After this instant (UTC), with refresh enabled, clients below min version cannot receive new long-lived JWTs.
   * Default `2026-05-15T00:00:00.000Z` when unset. Set `LEGACY_JWT_ISSUANCE_END_AT=off` (or `false` / `none` / `disabled`) to disable the calendar check.
   * Invalid ISO → null (no sunset).
   */
  legacyJwtIssuanceEndAt: (() => {
    const raw = (process.env.LEGACY_JWT_ISSUANCE_END_AT || '').trim();
    const defaultEnd = new Date('2026-05-15T00:00:00.000Z');
    if (!raw) return defaultEnd;
    if (/^(off|false|none|disabled)$/i.test(raw)) return null as Date | null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  })(),
  accessRefreshLeewaySeconds: parseInt(process.env.ACCESS_REFRESH_LEEWAY_SECONDS || '120', 10),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  apns: {
    keyId: process.env.APNS_KEY_ID || '',
    teamId: process.env.APNS_TEAM_ID || '',
    bundleId: process.env.APNS_BUNDLE_ID || 'com.funified.bandeja',
    keyPath: process.env.APNS_KEY_PATH || '',
    production: process.env.APNS_PRODUCTION === 'true',
  },
  fcm: {
    projectId: process.env.FCM_PROJECT_ID || '',
    privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
    clientEmail: process.env.FCM_CLIENT_EMAIL || '',
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_REGION || 'eu-central-1',
    s3Bucket: process.env.AWS_S3_BUCKET || 'bandeja-padel-eu',
    cloudFrontDomain: process.env.AWS_CLOUDFRONT_DOMAIN || 'd1afylun4w6qxe.cloudfront.net',
  },
  /** Required for voice transcription (Whisper); independent of AI_PROVIDER. */
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
  },
  ai: {
    provider: (process.env.AI_PROVIDER || 'openai') as 'openai' | 'deepseek',
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID || 'com.funified.bandeja',
  },
  google: {
    webClientId: process.env.GOOGLE_WEB_CLIENT_ID || '',
    iosClientId: process.env.GOOGLE_IOS_CLIENT_ID || '',
    androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || '',
  },
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  },
  /** User ID that sends city group welcome messages (env: CITY_GROUP_WELCOME_SENDER_ID). Required for backfill script. */
  cityGroupWelcomeSenderId: process.env.CITY_GROUP_WELCOME_SENDER_ID || null,
  /** Fallback city id used when IP-based city detection fails (env: FALLBACK_CITY_ID). */
  fallbackCityId: process.env.FALLBACK_CITY_ID || null,
  /**
   * City group chats: emit join system messages on auto-add; omit leave system messages.
   * Env: CITY_GROUP_REFINED_SYSTEM_MESSAGES=true
   */
  cityGroupRefinedSystemMessages: process.env.CITY_GROUP_REFINED_SYSTEM_MESSAGES === 'true',
  /** JSON lines to stderr for /api/chat/sync/* errors (log drain / external APM). */
  chatSyncHttpErrorLog: process.env.CHAT_SYNC_HTTP_ERROR_LOG === 'true' || process.env.CHAT_SYNC_HTTP_ERROR_LOG === '1',
};

