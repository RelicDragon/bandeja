import { createHmac } from 'node:crypto';
import { validateWebhook } from 'replicate';
import { getRedisClient, isRedisConfigured } from '../redis/redisClient';

export const WEBHOOK_TIMESTAMP_TOLERANCE_SEC = 5 * 60;

/** Local fallback when Redis is not configured (single-node). */
const seenWebhookIds = new Map<string, number>();
const MAX_SEEN_WEBHOOK_IDS = 10_000;
const REDIS_KEY_PREFIX = 'replicate:webhook:id:';

export type ReplicateWebhookHeaders = {
  id?: string;
  timestamp?: string;
  signature?: string;
};

function pruneSeenWebhookIds(nowMs: number): void {
  for (const [id, expiresAt] of seenWebhookIds) {
    if (expiresAt <= nowMs) seenWebhookIds.delete(id);
  }
  while (seenWebhookIds.size > MAX_SEEN_WEBHOOK_IDS) {
    const oldest = seenWebhookIds.keys().next().value;
    if (oldest === undefined) break;
    seenWebhookIds.delete(oldest);
  }
}

function consumeWebhookIdLocal(webhookId: string, nowMs: number): boolean {
  pruneSeenWebhookIds(nowMs);
  if (seenWebhookIds.has(webhookId)) return false;
  seenWebhookIds.set(webhookId, nowMs + WEBHOOK_TIMESTAMP_TOLERANCE_SEC * 1000);
  return true;
}

/**
 * Claim webhook-id once for the skew window.
 * Uses Redis SET NX EX when REDIS_URL is set (multi-node safe); otherwise in-process Map.
 * Returns true if this is the first claim.
 */
export async function consumeWebhookIdOnce(webhookId: string, nowMs = Date.now()): Promise<boolean> {
  if (isRedisConfigured()) {
    const redis = await getRedisClient();
    if (redis) {
      const key = `${REDIS_KEY_PREFIX}${webhookId}`;
      const result = await redis.set(key, '1', {
        NX: true,
        EX: WEBHOOK_TIMESTAMP_TOLERANCE_SEC,
      });
      return result === 'OK';
    }
  }
  return consumeWebhookIdLocal(webhookId, nowMs);
}

/** Release a claim so Replicate can retry after a processing failure. */
export async function releaseWebhookIdOnce(webhookId: string): Promise<void> {
  if (isRedisConfigured()) {
    const redis = await getRedisClient();
    if (redis) {
      await redis.del(`${REDIS_KEY_PREFIX}${webhookId}`);
      return;
    }
  }
  seenWebhookIds.delete(webhookId);
}

/** Test-only: clear local replay cache. */
export function clearWebhookIdReplayCacheForTest(): void {
  seenWebhookIds.clear();
}

/**
 * Verify Replicate webhook signature (HMAC-SHA256 / Svix-compatible).
 * Uses raw body string; rejects missing secret, bad/missing headers, stale timestamps.
 */
export async function verifyReplicateWebhookRequest(opts: {
  secret: string;
  rawBody: string;
  headers: ReplicateWebhookHeaders;
  nowSec?: number;
}): Promise<{ ok: true; webhookId: string } | { ok: false; reason: string }> {
  const secret = opts.secret.trim();
  if (!secret) {
    return { ok: false, reason: 'missing_secret' };
  }

  const id = opts.headers.id?.trim();
  const timestamp = opts.headers.timestamp?.trim();
  const signature = opts.headers.signature?.trim();
  if (!id || !timestamp || !signature) {
    return { ok: false, reason: 'missing_headers' };
  }

  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > WEBHOOK_TIMESTAMP_TOLERANCE_SEC) {
    return { ok: false, reason: 'timestamp_out_of_range' };
  }

  if (!opts.rawBody) {
    return { ok: false, reason: 'missing_body' };
  }

  try {
    const valid = await validateWebhook({
      id,
      timestamp,
      signature,
      body: opts.rawBody,
      secret,
    });
    if (!valid) {
      return { ok: false, reason: 'invalid_signature' };
    }
    return { ok: true, webhookId: id };
  } catch {
    return { ok: false, reason: 'invalid_signature' };
  }
}

/** Test helper: build a valid `v1,<base64>` signature for a body. */
export function signReplicateWebhookForTest(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${id}.${timestamp}.${body}`;
  const sig = createHmac('sha256', key).update(signedContent).digest('base64');
  return `v1,${sig}`;
}
