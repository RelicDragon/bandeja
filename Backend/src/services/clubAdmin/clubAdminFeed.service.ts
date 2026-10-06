import { ClubActivityAction, Prisma } from '@prisma/client';
import type {
  ClubActivityItem,
  ClubAdminPersonRef,
  ClubAdminReview,
  ClubAdminReviewsResponse,
  Paged,
} from '@bandeja/shared/clubAdmin/contract';
import prisma from '../../config/database';
import { clubAdminValidation, parseIntParam } from './clubAdminErrors';

/**
 * Club console feeds: `GET /activity` (audit trail) and `GET /reviews`. Both are keyset-paged by
 * `(createdAt, id)` descending with an opaque cursor.
 */

const ACTIONS = Object.values(ClubActivityAction) as string[];

interface FeedCursor {
  t: string;
  id: string;
}

function encodeCursor(c: FeedCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

function decodeCursor(raw: unknown): FeedCursor | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  try {
    const c = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8')) as Partial<FeedCursor>;
    if (typeof c.t === 'string' && typeof c.id === 'string' && !Number.isNaN(new Date(c.t).getTime())) return { t: c.t, id: c.id };
  } catch {
    // fall through
  }
  throw clubAdminValidation('cursor', 'is invalid');
}

function before(c: FeedCursor | undefined) {
  if (!c) return {};
  const t = new Date(c.t);
  return { OR: [{ createdAt: { lt: t } }, { createdAt: t, id: { lt: c.id } }] };
}

const NO_PERSON: ClubAdminPersonRef = { id: '', firstName: null, lastName: null, avatar: null };

function safeMeta(raw: Prisma.JsonValue): ClubActivityItem['meta'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ClubActivityItem['meta'] = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

export async function listClubActivity(clubId: string, query: Record<string, unknown>): Promise<Paged<ClubActivityItem>> {
  // `action` is one action or a comma-separated list (the console filters by action group).
  const actions = typeof query.action === 'string' ? [...new Set(query.action.split(',').map((a) => a.trim()).filter(Boolean))] : [];
  for (const a of actions) if (!ACTIONS.includes(a)) throw clubAdminValidation('action', `unknown action: ${a}`);
  const limit = parseIntParam(query.limit, 'limit', { fallback: 30, min: 1, max: 100 });
  const cursor = decodeCursor(query.cursor);
  const rows = await prisma.clubActivity.findMany({
    where: { AND: [{ clubId, ...(actions.length ? { action: { in: actions as ClubActivityAction[] } } : {}) }, before(cursor)] },
    include: { actor: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({
      id: r.id,
      action: r.action,
      actor: r.actor ? { id: r.actor.id, firstName: r.actor.firstName, lastName: r.actor.lastName, avatar: r.actor.avatar } : NO_PERSON,
      createdAt: r.createdAt.toISOString(),
      meta: safeMeta(r.meta),
    })),
    nextCursor: rows.length > limit && last ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id }) : null,
  };
}

function photoList(raw: Prisma.JsonValue): string[] {
  return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string') : [];
}

export async function listClubReviews(clubId: string, query: Record<string, unknown>): Promise<ClubAdminReviewsResponse> {
  const limit = parseIntParam(query.limit, 'limit', { fallback: 20, min: 1, max: 50 });
  const cursor = decodeCursor(query.cursor);
  const [rows, dist] = await Promise.all([
    prisma.clubReview.findMany({
      where: { AND: [{ clubId }, before(cursor)] },
      include: { reviewer: { select: { id: true, firstName: true, lastName: true, avatar: true, isActive: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    }),
    prisma.clubReview.groupBy({ by: ['stars'], where: { clubId }, _count: { _all: true } }),
  ]);
  const distribution: ClubAdminReviewsResponse['summary']['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let sum = 0;
  for (const d of dist) {
    count += d._count._all;
    sum += d.stars * d._count._all;
    if (d.stars >= 1 && d.stars <= 5) distribution[d.stars as 1 | 2 | 3 | 4 | 5] = d._count._all;
  }
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const items: ClubAdminReview[] = page.map((r) => ({
    id: r.id,
    stars: r.stars,
    text: r.text,
    photos: photoList(r.photos),
    createdAt: r.createdAt.toISOString(),
    // Public card only; a deactivated account shows no name or face.
    author: r.reviewer.isActive
      ? { id: r.reviewer.id, firstName: r.reviewer.firstName, lastName: r.reviewer.lastName, avatar: r.reviewer.avatar }
      : NO_PERSON,
    gameId: r.gameId,
  }));
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id }) : null,
    summary: { averageStars: count ? Math.round((sum / count) * 100) / 100 : null, count, distribution },
  };
}
