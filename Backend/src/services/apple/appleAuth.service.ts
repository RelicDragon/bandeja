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
  if (!header || !header.kid) {
    callback(new Error('Missing key ID in token header'));
    return;
  }

  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      if (err.message?.includes('timeout') || err.message?.includes('ECONNRESET') || err.message?.includes('ENOTFOUND')) {
        callback(new Error(`Network error fetching Apple signing key: ${err.message}. Please try again.`));
      } else {
        callback(new Error(`Failed to fetch Apple signing key: ${err.message}`));
      }
      return;
    }
    if (!key) {
      callback(new Error('Apple signing key not found for the provided key ID'));
      return;
    }
    try {
      const signingKey = key.getPublicKey();
      callback(null, signingKey);
    } catch (keyError: any) {
      callback(new Error(`Failed to extract public key: ${keyError.message}`));
    }
  });
}

export async function verifyAppleIdentityToken(
  identityToken: string,
  expectedNonce?: string
): Promise<AppleIdentityToken> {
  if (!identityToken || typeof identityToken !== 'string') {
    throw new ApiError(400, 'auth.invalidIdentityToken');
  }

  return new Promise((resolve, reject) => {
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
          reject(new ApiError(401, 'auth.appleTokenMalformed'));
          return;
        }

        const token = decoded as AppleIdentityToken;

        if (!token.sub || typeof token.sub !== 'string') {
          reject(new ApiError(401, 'auth.appleTokenInvalidSubject'));
          return;
        }

        if (!token.iss || token.iss !== 'https://appleid.apple.com') {
          reject(new ApiError(401, 'auth.appleTokenInvalidIssuer'));
          return;
        }

        if (!token.aud) {
          reject(new ApiError(401, 'auth.appleTokenMissingAudience'));
          return;
        }

        const expectedAudience = config.apple.clientId;
        const audience = Array.isArray(token.aud) ? token.aud : [token.aud];
        if (!audience.includes(expectedAudience)) {
          reject(new ApiError(401, 'auth.appleTokenInvalidAudience'));
          return;
        }

        if (!token.exp || typeof token.exp !== 'number') {
          reject(new ApiError(401, 'auth.appleTokenInvalidExpiration'));
          return;
        }

        if (!token.iat || typeof token.iat !== 'number') {
          reject(new ApiError(401, 'auth.appleTokenInvalidIssuedAt'));
          return;
        }

        if (expectedNonce) {
          if (!token.nonce) {
            reject(new ApiError(401, 'auth.appleTokenNonceMissing'));
            return;
          }
          const hashedNonce = createHash('sha256').update(expectedNonce).digest('hex');
          if (token.nonce !== hashedNonce) {
            reject(new ApiError(401, 'auth.appleTokenNonceMismatch'));
            return;
          }
        } else if (token.nonce) {
          reject(new ApiError(401, 'auth.appleTokenNonceRequired'));
          return;
        }

        if (token.email && typeof token.email === 'string') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(token.email)) {
            reject(new ApiError(401, 'auth.appleTokenInvalidEmailFormat'));
            return;
          }
        }

        resolve(token);
      }
    );
  });
}
