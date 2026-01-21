import { OAuth2Client } from 'google-auth-library';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';

let client: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  if (!config.google.webClientId) {
    throw new ApiError(500, 'Google client ID not configured');
  }
  if (!client) {
    client = new OAuth2Client(config.google.webClientId);
  }
  return client;
}

function getValidClientIds(): string[] {
  const clientIds: string[] = [];
  if (config.google.webClientId) {
    clientIds.push(config.google.webClientId);
  }
  if (config.google.iosClientId) {
    clientIds.push(config.google.iosClientId);
  }
  if (config.google.androidClientId) {
    clientIds.push(config.google.androidClientId);
  }
  return clientIds;
}

export interface GoogleTokenPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenPayload> {
  if (!idToken || typeof idToken !== 'string') {
    throw new ApiError(400, 'Google ID token is required');
  }

  try {
    const validClientIds = getValidClientIds();
    if (validClientIds.length === 0) {
      throw new ApiError(500, 'Google client IDs not configured');
    }

    const oauthClient = getClient();
    const ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: validClientIds,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new ApiError(401, 'Invalid Google token');
    }

    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new ApiError(401, 'Invalid Google token subject');
    }

    if (!payload.iss || !payload.iss.includes('accounts.google.com')) {
      throw new ApiError(401, 'Invalid Google token issuer');
    }

    if (!payload.aud) {
      throw new ApiError(401, 'Invalid Google token audience');
    }
    
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const isValidAudience = audience.some(aud => validClientIds.includes(aud));
    if (!isValidAudience) {
      throw new ApiError(401, 'Invalid Google token audience');
    }

    if (!payload.exp || typeof payload.exp !== 'number') {
      throw new ApiError(401, 'Invalid Google token expiration');
    }

    if (payload.email && typeof payload.email === 'string') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(payload.email)) {
        throw new ApiError(401, 'Invalid Google token email format');
      }
    }

    return payload as GoogleTokenPayload;
  } catch (error: any) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error.message?.includes('Token used too early')) {
      throw new ApiError(401, 'Google token not yet valid');
    }
    if (error.message?.includes('Token used too late')) {
      throw new ApiError(401, 'Google token expired');
    }
    throw new ApiError(401, 'Failed to verify Google token');
  }
}
