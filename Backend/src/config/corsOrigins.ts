/**
 * Shared CORS allowlist for HTTP (Express) and Socket.IO.
 * See GitHub #310.
 */

export const PROD_CORS_ORIGINS = [
  'https://bandeja.me',
  'https://www.bandeja.me',
  /** Capacitor Android (`androidScheme: https`, hostname `localhost`) */
  'https://localhost',
  /** Capacitor iOS — `iosScheme: https` is invalid for WKWebView; falls back to `capacitor` */
  'capacitor://localhost',
] as const;

export const DEV_CORS_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  /** Admin/serve.sh (belt-and-suspenders if API URL is absolute :3000) */
  'http://localhost:9010',
  'http://127.0.0.1:9010',
] as const;

function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/$/, '');
  if (!trimmed || trimmed === 'null') return null;
  return trimmed;
}

function parseExtraOrigins(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((part) => normalizeOrigin(part))
    .filter((o): o is string => !!o);
}

export type CorsOriginsInput = {
  nodeEnv: string;
  /** Optional FRONTEND_URL / invite base — added when set */
  frontendUrl?: string | null;
  /** Comma-separated extras (CORS_ALLOWED_ORIGINS) */
  extraOrigins?: string | null;
};

export function getCorsAllowedOrigins(input: CorsOriginsInput): string[] {
  const set = new Set<string>();
  for (const o of PROD_CORS_ORIGINS) set.add(o);
  if (input.nodeEnv !== 'production') {
    for (const o of DEV_CORS_ORIGINS) set.add(o);
  }
  const frontend = input.frontendUrl ? normalizeOrigin(input.frontendUrl) : null;
  if (frontend) set.add(frontend);
  for (const o of parseExtraOrigins(input.extraOrigins)) set.add(o);
  return [...set];
}

export function isCorsOriginAllowed(
  origin: string | undefined | null,
  allowed: readonly string[]
): boolean {
  if (typeof origin !== 'string' || origin.length === 0) return false;
  if (origin === 'null') return false;
  return allowed.includes(origin);
}

/**
 * `cors` package origin callback: requests with no Origin (curl, same-origin navigations)
 * are allowed without reflecting; listed Origins are reflected; others get no ACAO.
 */
export function createCorsOriginDelegate(allowed: readonly string[]) {
  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ): void => {
    if (!origin) {
      callback(null, true);
      return;
    }
    callback(null, isCorsOriginAllowed(origin, allowed));
  };
}
