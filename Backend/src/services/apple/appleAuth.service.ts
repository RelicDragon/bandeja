import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { createHash } from 'crypto';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';

interface AppleIdentityToken {
  sub: string;
  email?: string;
  email_verified?: boolean;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
}

const client = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxAge: 86400000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

function getKey(header: any, callback: any) {
  console.log('[APPLE_VERIFY] getKey called', { hasHeader: !!header, kid: header?.kid });
  
  if (!header || !header.kid) {
    console.error('[APPLE_VERIFY] Missing key ID in token header');
    callback(new Error('Missing key ID in token header'));
    return;
  }

  console.log('[APPLE_VERIFY] Fetching signing key for kid:', header.kid);
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      console.error('[APPLE_VERIFY] Error fetching signing key:', err.message);
      if (err.message?.includes('timeout') || err.message?.includes('ECONNRESET') || err.message?.includes('ENOTFOUND')) {
        callback(new Error(`Network error fetching Apple signing key: ${err.message}. Please try again.`));
      } else {
        callback(new Error(`Failed to fetch Apple signing key: ${err.message}`));
      }
      return;
    }
    if (!key) {
      console.error('[APPLE_VERIFY] Signing key not found for kid:', header.kid);
      callback(new Error('Apple signing key not found for the provided key ID'));
      return;
    }
    try {
      const signingKey = key.getPublicKey();
      console.log('[APPLE_VERIFY] Signing key retrieved successfully');
      callback(null, signingKey);
    } catch (keyError: any) {
      console.error('[APPLE_VERIFY] Error extracting public key:', keyError.message);
      callback(new Error(`Failed to extract public key: ${keyError.message}`));
    }
  });
}

export async function verifyAppleIdentityToken(
  identityToken: string,
  expectedNonce?: string
): Promise<AppleIdentityToken> {
  console.log('[APPLE_VERIFY] verifyAppleIdentityToken called', { hasToken: !!identityToken, hasNonce: !!expectedNonce });
  
  if (!identityToken || typeof identityToken !== 'string') {
    console.error('[APPLE_VERIFY] Invalid identity token');
    throw new ApiError(400, 'auth.invalidIdentityToken');
  }

  return new Promise((resolve, reject) => {
    console.log('[APPLE_VERIFY] Verifying JWT token');
    jwt.verify(
      identityToken,
      getKey,
      {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: config.apple.clientId,
      },
      (err, decoded) => {
        if (err) {
          console.error('[APPLE_VERIFY] JWT verification failed:', err.name, err.message);
          if (err.name === 'JsonWebTokenError') {
            reject(new ApiError(401, 'auth.appleTokenInvalid'));
          } else if (err.name === 'TokenExpiredError') {
            reject(new ApiError(401, 'auth.appleTokenExpired'));
          } else if (err.name === 'NotBeforeError') {
            reject(new ApiError(401, 'auth.appleTokenNotYetValid'));
          } else {
            reject(new ApiError(401, 'auth.appleTokenInvalid'));
          }
          return;
        }

        if (!decoded || typeof decoded !== 'object') {
          console.error('[APPLE_VERIFY] Decoded token is not an object');
          reject(new ApiError(401, 'auth.appleTokenMalformed'));
          return;
        }

        const token = decoded as AppleIdentityToken;
        console.log('[APPLE_VERIFY] Token decoded successfully, full decoded payload:', {
          sub: token.sub,
          email: token.email || 'none',
          email_verified: token.email_verified || false,
          iss: token.iss,
          aud: token.aud,
          exp: token.exp,
          iat: token.iat,
          nonce: token.nonce ? token.nonce.substring(0, 16) + '...' : 'none',
        });
        console.log('[APPLE_VERIFY] Token decoded, validating fields');

        if (!token.sub || typeof token.sub !== 'string') {
          console.error('[APPLE_VERIFY] Missing or invalid sub');
          reject(new ApiError(401, 'auth.appleTokenInvalidSubject'));
          return;
        }

        if (!token.iss || token.iss !== 'https://appleid.apple.com') {
          console.error('[APPLE_VERIFY] Invalid issuer:', token.iss);
          reject(new ApiError(401, 'auth.appleTokenInvalidIssuer'));
          return;
        }

        if (!token.aud) {
          console.error('[APPLE_VERIFY] Missing audience');
          reject(new ApiError(401, 'auth.appleTokenMissingAudience'));
          return;
        }

        const expectedAudience = config.apple.clientId;
        const audience = Array.isArray(token.aud) ? token.aud : [token.aud];
        if (!audience.includes(expectedAudience)) {
          console.error('[APPLE_VERIFY] Invalid audience:', audience, 'expected:', expectedAudience);
          reject(new ApiError(401, 'auth.appleTokenInvalidAudience'));
          return;
        }

        if (!token.exp || typeof token.exp !== 'number') {
          console.error('[APPLE_VERIFY] Missing or invalid exp');
          reject(new ApiError(401, 'auth.appleTokenInvalidExpiration'));
          return;
        }

        if (!token.iat || typeof token.iat !== 'number') {
          console.error('[APPLE_VERIFY] Missing or invalid iat');
          reject(new ApiError(401, 'auth.appleTokenInvalidIssuedAt'));
          return;
        }

        if (expectedNonce) {
          if (!token.nonce) {
            console.error('[APPLE_VERIFY] Nonce expected but missing in token');
            reject(new ApiError(401, 'auth.appleTokenNonceMissing'));
            return;
          }
          const hashedNonce = createHash('sha256').update(expectedNonce).digest('hex');
          if (token.nonce !== hashedNonce) {
            console.error('[APPLE_VERIFY] Nonce mismatch');
            reject(new ApiError(401, 'auth.appleTokenNonceMismatch'));
            return;
          }
          console.log('[APPLE_VERIFY] Nonce verified');
        } else if (token.nonce) {
          console.error('[APPLE_VERIFY] Token contains nonce but none was provided');
          reject(new ApiError(401, 'auth.appleTokenNonceRequired'));
          return;
        }

        if (token.email && typeof token.email === 'string') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(token.email)) {
            console.error('[APPLE_VERIFY] Invalid email format:', token.email);
            reject(new ApiError(401, 'auth.appleTokenInvalidEmailFormat'));
            return;
          }
        }

        console.log('[APPLE_VERIFY] Token verification successful', { sub: token.sub.substring(0, 8) + '...', hasEmail: !!token.email });
        resolve(token);
      }
    );
  });
}
