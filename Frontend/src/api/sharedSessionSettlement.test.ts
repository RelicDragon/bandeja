import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types';

const platform = vi.hoisted(() => ({ value: 'ios' }));
const getProfile = vi.hoisted(() => vi.fn());

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => platform.value,
    isNativePlatform: () => platform.value !== 'web',
  },
  registerPlugin: vi.fn(() => ({})),
}));

vi.mock('@/services/authBridge', () => ({
  getRefreshCredentialNative: vi.fn(async () => ({ status: 'missing' as const })),
  getTokenNative: vi.fn(async () => null),
}));

vi.mock('@/services/sharedSessionAccountSwitch', () => ({
  applySharedSessionAccountSwitch: vi.fn(async () => {}),
  applySharedSessionUser: vi.fn(async () => {}),
}));

vi.mock('@/api', () => ({
  usersApi: {
    getProfile,
  },
}));

function jwtWithExp(expMs: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(expMs / 1000) })).toString('base64url');
  return `header.${payload}.signature`;
}

const baseNow = Date.UTC(2026, 5, 30, 12, 0, 0);

function deps(overrides?: Partial<{
  mode: 'cold_start' | 'foreground';
  accessToken: string | null;
  previousUser: User | null;
  hasStoredUserCandidate: boolean;
  readCredential: () => Promise<{ status: 'found' | 'missing' | 'unavailable'; token?: string }>;
  readSharedAccess: () => Promise<string | null>;
  loadCurrentUser: () => Promise<User | null>;
}>) {
  let accessToken = overrides?.accessToken ?? null;
  return {
    mode: overrides?.mode ?? 'cold_start',
    getAccessToken: () => accessToken,
    getPreviousUser: () => overrides?.previousUser ?? null,
    hasStoredUserCandidate: () => overrides?.hasStoredUserCandidate ?? false,
    adoptAccessToken: (token: string) => {
      accessToken = token;
    },
    clearLocalAuth: vi.fn(async () => {}),
    loadCurrentUser: vi.fn(overrides?.loadCurrentUser ?? (async () => null)),
    onAccountSwitch: vi.fn(async () => {}),
    applyCurrentUser: vi.fn(async () => {}),
    readCredential:
      overrides?.readCredential ??
      (async () => ({ status: 'missing' as const })),
    readSharedAccess: overrides?.readSharedAccess ?? (async () => null),
  };
}

