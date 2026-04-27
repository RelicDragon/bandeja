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

interface GisPromptMomentNotification {
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
  isNotDisplayed?: () => boolean;
  getNotDisplayedReason?: () => string;
  getDismissedReason?: () => string;
}

const GSI_INIT_DONE_KEY = '__padelpulseGsiInitDone';
const GSI_INIT_CLIENT_ID_KEY = '__padelpulseGsiInitClientId';
const GSI_DISPATCH_KEY = '__padelpulseGsiDispatchCredential';
const GSI_AUTO_SELECT_OFF_KEY = '__padelpulseGsiAutoSelectOff';

let googleWebSignInInFlight: Promise<GoogleAuthResult | null> | null = null;
let abortCurrentWebGoogleSignIn: (() => void) | null = null;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleAccountsConfig) => void;
          prompt: (callback: (notification: unknown) => void) => void;
          disableAutoSelect: () => void;
          cancel?: () => void;
        };
      };
    };
    [GSI_INIT_DONE_KEY]?: boolean;
    [GSI_INIT_CLIENT_ID_KEY]?: string;
    [GSI_DISPATCH_KEY]?: (response: GoogleCredentialResponse) => void;
    [GSI_AUTO_SELECT_OFF_KEY]?: boolean;
  }
}

function signInWithGoogleWeb(): Promise<GoogleAuthResult | null> {
  abortCurrentWebGoogleSignIn?.();

  let abortThisAttempt: (() => void) | null = null;
  const webPromise = new Promise<GoogleAuthResult | null>((resolve, reject) => {
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

    const attemptAbort = () => {
      try {
        window.google?.accounts.id.cancel?.();
      } catch {
        /* ignore */
      }
      if (!settled) finishResolve(null);
    };
    abortThisAttempt = attemptAbort;
    abortCurrentWebGoogleSignIn = attemptAbort;

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
        window[GSI_DISPATCH_KEY] = (response: GoogleCredentialResponse) => {
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

        const googleAccountsId = window.google!.accounts.id;

        const clientId = config.googleWebClientId;
        const needsInit =
          !window[GSI_INIT_DONE_KEY] || window[GSI_INIT_CLIENT_ID_KEY] !== clientId;
        if (needsInit) {
          if (!window[GSI_AUTO_SELECT_OFF_KEY]) {
            try {
              window.google!.accounts.id.disableAutoSelect();
            } catch {
              /* ignore */
            }
            window[GSI_AUTO_SELECT_OFF_KEY] = true;
          }
          googleAccountsId.initialize({
            client_id: clientId,
            context: 'signin',
            callback: (response: GoogleCredentialResponse) => {
              window[GSI_DISPATCH_KEY]?.(response);
            },
            auto_select: false,
          });
          window[GSI_INIT_DONE_KEY] = true;
          window[GSI_INIT_CLIENT_ID_KEY] = clientId;
        }

        googleAccountsId.prompt(handlePromptMoment);
      } catch {
        finishReject(new Error('auth.googleSignInInitFailed'));
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', waitForGoogle, { once: true });
    } else {
      waitForGoogle();
    }
  });

  googleWebSignInInFlight = webPromise;
  void webPromise.finally(() => {
    if (abortCurrentWebGoogleSignIn === abortThisAttempt) {
      abortCurrentWebGoogleSignIn = null;
    }
    if (googleWebSignInInFlight === webPromise) {
      googleWebSignInInFlight = null;
    }
  });

  return webPromise;
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
