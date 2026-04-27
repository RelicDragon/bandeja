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
}

interface GoogleButtonConfig {
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  type?: 'standard' | 'icon';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  width?: number;
}

interface GisPromptMomentNotification {
  isDisplayMoment?: () => boolean;
  isDisplayed?: () => boolean;
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
  getNotDisplayedReason?: () => string;
  getSkippedReason?: () => string;
  getDismissedReason?: () => string;
}

let googleWebSignInInFlight: Promise<GoogleAuthResult | null> | null = null;
let googleIdentityInitialized = false;
let activeGoogleCredentialHandler: ((response: GoogleCredentialResponse) => void) | null = null;
const GOOGLE_IDENTITY_GLOBAL_INIT_KEY = '__padelpulseGoogleIdentityInitialized';
const GOOGLE_IDENTITY_SDK_INIT_KEY = '__padelpulseGoogleIdentityInitialized';

type GoogleAccountsIdApi = NonNullable<Window['google']>['accounts']['id'] & {
  [GOOGLE_IDENTITY_SDK_INIT_KEY]?: boolean;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleAccountsConfig) => void;
          prompt: (callback: (notification: unknown) => void) => void;
          renderButton: (element: HTMLElement, config: GoogleButtonConfig) => void;
          disableAutoSelect: () => void;
          cancel?: () => void;
        };
      };
    };
    [GOOGLE_IDENTITY_GLOBAL_INIT_KEY]?: boolean;
  }
}

async function signInWithGoogleWeb(): Promise<GoogleAuthResult | null> {
  if (googleWebSignInInFlight) {
    return googleWebSignInInFlight;
  }

  googleWebSignInInFlight = new Promise<GoogleAuthResult | null>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('auth.googleSignInUnavailable'));
      return;
    }

    if (!config.googleWebClientId) {
      reject(new Error('auth.googleClientNotConfigured'));
      return;
    }

    let settled = false;

    const finishResolve = (value: GoogleAuthResult | null) => {
      if (settled) return;
      settled = true;
      if (value === null) {
        try {
          window.google?.accounts.id.cancel?.();
        } catch {
          /* ignore */
        }
      }
      resolve(value);
    };

    const finishReject = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    const handlePromptMoment = (notification: unknown) => {
      if (settled) return;
      const n = notification as GisPromptMomentNotification;

      if (typeof n.isDismissedMoment === 'function' && n.isDismissedMoment()) {
        const reason = n.getDismissedReason?.();
        if (reason === 'credential_returned' || reason === 'flow_restarted') {
          return;
        }
        finishResolve(null);
        return;
      }

      if (typeof n.isSkippedMoment === 'function' && n.isSkippedMoment()) {
        finishResolve(null);
        return;
      }

      if (typeof n.isNotDisplayed === 'function' && n.isNotDisplayed()) {
        const reason = n.getNotDisplayedReason?.() ?? '';
        if (reason === 'invalid_client' || reason === 'unregistered_origin') {
          finishReject(new Error('auth.googleSignInInitFailed'));
          return;
        }
        if (reason === 'missing_client_id') {
          finishReject(new Error('auth.googleClientNotConfigured'));
          return;
        }
        if (reason === 'secure_http_required') {
          finishReject(new Error('auth.googleSignInUnavailable'));
          return;
        }
        finishResolve(null);
      }
    };

    const MAX_WAIT_TIME = 10000; // 10 seconds
    const startTime = Date.now();

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

    const decodeJWT = (token: string): GoogleJWTPayload | null => {
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

    const initializeGoogle = () => {
      try {
        try {
          window.google!.accounts.id.cancel?.();
        } catch {
          /* ignore */
        }

        try {
          window.google!.accounts.id.disableAutoSelect();
        } catch {
          /* ignore */
        }

        activeGoogleCredentialHandler = (response: GoogleCredentialResponse) => {
          if (settled) return;
          if (!response.credential) {
            finishResolve(null);
            return;
          }

          const idToken = response.credential;
          const decoded = decodeJWT(idToken);

          finishResolve({
            idToken,
            profile: decoded ? {
              email: decoded.email,
              name: decoded.name,
              givenName: decoded.given_name,
              familyName: decoded.family_name,
              picture: decoded.picture,
            } : undefined,
          });
        };

        const googleAccountsId = window.google!.accounts.id as GoogleAccountsIdApi;
        const isGoogleInitialized =
          googleIdentityInitialized ||
          window[GOOGLE_IDENTITY_GLOBAL_INIT_KEY] === true ||
          googleAccountsId[GOOGLE_IDENTITY_SDK_INIT_KEY] === true;
        if (!isGoogleInitialized) {
          googleAccountsId.initialize({
            client_id: config.googleWebClientId,
            context: 'signin',
            callback: (response: GoogleCredentialResponse) => {
              activeGoogleCredentialHandler?.(response);
            },
            auto_select: false,
          });
          googleIdentityInitialized = true;
          window[GOOGLE_IDENTITY_GLOBAL_INIT_KEY] = true;
          googleAccountsId[GOOGLE_IDENTITY_SDK_INIT_KEY] = true;
        }

        window.google!.accounts.id.prompt(handlePromptMoment);
      } catch {
        finishReject(new Error('auth.googleSignInInitFailed'));
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', waitForGoogle, { once: true });
    } else {
      waitForGoogle();
    }
  }).finally(() => {
    googleWebSignInInFlight = null;
    activeGoogleCredentialHandler = null;
  });

  return googleWebSignInInFlight!;
}

function isReauthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  const s = (msg + ' ' + code).toLowerCase();
  return s.includes('reauth') || s.includes('[16]') || s.includes('account reauth failed');
}

async function signInWithGoogleNative(): Promise<GoogleAuthResult | null> {
  const LOGIN_TIMEOUT_MS = 60_000;
  const platform = Capacitor.getPlatform();

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

export async function signInWithGoogle(): Promise<GoogleAuthResult | null> {
  try {
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      if (!config.googleWebClientId) {
        throw new Error('auth.googleClientNotConfigured');
      }

      try {
        return await signInWithGoogleNative();
      } catch (firstError) {
        if (isReauthError(firstError)) {
          try {
            await SocialLogin.logout({ provider: 'google' });
          } catch {
            // ignore logout errors
          }
          return await signInWithGoogleNative();
        }
        throw firstError;
      }
    } else {
      return await signInWithGoogleWeb();
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
