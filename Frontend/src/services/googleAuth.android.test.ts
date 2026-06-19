import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const socialLoginMocks = vi.hoisted(() => ({
  isLoggedIn: vi.fn(),
  getAuthorizationCode: vi.fn(),
  initialize: vi.fn(),
}));

const authSetStateMock = vi.hoisted(() => vi.fn());

vi.mock('@/store/authStore', () => ({
  useAuthStore: { setState: authSetStateMock },
}));

vi.mock('@capgo/capacitor-social-login', () => ({
  SocialLogin: socialLoginMocks,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'android',
    isNativePlatform: () => true,
  },
}));

vi.mock('@/config/media', () => ({
  config: { googleWebClientId: 'web-client-id.apps.googleusercontent.com' },
}));

vi.mock('@/services/socialLoginInit.service', () => ({
  ensureSocialLoginInitialized: vi.fn(async () => {}),
}));

vi.mock('@/api', () => ({
  authApi: {
    loginGoogle: vi.fn(),
  },
}));

describe('recoverAndroidGoogleLoginFromNative', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
    socialLoginMocks.isLoggedIn.mockReset();
    socialLoginMocks.getAuthorizationCode.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns id token when native Google session survived WebView reload', async () => {
    storage.set('bandeja_android_google_login_pending', '1');
    socialLoginMocks.isLoggedIn.mockResolvedValue({ isLoggedIn: true });
    socialLoginMocks.getAuthorizationCode.mockResolvedValue({
      jwt: 'google-id-token',
      accessToken: 'google-access-token',
    });

    const { recoverAndroidGoogleLoginFromNative } = await import('@/services/googleAuth.service');
    const result = await recoverAndroidGoogleLoginFromNative();

    expect(result).toEqual({
      idToken: 'google-id-token',
      accessToken: 'google-access-token',
    });
    expect(storage.get('bandeja_android_google_login_pending')).toBeUndefined();
  });

  it('returns null when no pending login and Google is not logged in', async () => {
    socialLoginMocks.isLoggedIn.mockResolvedValue({ isLoggedIn: false });

    const { recoverAndroidGoogleLoginFromNative } = await import('@/services/googleAuth.service');
    const result = await recoverAndroidGoogleLoginFromNative();

    expect(result).toBeNull();
  });
});

describe('stripStaleSessionForAndroidGoogleLoginRecovery', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    authSetStateMock.mockClear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
    storage.set('token', 'stale');
    storage.set('user', '{"id":"u1"}');
    storage.set('auth_backup', '{"token":"stale","user":"{}","timestamp":1}');
    storage.set('bandeja_android_google_login_pending', '1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('clears stale web session when Android Google login is pending', async () => {
    const { stripStaleSessionForAndroidGoogleLoginRecovery } = await import('@/services/googleAuth.service');
    stripStaleSessionForAndroidGoogleLoginRecovery();

    expect(storage.get('token')).toBeUndefined();
    expect(storage.get('user')).toBeUndefined();
    expect(storage.get('auth_backup')).toBeUndefined();
    expect(authSetStateMock).toHaveBeenCalledWith({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  });
});

describe('androidGoogleSignInOptions', () => {
  it('uses standard UI so saved accounts cannot one-tap without chooser', async () => {
    const { androidGoogleSignInOptions } = await import('@/services/googleAuth.service');
    expect(androidGoogleSignInOptions()).toMatchObject({
      style: 'standard',
      forcePrompt: true,
    });
    expect(androidGoogleSignInOptions().style).not.toBe('bottom');
  });
});
