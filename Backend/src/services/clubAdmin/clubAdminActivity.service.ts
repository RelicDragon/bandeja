import { ClubActivityAction, Prisma } from '@prisma/client';
import prisma from '../../config/database';

export type ClubActivityMeta = Record<string, string | number | boolean | null>;

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Club console audit trail: one row per mutation. `meta` holds short, render-safe values only
 * (names, instants, counts) — never contact data or free text longer than a label.
 * Logging never fails the mutation it describes.
 */
export async function logClubActivity(
  clubId: string,
  actorId: string | null,
  action: ClubActivityAction,
  meta: ClubActivityMeta = {},
  db: Db = prisma
): Promise<void> {
  try {
    await db.clubActivity.create({ data: { clubId, actorId, action, meta } });
  } catch (err) {
    console.error('[clubAdmin] activity log failed', action, err);
  }
}
