/**
 * `slotRef`: the signed, opaque slot handle the model passes to the booking tools
 *. Minted by `find_available_slots`, verified by
 * `book_court` / `create_game_with_booking` (slice 7d) so the model can never book a club,
 * court, time or duration the server did not offer to **this** user in the last 15 minutes.
 *
 * Format: `s1.<base64url(JSON payload)>.<base64url(HMAC-SHA256)>`. The key is derived from
 * the server's JWT secret with a fixed label, so no new env var is needed and a slotRef can
 * never be confused with a JWT.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../../../config/env';
import { ApiError } from '../../../../utils/ApiError';
import type { AgentPrincipal } from '../../access/agentPrincipal';
import type { SlotProvider } from './providerRules';

export const SLOT_REF_TTL_MS = 15 * 60 * 1000;
const PREFIX = 's1';
const KEY_LABEL = 'padelpulse:agent-slot-ref:v1';

export type SlotRefPayload = {
  clubId: string;
  courtIds: string[];
  /** ISO instant. */
  start: string;
  durationMinutes: number;
  provider: SlotProvider;
  userId: string;
};

type WirePayload = { c: string; k: string[]; s: string; d: number; p: SlotProvider; u: string; x: number };

let cachedKey: { secret: string; key: Buffer } | null = null;

function signingKey(secret: string = config.jwtSecret): Buffer {
  if (!secret) throw new Error('slotRef signing secret is not configured');
  if (cachedKey?.secret !== secret) {
    cachedKey = { secret, key: createHmac('sha256', secret).update(KEY_LABEL).digest() };
  }
  return cachedKey.key;
}

function sign(body: string, secret?: string): string {
  return createHmac('sha256', signingKey(secret)).update(`${PREFIX}.${body}`).digest('base64url');
}

export function mintSlotRef(payload: SlotRefPayload, options: { now?: Date; secret?: string } = {}): string {
  const now = options.now ?? new Date();
  const wire: WirePayload = {
    c: payload.clubId,
    k: payload.courtIds,
    s: payload.start,
    d: payload.durationMinutes,
    p: payload.provider,
    u: payload.userId,
    x: now.getTime() + SLOT_REF_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(wire), 'utf8').toString('base64url');
  return `${PREFIX}.${body}.${sign(body, options.secret)}`;
}

const invalid = () => new ApiError(400, 'agent.slotRefInvalid');

function isWirePayload(raw: unknown): raw is WirePayload {
  if (!raw || typeof raw !== 'object') return false;
  const row = raw as Record<string, unknown>;
  return (
    typeof row.c === 'string' &&
    Array.isArray(row.k) &&
    row.k.length > 0 &&
    row.k.every((id) => typeof id === 'string') &&
    typeof row.s === 'string' &&
    Number.isFinite(new Date(row.s).getTime()) &&
    typeof row.d === 'number' &&
    Number.isInteger(row.d) &&
    row.d > 0 &&
    typeof row.p === 'string' &&
    typeof row.u === 'string' &&
    typeof row.x === 'number'
  );
}

/**
 * The slot the server offered to `principal`. Tampered, malformed or foreign refs are
 * `400 agent.slotRefInvalid` (a foreign ref is indistinguishable from a forged one);
 * refs older than 15 minutes are `400 agent.slotRefExpired`.
 */
export function verifySlotRef(
  principal: Pick<AgentPrincipal, 'userId'>,
  slotRef: string,
  options: { now?: Date; secret?: string } = {},
): SlotRefPayload {
  if (typeof slotRef !== 'string' || slotRef.length > 2048) throw invalid();
  const parts = slotRef.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) throw invalid();
  const [, body, signature] = parts;
  const expected = Buffer.from(sign(body, options.secret), 'utf8');
  const given = Buffer.from(signature, 'utf8');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw invalid();

  let wire: unknown;
  try {
    wire = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (!isWirePayload(wire)) throw invalid();
  if (wire.u !== principal.userId) throw invalid();
  if ((options.now ?? new Date()).getTime() >= wire.x) throw new ApiError(400, 'agent.slotRefExpired');
  return {
    clubId: wire.c,
    courtIds: [...wire.k],
    start: wire.s,
    durationMinutes: wire.d,
    provider: wire.p,
    userId: wire.u,
  };
}
