import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { config } from '../../config/env';

const TOKEN_VERSION = 1 as const;
const TOKEN_AUDIENCE = `${config.jwtAudience}:push-invite-action`;
const MAX_TOKEN_LENGTH = 4096;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type PushInviteActionScope = {
  userId: string;
  kind: 'game' | 'team';
  targetId: string;
  action: 'accept' | 'decline';
};

export function signPushInviteActionToken(scope: PushInviteActionScope): string {
  return jwt.sign(
    {
      ...scope,
      typ: 'push_invite_action',
      ver: TOKEN_VERSION,
      jti: randomUUID(),
      iss: config.jwtIssuer,
      aud: TOKEN_AUDIENCE,
    },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: '48h' }
  );
}

export function verifyPushInviteActionToken(token: string): PushInviteActionScope {
  if (!token || token.length > MAX_TOKEN_LENGTH) throw new Error('Invalid push invite action token');
  const payload = jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'],
    issuer: config.jwtIssuer,
    audience: TOKEN_AUDIENCE,
    clockTolerance: 45,
  }) as jwt.JwtPayload & Partial<PushInviteActionScope> & { typ?: unknown; ver?: unknown };
  if (payload.typ !== 'push_invite_action' || payload.ver !== TOKEN_VERSION) {
    throw new Error('Invalid push invite action token type');
  }
  if (
    typeof payload.userId !== 'string' ||
    typeof payload.targetId !== 'string' ||
    !ID_PATTERN.test(payload.userId) ||
    !ID_PATTERN.test(payload.targetId) ||
    (payload.kind !== 'game' && payload.kind !== 'team') ||
    (payload.action !== 'accept' && payload.action !== 'decline')
  ) {
    throw new Error('Invalid push invite action token payload');
  }
  return {
    userId: payload.userId,
    kind: payload.kind,
    targetId: payload.targetId,
    action: payload.action,
  };
}
