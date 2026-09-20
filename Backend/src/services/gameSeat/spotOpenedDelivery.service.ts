import { SpotOpenedKind } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import prisma from '../../config/database';

/**
 * PRD 347 — persisted, restart-safe dedupe for spot-opened notifications.
 *
 * `docs/product/constraints.md` ("Play-intent notifications") requires delivery
 * to be persisted per event + user + channel, revalidated before send and
 * deduplicated by that key. `SpotOpenedDelivery`'s
 * `@@unique([userId, gameId, dayKey, kind])` is that key: one notification per
 * user, per game, per local day, per audience kind.
 *
 * Deliberately **not** an in-memory `Set`. The reminder scheduler uses one and
 * loses its dedupe on every restart; that is a known wart, not a pattern.
 */
export interface SpotOpenedDeliveryKey {
  userId: string;
  gameId: string;
  /** `YYYY-MM-DD` in the game city's timezone. */
  dayKey: string;
  kind: SpotOpenedKind;
}

const UNIQUE_VIOLATION = 'P2002';

/**
 * `YYYY-MM-DD` in the game city's timezone — the `SpotOpenedDelivery` day key.
 *
 * Lives next to the claim rather than in `gameSeat.service.ts` because the
 * play-intent matcher claims the same key (see
 * {@link claimSpotOpenedDelivery}) and the two must not drift.
 */
export function spotOpenedDayKey(timezone: string | null | undefined, now: Date): string {
  try {
    return formatInTimeZone(now, timezone || 'UTC', 'yyyy-MM-dd');
  } catch {
    return formatInTimeZone(now, 'UTC', 'yyyy-MM-dd');
  }
}

/**
 * Reserves the right to notify this user today.
 *
 * Returns `false` when a row already exists, which is the whole point: two
 * players leaving the same game within a minute must not produce two pushes.
 *
 * PRD 347 — this is also the **cross-path** dedupe. A freed seat fires both
 * `GameSeatService.seatOpened` and `PlayIntentMatchService.onPublicGameSlotsOpened`,
 * whose `INTENT` audience comes from the very same `intentMatchesGame`
 * predicate. Both now claim `kind: INTENT` on this unique index before they
 * dispatch, so exactly one of them wins and the user gets one notification.
 */
export async function claimSpotOpenedDelivery(
  key: SpotOpenedDeliveryKey,
): Promise<boolean> {
  try {
    await prisma.spotOpenedDelivery.create({ data: key });
    return true;
  } catch (error) {
    if ((error as { code?: string })?.code === UNIQUE_VIOLATION) return false;
    throw error;
  }
}

/**
 * Gives the claim back after a **transient** failure so the next seat-opened
 * event can try again. A permanent failure (no push token, user blocked the
 * bot) keeps the row — retrying that is pure noise.
 */
export async function releaseSpotOpenedDelivery(
  key: SpotOpenedDeliveryKey,
): Promise<void> {
  await prisma.spotOpenedDelivery
    .deleteMany({ where: key })
    .catch((error) =>
      console.warn('[spotOpened] failed to release delivery claim', { key, error }),
    );
}

export {
  SPOT_OPENED_RETRY_DELAYS_MS,
  sendWithBackoff,
  type SendAttemptResult,
} from './spotOpenedRetry';
