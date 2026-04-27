import { SocialLogin } from '@capgo/capacitor-social-login';
import type { GoogleLoginResponse, GoogleLoginResponseOnline } from '@capgo/capacitor-social-login';
import { Capacitor } from '@capacitor/core';
import { config } from '@/config/media';

export interface GoogleAuthResult {
  idToken: string;
  accessToken?: string;
  serverAuthCode?: string;
  profile?: {
    email?: string;
    name?: string;
    givenName?: string;
    familyName?: string;
    picture?: string;
  };
}

interface GoogleJWTPayload {
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  [key: string]: unknown;
}

interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
}

interface GoogleAccountsConfig {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  context?: 'signin' | 'signup' | 'use';
  use_fedcm_for_button?: boolean;
}

interface GoogleButtonConfig {
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  type?: 'standard' | 'icon';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  width?: number;
}

type ActiveWebAttempt = {
  id: number;
  settled: boolean;
  cleanup: () => void;
  resolve: (value: GoogleAuthResult | null) => void;
  reject: (error: Error) => void;
};

interface GoogleSignInOptions {
  onUiOpened?: () => void;
}

interface RenderGoogleButtonOptions {
  onSuccess: (result: GoogleAuthResult) => void;
  onError: (error: Error) => void;
  width?: number;
}

const GSI_INIT_DONE_KEY = '__padelpulseGsiInitDone';
const GSI_INIT_CLIENT_ID_KEY = '__padelpulseGsiInitClientId';
const GSI_DISPATCH_KEY = '__padelpulseGsiDispatchCredential';

let webAttemptSeq = 0;
let activeWebAttempt: ActiveWebAttempt | null = null;

const decodeGoogleIdToken = (token: string): GoogleJWTPayload | null => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload) as GoogleJWTPayload;
  } catch {
    return null;
  }
};

const ensureGoogleReady = async (): Promise<void> => {
  const MAX_WAIT_TIME = 10000;
  const startTime = Date.now();

  await new Promise<void>((resolve, reject) => {
    const waitForGoogle = () => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        resolve();
      } else {
        const elapsed = Date.now() - startTime;
        if (elapsed >= MAX_WAIT_TIME) {
          reject(new Error('auth.googleIdentityLoadTimeout'));
          return;
        }
        setTimeout(waitForGoogle, 100);
      }
    };
    waitForGoogle();
  });
};

function ensureGoogleInitialized(): void {
  const googleAccountsId = window.google!.accounts.id;
  const clientId = config.googleWebClientId;
  const needsInit =
    !window[GSI_INIT_DONE_KEY] || window[GSI_INIT_CLIENT_ID_KEY] !== clientId;

  if (!needsInit) return;

  try {
    googleAccountsId.disableAutoSelect();
  } catch {
    /* ignore */
  }
  googleAccountsId.initialize({
    client_id: clientId,
    context: 'signin',
    callback: (response: GoogleCredentialResponse) => {
      window[GSI_DISPATCH_KEY]?.(response);
    },
    auto_select: false,
    use_fedcm_for_button: true,
  });
  window[GSI_INIT_DONE_KEY] = true;
  window[GSI_INIT_CLIENT_ID_KEY] = clientId;
}

export function renderGoogleSignInButton(
  container: HTMLElement,
  options: RenderGoogleButtonOptions
): () => void {
  let disposed = false;
  let resizeObserver: ResizeObserver | null = null;

  const fail = (error: Error) => {
    if (!disposed) options.onError(error);
  };

  if (typeof window === 'undefined') {
    fail(new Error('auth.googleSignInUnavailable'));
    return () => {};
  }
  if (!config.googleWebClientId) {
    fail(new Error('auth.googleClientNotConfigured'));
    return () => {};
  }

  void ensureGoogleReady()
    .then(() => {
      if (disposed) return;
      ensureGoogleInitialized();
      window[GSI_DISPATCH_KEY] = (response: GoogleCredentialResponse) => {
        if (disposed) return;
        if (!response.credential) {
          options.onError(new Error('auth.googleNoCredential'));
          return;
        }
        const decoded = decodeGoogleIdToken(response.credential);
        options.onSuccess({
          idToken: response.credential,
          profile: decoded ? {
            email: decoded.email,
            name: decoded.name,
            givenName: decoded.given_name,
            familyName: decoded.family_name,
            picture: decoded.picture,
          } : undefined,
        });
      };

      const render = () => {
        if (disposed) return;
        const dynamicWidth = options.width ?? Math.max(220, Math.floor(container.clientWidth));
        container.innerHTML = '';
        window.google!.accounts.id.renderButton(container, {
          theme: 'outline',
          size: 'medium',
          type: 'standard',
          text: 'continue_with',
          shape: 'pill',
          width: dynamicWidth,
        });
      };

      render();
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => render());
        resizeObserver.observe(container);
      }
    })
    .catch((error) => {
      fail(error instanceof Error ? error : new Error('auth.googleSignInInitFailed'));
    });

  return () => {
    disposed = true;
    resizeObserver?.disconnect();
    if (container) container.innerHTML = '';
  };
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleAccountsConfig) => void;
          renderButton: (element: HTMLElement, config: GoogleButtonConfig) => void;
          disableAutoSelect: () => void;
          cancel?: () => void;
        };
      };
    };
    [GSI_INIT_DONE_KEY]?: boolean;
    [GSI_INIT_CLIENT_ID_KEY]?: string;
    [GSI_DISPATCH_KEY]?: (response: GoogleCredentialResponse) => void;
  }
}

