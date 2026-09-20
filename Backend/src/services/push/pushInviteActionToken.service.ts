import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { config } from '../../config/env';

const TOKEN_VERSION = 1 as const;
const TOKEN_AUDIENCE = `${config.jwtAudience}:push-invite-action`;
const MAX_TOKEN_LENGTH = 4096;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Scope kinds a signed push action token may carry (CONTRACT §5.2). */
export const PUSH_INVITE_ACTION_KINDS = [
  'game',
  'team',
  'series',
  'attendance',
  'weather',
] as const;
export type PushInviteActionKind = (typeof PUSH_INVITE_ACTION_KINDS)[number];

/** Actions a signed push action token may carry (CONTRACT §5.2). */
export const PUSH_INVITE_ACTION_ACTIONS = [
  'accept',
  'decline',
  'confirm',
  'unsure',
  'keep',
] as const;
export type PushInviteAction = (typeof PUSH_INVITE_ACTION_ACTIONS)[number];

/**
 * Which actions each kind accepts. Enforced on sign **and** verify so a token
 * can never reach a handler with an action that handler does not understand
 * (e.g. a `game` token carrying `keep` must not fall through to "decline").
 *
 * | kind | targetId | effect |
 * |---|---|---|
 * | `game` | gameParticipant invite id | accept / decline the game invite |
 * | `team` | user-team invite id | accept / decline the team invite |
 * | `series` | the **next occurrence's** gameId | accept seats PLAYING; decline records a no-op |
 * | `attendance` | gameId | sets `GameParticipant.attendance` |
 * | `weather` | gameId | sets `weatherAlertState.keepAsPlannedAt` |
 */
export const PUSH_INVITE_ACTION_ALLOWED_ACTIONS: Record<
  PushInviteActionKind,
  readonly PushInviteAction[]
> = {
  game: ['accept', 'decline'],
  team: ['accept', 'decline'],
  series: ['accept', 'decline'],
  attendance: ['confirm', 'unsure'],
  weather: ['keep'],
};

export type PushInviteActionScope = {
  userId: string;
  kind: PushInviteActionKind;
  targetId: string;
  action: PushInviteAction;
};

function isPushInviteActionKind(value: unknown): value is PushInviteActionKind {
  return (
    typeof value === 'string' &&
    (PUSH_INVITE_ACTION_KINDS as readonly string[]).includes(value)
  );
}

function isPushInviteAction(value: unknown): value is PushInviteAction {
  return (
    typeof value === 'string' &&
    (PUSH_INVITE_ACTION_ACTIONS as readonly string[]).includes(value)
  );
}

function isAllowedPair(kind: PushInviteActionKind, action: PushInviteAction): boolean {
  return PUSH_INVITE_ACTION_ALLOWED_ACTIONS[kind].includes(action);
}

export function signPushInviteActionToken(scope: PushInviteActionScope): string {
  if (!isAllowedPair(scope.kind, scope.action)) {
    throw new Error(`Unsupported push invite action: ${scope.kind}/${scope.action}`);
  }
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
    !isPushInviteActionKind(payload.kind) ||
    !isPushInviteAction(payload.action) ||
    !isAllowedPair(payload.kind, payload.action)
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
