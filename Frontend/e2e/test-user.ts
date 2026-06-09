/** Default E2E user for local dev DB. Override with E2E_PHONE / E2E_PASSWORD if needed. */
export const E2E_DEFAULT_PHONE = '+79672825552';
export const E2E_DEFAULT_PASSWORD = 'Metal4me';

/** Must be >= Backend MIN_CLIENT_VERSION_FOR_REFRESH (default 0.94.1). */
export const E2E_CLIENT_VERSION = '1.0.0';

export function getE2eCredentials(): { phone: string; password: string } {
  return {
    phone: process.env.E2E_PHONE ?? E2E_DEFAULT_PHONE,
    password: process.env.E2E_PASSWORD ?? E2E_DEFAULT_PASSWORD,
  };
}

export function e2eApiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Client-Version': process.env.E2E_CLIENT_VERSION ?? E2E_CLIENT_VERSION,
    'X-Client-Platform': 'web',
  };
}
