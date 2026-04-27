import crypto from 'crypto';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { verifyGoogleIdToken, type GoogleTokenPayload } from './googleAuth.service';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 60 seconds

interface StateEntry {
  codeVerifier: string;
  language: string;
  expiresAt: number;
}

interface OneTimeCodeEntry {
  googleToken: GoogleTokenPayload;
  language: string;
  expiresAt: number;
}

const stateStore = new Map<string, StateEntry>();
const codeStore = new Map<string, OneTimeCodeEntry>();

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of stateStore) {
    if (now >= entry.expiresAt) stateStore.delete(key);
  }
  for (const [key, entry] of codeStore) {
    if (now >= entry.expiresAt) codeStore.delete(key);
  }
}, CLEANUP_INTERVAL_MS);

function getRedirectUri(): string {
  return `${config.frontendUrl}/api/auth/google/callback`;
}

function getOAuth2Client(): OAuth2Client {
  if (!config.google.webClientId) {
    throw new ApiError(500, 'Google client ID not configured');
  }
  return new OAuth2Client(
    config.google.webClientId,
    config.google.clientSecret,
    getRedirectUri()
  );
}

export function generateGoogleAuthUrl(language: string): string {
  const state = crypto.randomBytes(32).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  stateStore.set(state, {
    codeVerifier,
    language,
    expiresAt: Date.now() + STATE_TTL_MS,
  });

  const client = getOAuth2Client();
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
  codeVerifier: string
): Promise<GoogleTokenPayload> {
  const client = getOAuth2Client();
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
  language: string
): string {
  const code = crypto.randomBytes(32).toString('hex');
  codeStore.set(code, {
    googleToken,
    language,
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