function signInWithGoogleWeb(options?: GoogleSignInOptions): Promise<GoogleAuthResult | null> {
  if (activeWebAttempt && !activeWebAttempt.settled) {
    try {
      window.google?.accounts.id.cancel?.();
    } catch {
      /* ignore */
    }
    activeWebAttempt.cleanup();
    activeWebAttempt.settled = true;
    activeWebAttempt.resolve(null);
    activeWebAttempt = null;
  }

  const attemptId = ++webAttemptSeq;

  return new Promise<GoogleAuthResult | null>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('auth.googleSignInUnavailable'));
      return;
    }

    if (!config.googleWebClientId) {
      reject(new Error('auth.googleClientNotConfigured'));
      return;
    }

    let buttonContainer: HTMLElement | null = null;
    const cleanup = () => {
      if (buttonContainer?.parentNode) {
        buttonContainer.parentNode.removeChild(buttonContainer);
      }
      buttonContainer = null;
    };

    const finishResolve = (value: GoogleAuthResult | null) => {
      if (!activeWebAttempt || activeWebAttempt.id !== attemptId || activeWebAttempt.settled) return;
      cleanup();
      activeWebAttempt.settled = true;
      activeWebAttempt.resolve(value);
      activeWebAttempt = null;
    };

    const finishReject = (error: Error) => {
      if (!activeWebAttempt || activeWebAttempt.id !== attemptId || activeWebAttempt.settled) return;
      cleanup();
      activeWebAttempt.settled = true;
      activeWebAttempt.reject(error);
      activeWebAttempt = null;
    };

    activeWebAttempt = { id: attemptId, settled: false, cleanup, resolve, reject };

    const MAX_WAIT_TIME = 10000;
    const startTime = Date.now();

    const initializeGoogle = () => {
      try {
        const googleAccountsId = window.google!.accounts.id;
        const clientId = config.googleWebClientId;
        const needsInit =
          !window[GSI_INIT_DONE_KEY] || window[GSI_INIT_CLIENT_ID_KEY] !== clientId;

        if (needsInit) {
          try {
            googleAccountsId.disableAutoSelect();
          } catch {
            /* ignore */
          }
          googleAccountsId.initialize({
            client_id: clientId,
            context: 'signin',
            callback: (response: GoogleCredentialResponse) => {
              window[GSI_DISPATCH_KEY]?.(response);
            },
            auto_select: false,
            use_fedcm_for_button: true,
          });
          window[GSI_INIT_DONE_KEY] = true;
          window[GSI_INIT_CLIENT_ID_KEY] = clientId;
        }

        window[GSI_DISPATCH_KEY] = (response: GoogleCredentialResponse) => {
          if (!activeWebAttempt || activeWebAttempt.id !== attemptId || activeWebAttempt.settled) return;
          if (!response.credential) {
            finishResolve(null);
            return;
          }

          const decoded = decodeGoogleIdToken(response.credential);
          finishResolve({
            idToken: response.credential,
            profile: decoded ? {
              email: decoded.email,
              name: decoded.name,
              givenName: decoded.given_name,
              familyName: decoded.family_name,
              picture: decoded.picture,
            } : undefined,
          });
        };

        buttonContainer = document.createElement('div');
        buttonContainer.id = `google-signin-button-temp-${attemptId}`;
        buttonContainer.setAttribute('aria-hidden', 'true');
        Object.assign(buttonContainer.style, {
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '300px',
          height: '44px',
          opacity: '0.02',
          pointerEvents: 'auto',
          zIndex: '2147483646',
        });
        document.body.appendChild(buttonContainer);

        googleAccountsId.renderButton(buttonContainer, {
          theme: 'outline',
          size: 'large',
          type: 'standard',
          text: 'signin_with',
          width: 300,
        });

        const clickRendered = () => {
          const button = buttonContainer?.querySelector('div[role="button"]') as HTMLElement | null;
          if (!button) {
            finishReject(new Error('auth.googleButtonInitFailed'));
            return;
          }
          options?.onUiOpened?.();
          button.click();
        };

        requestAnimationFrame(() => {
          requestAnimationFrame(clickRendered);
        });
      } catch {
        finishReject(new Error('auth.googleSignInInitFailed'));
      }
    };

    const waitForGoogle = () => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        initializeGoogle();
      } else {
        const elapsed = Date.now() - startTime;
        if (elapsed >= MAX_WAIT_TIME) {
          finishReject(new Error('auth.googleIdentityLoadTimeout'));
          return;
        }
        setTimeout(waitForGoogle, 100);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', waitForGoogle, { once: true });
    } else {
      waitForGoogle();
    }
  });
}

function isReauthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  const s = (msg + ' ' + code).toLowerCase();
  return s.includes('reauth') || s.includes('[16]') || s.includes('account reauth failed');
}

async function signInWithGoogleNative(options?: GoogleSignInOptions): Promise<GoogleAuthResult | null> {
  const LOGIN_TIMEOUT_MS = 60_000;
  const platform = Capacitor.getPlatform();

  options?.onUiOpened?.();
  const loginPromise = SocialLogin.login({
    provider: 'google',
    options: {
      scopes: ['email', 'profile'],
      forceRefreshToken: false,
      forcePrompt: true,
      prompt: 'select_account',
      ...(platform === 'android'
        ? { style: 'bottom' as const, filterByAuthorizedAccounts: false, autoSelectEnabled: false }
        : {}),
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('auth.googleSignInTimedOut')), LOGIN_TIMEOUT_MS)
  );

  const response = await Promise.race([loginPromise, timeoutPromise]);

  const result: GoogleLoginResponse = response.result;

  if (result.responseType === 'offline') {
    throw new Error('auth.googleSignInRequiresOnline');
  }

  const onlineResult: GoogleLoginResponseOnline = result;

  if (!onlineResult.idToken) {
    throw new Error('auth.googleNoIdToken');
  }

  return {
    idToken: onlineResult.idToken,
    accessToken: onlineResult.accessToken?.token,
    profile: onlineResult.profile ? {
      email: onlineResult.profile.email || undefined,
      name: onlineResult.profile.name || undefined,
      givenName: onlineResult.profile.givenName || undefined,
      familyName: onlineResult.profile.familyName || undefined,
      picture: onlineResult.profile.imageUrl || undefined,
    } : undefined,
  };
}

export async function signInWithGoogle(options?: GoogleSignInOptions): Promise<GoogleAuthResult | null> {
  try {
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      if (!config.googleWebClientId) {
        throw new Error('auth.googleClientNotConfigured');
      }

      try {
        return await signInWithGoogleNative(options);
      } catch (firstError) {
        if (isReauthError(firstError)) {
          try {
            await SocialLogin.logout({ provider: 'google' });
          } catch {
            // ignore logout errors
          }
          return await signInWithGoogleNative(options);
        }
        throw firstError;
      }
    } else {
      return await signInWithGoogleWeb(options);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '';
    const errorCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const errorString = (errorMessage + errorCode).toLowerCase();

    const isNativeSignInFailure = errorString.includes('google sign-in failed') ||
      errorString.includes('error retrieving access token') ||
      errorString.includes('failed to authorize') ||
      errorString.includes('failed to get access token') ||
      errorString.includes('timed out');

    if (isNativeSignInFailure) {
      throw error;
    }

    const canceledMessages = [
      'canceled',
      'cancelled',
      'user_cancelled',
      'user_cancel',
      'popup_closed',
      'dismissed',
      'user cancelled',
      'user dismissed',
      'googlenocredential',
    ];

    const isCancelled = canceledMessages.some(msg =>
      errorString.includes(msg.toLowerCase())
    );

    if (isCancelled) {
      return null;
    }
    throw error;
  }
}
