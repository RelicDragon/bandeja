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
}

interface GoogleButtonConfig {
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  type?: 'standard' | 'icon';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  width?: number;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleAccountsConfig) => void;
          prompt: (callback: (notification: unknown) => void) => void;
          renderButton: (element: HTMLElement, config: GoogleButtonConfig) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

async function signInWithGoogleWeb(): Promise<GoogleAuthResult> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Window is not available'));
      return;
    }

    if (!config.googleWebClientId) {
      reject(new Error('Google Web Client ID not configured'));
      return;
    }

    const MAX_WAIT_TIME = 10000; // 10 seconds
    const startTime = Date.now();

    const waitForGoogle = () => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        initializeGoogle();
      } else {
        const elapsed = Date.now() - startTime;
        if (elapsed >= MAX_WAIT_TIME) {
          reject(new Error('Google Identity Services failed to load. Please refresh the page.'));
          return;
        }
        setTimeout(waitForGoogle, 100);
      }
    };

    let buttonContainer: HTMLElement | null = null;

    const cleanup = () => {
      if (buttonContainer && buttonContainer.parentNode) {
        buttonContainer.parentNode.removeChild(buttonContainer);
        buttonContainer = null;
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
        window.google!.accounts.id.initialize({
          client_id: config.googleWebClientId,
          callback: (response: GoogleCredentialResponse) => {
            cleanup();
            
            if (!response.credential) {
              reject(new Error('No credential received from Google'));
              return;
            }

            const idToken = response.credential;
            const decoded = decodeJWT(idToken);
            
            resolve({
              idToken,
              profile: decoded ? {
                email: decoded.email,
                name: decoded.name,
                givenName: decoded.given_name,
                familyName: decoded.family_name,
                picture: decoded.picture,
              } : undefined,
            });
          },
          auto_select: false,
        });

        buttonContainer = document.createElement('div');
        buttonContainer.id = 'google-signin-button-temp';
        buttonContainer.style.position = 'fixed';
        buttonContainer.style.top = '-9999px';
        buttonContainer.style.left = '-9999px';
        document.body.appendChild(buttonContainer);

        window.google!.accounts.id.renderButton(buttonContainer, {
          theme: 'outline',
          size: 'large',
          type: 'standard',
          text: 'signin_with',
          width: 300,
        });

        setTimeout(() => {
          const button = buttonContainer?.querySelector('div[role="button"]') as HTMLElement;
          if (button) {
            button.click();
          } else {
            cleanup();
            reject(new Error('Failed to initialize Google sign in button'));
          }
        }, 100);
      } catch (error: unknown) {
        cleanup();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        reject(new Error(`Failed to initialize Google sign in: ${errorMessage}`));
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', waitForGoogle);
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

async function signInWithGoogleNative(): Promise<GoogleAuthResult | null> {
  const response = await SocialLogin.login({
    provider: 'google',
    options: {
      scopes: ['email', 'profile'],
      forceRefreshToken: false,
      forcePrompt: false,
    },
  });

  const result: GoogleLoginResponse = response.result;

  if (result.responseType === 'offline') {
    return {
      idToken: '',
      serverAuthCode: result.serverAuthCode,
    };
  }

  const onlineResult: GoogleLoginResponseOnline = result;

  if (!onlineResult.idToken) {
    throw new Error('No ID token received from Google');
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
        throw new Error('Google Web Client ID not configured');
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

    const canceledMessages = [
      'canceled',
      'cancelled',
      'user_cancelled',
      'user_cancel',
      'popup_closed',
      'dismissed',
      'user cancelled',
      'user dismissed',
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