describe('shared session settlement', () => {
  beforeEach(() => {
    platform.value = 'ios';
    vi.clearAllMocks();
    getProfile.mockResolvedValue({ data: null });
  });

  afterEach(() => {
    platform.value = 'web';
  });

  it('is a no-op on web', async () => {
    platform.value = 'web';
    const { settleSharedSession } = await import('@/api/sharedSessionSettlement');
    const input = deps({
      readCredential: async () => ({ status: 'missing' }),
    });

    await expect(settleSharedSession(input)).resolves.toEqual({ type: 'continue' });
    expect(input.clearLocalAuth).not.toHaveBeenCalled();
  });

  it('continues cold start anonymously when no local or shared session exists', async () => {
    const { settleSharedSession } = await import('@/api/sharedSessionSettlement');
    const input = deps({
      readCredential: async () => ({ status: 'missing' }),
    });

    await expect(settleSharedSession(input)).resolves.toEqual({ type: 'continue' });
    expect(input.clearLocalAuth).not.toHaveBeenCalled();
  });

  it('recovers from shared credential on cold start before anonymous classification', async () => {
    const { settleSharedSession } = await import('@/api/sharedSessionSettlement');
    const input = deps({
      readCredential: async () => ({ status: 'found', token: 'shared-refresh' }),
      readSharedAccess: async () => jwtWithExp(baseNow + 5 * 60 * 1000),
    });

    await expect(settleSharedSession(input)).resolves.toEqual({ type: 'continue' });
    expect(input.getAccessToken()).toContain('header.');
  });

  it('suite-logouts when shared credential disappears after a local session existed', async () => {
    const { settleSharedSession } = await import('@/api/sharedSessionSettlement');
    const input = deps({
      accessToken: jwtWithExp(baseNow + 5 * 60 * 1000),
      hasStoredUserCandidate: true,
      readCredential: async () => ({ status: 'missing' }),
    });

    await expect(settleSharedSession(input)).resolves.toEqual({
      type: 'cleared',
      reason: 'shared_credential_missing',
    });
    expect(input.clearLocalAuth).toHaveBeenCalledWith('shared_credential_missing');
  });

  it('degrades instead of logging out when secure storage is unavailable', async () => {
    const { settleSharedSession } = await import('@/api/sharedSessionSettlement');
    const input = deps({
      accessToken: jwtWithExp(baseNow + 5 * 60 * 1000),
      hasStoredUserCandidate: true,
      readCredential: async () => ({ status: 'unavailable' }),
    });

    await expect(settleSharedSession(input)).resolves.toEqual({
      type: 'degraded',
      reason: 'keychain_unavailable',
    });
    expect(input.clearLocalAuth).not.toHaveBeenCalled();
  });

  it('adopts a shared access token changed by Travel while local access is still valid', async () => {
    const { settleSharedSession } = await import('@/api/sharedSessionSettlement');
    const localToken = jwtWithExp(baseNow + 5 * 60 * 1000);
    const sharedToken = jwtWithExp(baseNow + 8 * 60 * 1000);
    const input = deps({
      mode: 'foreground',
      accessToken: localToken,
      hasStoredUserCandidate: true,
      readCredential: async () => ({ status: 'found', token: 'shared-refresh' }),
      readSharedAccess: async () => sharedToken,
      loadCurrentUser: async () => ({ id: 'user-1' } as User),
    });

    await expect(settleSharedSession(input)).resolves.toEqual({ type: 'continue' });
    expect(input.getAccessToken()).toBe(sharedToken);
  });

  it('clears user-scoped caches when foreground verification detects an account switch', async () => {
    const { settleSharedSession } = await import('@/api/sharedSessionSettlement');
    const token = jwtWithExp(baseNow + 5 * 60 * 1000);
    const input = deps({
      mode: 'foreground',
      accessToken: token,
      previousUser: { id: 'user-1' } as User,
      hasStoredUserCandidate: true,
      readCredential: async () => ({ status: 'found', token: 'shared-refresh' }),
      readSharedAccess: async () => token,
      loadCurrentUser: async () => ({ id: 'user-2' } as User),
    });

    await expect(settleSharedSession(input)).resolves.toEqual({ type: 'continue' });
    expect(input.onAccountSwitch).toHaveBeenCalledWith('user-1', { id: 'user-2' });
  });

  it('clears user-scoped caches when cold-start verification detects an account switch', async () => {
    const { settleSharedSession } = await import('@/api/sharedSessionSettlement');
    const sharedToken = jwtWithExp(baseNow + 5 * 60 * 1000);
    const input = deps({
      mode: 'cold_start',
      accessToken: jwtWithExp(baseNow + 2 * 60 * 1000),
      previousUser: { id: 'user-1' } as User,
      hasStoredUserCandidate: true,
      readCredential: async () => ({ status: 'found', token: 'shared-refresh' }),
      readSharedAccess: async () => sharedToken,
      loadCurrentUser: async () => ({ id: 'user-2' } as User),
    });

    await expect(settleSharedSession(input)).resolves.toEqual({ type: 'continue' });
    expect(input.onAccountSwitch).toHaveBeenCalledWith('user-1', { id: 'user-2' });
    expect(input.applyCurrentUser).not.toHaveBeenCalled();
  });

  it('verifies an adopted expired shared token and switches to its account', async () => {
    const { settleSharedSession } = await import('@/api/sharedSessionSettlement');
    const expiredSharedToken = jwtWithExp(baseNow - 1000);
    const input = deps({
      mode: 'cold_start',
      accessToken: jwtWithExp(baseNow + 5 * 60 * 1000),
      previousUser: { id: 'user-1' } as User,
      hasStoredUserCandidate: true,
      readCredential: async () => ({ status: 'found', token: 'shared-refresh' }),
      readSharedAccess: async () => expiredSharedToken,
      loadCurrentUser: async () => ({ id: 'user-2' } as User),
    });

    await expect(settleSharedSession(input)).resolves.toEqual({ type: 'continue' });
    expect(input.getAccessToken()).toBe(expiredSharedToken);
    expect(input.loadCurrentUser).toHaveBeenCalledTimes(1);
    expect(input.onAccountSwitch).toHaveBeenCalledWith('user-1', { id: 'user-2' });
  });

  it('degrades when profile verification fails', async () => {
    const { settleSharedSession } = await import('@/api/sharedSessionSettlement');
    const input = deps({
      readCredential: async () => ({ status: 'found', token: 'shared-refresh' }),
      readSharedAccess: async () => jwtWithExp(baseNow + 5 * 60 * 1000),
      loadCurrentUser: async () => {
        throw new Error('network unavailable');
      },
    });

    await expect(settleSharedSession(input)).resolves.toEqual({
      type: 'degraded',
      reason: 'profile_verify_failed',
    });
  });

  it('propagates profile API failures from the default loader', async () => {
    const { defaultLoadCurrentUser } = await import('@/api/sharedSessionSettlement');
    getProfile.mockRejectedValueOnce(new Error('network unavailable'));

    await expect(defaultLoadCurrentUser()).rejects.toThrow('network unavailable');
  });

  it('applies a fetched profile when establishing a previously anonymous session', async () => {
    const { settleSharedSession } = await import('@/api/sharedSessionSettlement');
    const nextUser = { id: 'user-1' } as User;
    const input = deps({
      readCredential: async () => ({ status: 'found', token: 'shared-refresh' }),
      readSharedAccess: async () => jwtWithExp(baseNow + 5 * 60 * 1000),
      loadCurrentUser: async () => nextUser,
    });

    await expect(settleSharedSession(input)).resolves.toEqual({ type: 'continue' });
    expect(input.applyCurrentUser).toHaveBeenCalledWith(nextUser);
  });
});
