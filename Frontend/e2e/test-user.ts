/** Default E2E user A for local dev DB. Override with E2E_PHONE / E2E_PASSWORD if needed. */
export const E2E_DEFAULT_PHONE = '+79672825552';
export const E2E_DEFAULT_PASSWORD = 'Metal4me';

/** E2E user B — two-user / client-to-client tests. */
export const E2E_USER_B_PHONE = '+79672820000';
export const E2E_USER_B_PASSWORD = 'Metal4me';

/** Must be >= Backend MIN_CLIENT_VERSION_FOR_REFRESH (default 0.94.1). */
export const E2E_CLIENT_VERSION = '1.0.0';

export type E2eUserRole = 'A' | 'B';

export const E2E_USERS = {
  A: { phone: E2E_DEFAULT_PHONE, password: E2E_DEFAULT_PASSWORD },
  B: { phone: E2E_USER_B_PHONE, password: E2E_USER_B_PASSWORD },
} as const;

export function getE2eCredentials(role: E2eUserRole = 'A'): { phone: string; password: string } {
  if (role === 'B') {
    return {
      phone: process.env.E2E_PHONE_B ?? E2E_USER_B_PHONE,
      password: process.env.E2E_PASSWORD_B ?? E2E_USER_B_PASSWORD,
    };
  }
  return {
    phone: process.env.E2E_PHONE ?? E2E_DEFAULT_PHONE,
    password: process.env.E2E_PASSWORD ?? E2E_DEFAULT_PASSWORD,
  };
}

export const E2E_TEST_HEADER = 'X-E2E-Test';

export function e2eApiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Client-Version': process.env.E2E_CLIENT_VERSION ?? E2E_CLIENT_VERSION,
    'X-Client-Platform': 'web',
    [E2E_TEST_HEADER]: '1',
  };
}
