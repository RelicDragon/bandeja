const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const PROD_URL_MARKERS = [
  'bandeja.com',
  'back.bandeja.com',
  'front.bandeja.com',
  'thepadel',
];

export const E2E_DEFAULT_BASE_URL = 'http://localhost:3001';
export const E2E_DEFAULT_API_URL = 'http://localhost:3000/api';

export function resolveE2eBaseUrl(): string {
  return process.env.E2E_BASE_URL ?? E2E_DEFAULT_BASE_URL;
}

export function resolveE2eApiUrl(): string {
  return process.env.E2E_API_URL ?? E2E_DEFAULT_API_URL;
}

function hostOf(url: string, label: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error(`[e2e] Invalid ${label}: ${url}`);
  }
}

export function assertE2eUrlAllowed(
  url: string,
  label: 'E2E_BASE_URL' | 'E2E_API_URL',
): void {
  const lower = url.toLowerCase();
  for (const marker of PROD_URL_MARKERS) {
    if (lower.includes(marker)) {
      throw new Error(
        `[e2e] Refusing production-like ${label} (${url}). E2E only runs against localhost.`,
      );
    }
  }

  const host = hostOf(url, label);
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `[e2e] Refusing non-local ${label} (${url}, host=${host}). Use ${E2E_DEFAULT_BASE_URL} / ${E2E_DEFAULT_API_URL}.`,
    );
  }
}

const E2E_REQUIRED_DB_NAME = 'padelpulse_dev';

type HealthPayload = {
  database?: {
    name?: string;
    e2eSafe?: boolean;
  };
  runtime?: {
    nodeEnv?: string;
  };
};

export async function assertBackendDatabaseSafe(apiURL: string): Promise<void> {
  const detailsUrl = apiURL.replace(/\/?$/, '') + '/health/details';
  let res: Response;
  try {
    res = await fetch(detailsUrl);
  } catch {
    throw new Error(
      `[e2e] Cannot reach backend health details at ${detailsUrl}. Start Backend on padelpulse_dev before running E2E.`,
    );
  }

  if (!res.ok) {
    throw new Error(`[e2e] Backend health details check failed (${res.status}) at ${detailsUrl}`);
  }

  const payload = (await res.json()) as HealthPayload;
  const dbName = payload.database?.name ?? 'unknown';
  const nodeEnv = payload.runtime?.nodeEnv ?? 'unknown';

  if (nodeEnv === 'production') {
    throw new Error(
      `[e2e] Backend NODE_ENV is production. E2E requires a local dev server (NODE_ENV=development).`,
    );
  }

  if (dbName !== E2E_REQUIRED_DB_NAME) {
    throw new Error(
      `[e2e] Backend database is "${dbName}" — E2E requires ${E2E_REQUIRED_DB_NAME} (DB_NAME=${E2E_REQUIRED_DB_NAME} in Backend/.env).`,
    );
  }

  if (payload.database?.e2eSafe !== true) {
    throw new Error(
      `[e2e] Backend database "${dbName}" is not E2E-safe (prod-like DB URL?). Use local ${E2E_REQUIRED_DB_NAME}.`,
    );
  }
}

export function guardE2eEnv(): { baseURL: string; apiURL: string } {
  const baseURL = resolveE2eBaseUrl();
  const apiURL = resolveE2eApiUrl();
  assertE2eUrlAllowed(baseURL, 'E2E_BASE_URL');
  assertE2eUrlAllowed(apiURL, 'E2E_API_URL');
  return { baseURL, apiURL };
}
