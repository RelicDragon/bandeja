import crypto from 'crypto';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { Sport } from '@prisma/client';
import { verifyGoogleIdToken, type GoogleTokenPayload } from './googleAuth.service';
import {
  parseRegistrationPrimarySport,
  registrationSportExplicitlyChosen,
} from '../auth/registrationSport.service';

const STATE_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

interface StateEntry {
  codeVerifier: string;
  language: string;
  primarySport: Sport;
  primarySportIsSet: boolean;
  redirectUri: string;
  expiresAt: number;
}

interface OneTimeCodeEntry {
  googleToken: GoogleTokenPayload;
  language: string;
  primarySport: Sport;
  primarySportIsSet: boolean;
  expiresAt: number;
}

const stateStore = new Map<string, StateEntry>();
const codeStore = new Map<string, OneTimeCodeEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of stateStore) {
    if (now >= entry.expiresAt) stateStore.delete(key);
  }
  for (const [key, entry] of codeStore) {
    if (now >= entry.expiresAt) codeStore.delete(key);
  }
}, CLEANUP_INTERVAL_MS);

const ALLOWED_REDIRECT_ORIGINS = new Set([
  'https://bandeja.me',
  'https://www.bandeja.me',
  'https://travel.bandeja.me',
  'http://localhost:3001',
  'http://localhost:3000',
  'http://localhost:5173',
]);

export function resolveRedirectUri(requested?: string): string {
  const fallback = `${config.frontendUrl}/api/auth/google/callback`;
  if (!requested) return fallback;
  try {
    const u = new URL(requested);
    const origin = u.origin;
    const pathname = u.pathname;
    if (!ALLOWED_REDIRECT_ORIGINS.has(origin)) return fallback;
    if (pathname !== '/api/auth/google/callback') return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

function getRedirectUri(custom?: string): string {
  return resolveRedirectUri(custom);
}

function getOAuth2Client(redirectUri?: string): OAuth2Client {
  if (!config.google.webClientId) {
    throw new ApiError(500, 'Google client ID not configured');
  }
  return new OAuth2Client(
    config.google.webClientId,
    config.google.clientSecret,
    getRedirectUri(redirectUri)
  );
}

export function generateGoogleAuthUrl(language: string, primarySportRaw?: unknown, redirectUriRaw?: string): string {
  const state = crypto.randomBytes(32).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  const primarySport = parseRegistrationPrimarySport(primarySportRaw);
  const primarySportIsSet = registrationSportExplicitlyChosen(primarySportRaw);

  const redirectUri = getRedirectUri(redirectUriRaw);
  stateStore.set(state, {
    codeVerifier,
    language,
    primarySport,
    primarySportIsSet,
    redirectUri,
    expiresAt: Date.now() + STATE_TTL_MS,
  });

  const client = getOAuth2Client(redirectUri);
  return client.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    prompt: 'select_account',
  });
}

export function consumeState(state: string): StateEntry {
  const entry = stateStore.get(state);
  if (!entry) {
    throw new ApiError(400, 'Invalid or expired OAuth state');
  }
  stateStore.delete(state);
  if (Date.now() >= entry.expiresAt) {
    throw new ApiError(400, 'OAuth state expired');
  }
  return entry;
}

export async function exchangeCodeForGoogleToken(
  code: string,
  codeVerifier: string,
  redirectUri?: string
): Promise<GoogleTokenPayload> {
  const client = getOAuth2Client(redirectUri);
  const { tokens } = await client.getToken({
    code,
    codeVerifier,
  });

  if (!tokens.id_token) {
    throw new ApiError(400, 'No ID token returned from Google');
  }

  return verifyGoogleIdToken(tokens.id_token);
}

export function storeOneTimeCode(
  googleToken: GoogleTokenPayload,
  language: string,
  primarySport: Sport,
  primarySportIsSet: boolean,
): string {
  const code = crypto.randomBytes(32).toString('hex');
  codeStore.set(code, {
    googleToken,
    language,
    primarySport,
    primarySportIsSet,
    expiresAt: Date.now() + CODE_TTL_MS,
  });
  return code;
}

export function consumeOneTimeCode(code: string): OneTimeCodeEntry {
  const entry = codeStore.get(code);
  if (!entry) {
    throw new ApiError(400, 'Invalid or expired code');
  }
  codeStore.delete(code);
  if (Date.now() >= entry.expiresAt) {
    throw new ApiError(400, 'Code expired');
  }
  return entry;
}
