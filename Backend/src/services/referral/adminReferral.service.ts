import prisma from '../../config/database';
import { formatReferralCode } from './referralCode';

/**
 * PRD 351 — admin referral reporting.
 *
 * One row per **referrer**, mirroring the link-to-app campaign table it sits
 * next to: invited / joined / played / rewarded, so a referrer reads like a
 * campaign. Date filters apply to the *invite* date (the referred account's
 * `createdAt`, or the attribution row's for an invite that never converted),
 * not to the payout date — otherwise a January invite that pays out in March
 * would vanish from January's numbers.
 */

export interface AdminReferralFilters {
  /** Inclusive ISO date or datetime. */
  startDate?: string;
  /** Inclusive ISO date or datetime; a bare date is widened to end-of-day. */
  endDate?: string;
  /** Free-text match on the referrer's name or code. */
  search?: string;
}

export interface AdminReferralRow {
  referrerUserId: string;
  referrerName: string;
  referralCode: string | null;
  /** Link opens that stored this referrer and never converted. */
  invited: number;
  /** Accounts created with this referrer attached. */
  joined: number;
  /** Of those, how many have a payout row (revoked or not). */
  played: number;
  /** Of those, how many are still paying (not revoked). */
  rewarded: number;
  /** Coins paid to this referrer, revoked rows excluded. */
  coinsPaid: number;
  lastJoinedAt: string | null;
}

export interface AdminReferralRewardRow {
  id: string;
  referrerUserId: string;
  referrerName: string;
  referredUserId: string;
  referredName: string;
  rewardedAt: string;
  revokedAt: string | null;
  referrerCoins: number | null;
  referredCoins: number | null;
}

export interface AdminReferralReport {
  totals: {
    invited: number;
    joined: number;
    played: number;
    rewarded: number;
    revoked: number;
    coinsPaid: number;
  };
  rows: AdminReferralRow[];
  recentRewards: AdminReferralRewardRow[];
}

const MAX_ROWS = 500;

function displayName(user: { firstName: string | null; lastName: string | null } | null): string {
  if (!user) return 'Unknown';
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return name.length > 0 ? name : 'Unknown';
}

/** `2026-03-01` → start of that day; a full datetime is used verbatim. */
function parseStart(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** A bare `2026-03-31` means "through the end of the 31st", not "at midnight". */
function parseEnd(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function dateFilter(filters: AdminReferralFilters): { gte?: Date; lte?: Date } | undefined {
  const gte = parseStart(filters.startDate);
  const lte = parseEnd(filters.endDate);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

export async function getAdminReferralReport(
  filters: AdminReferralFilters = {},
): Promise<AdminReferralReport> {
  const createdAt = dateFilter(filters);
  const search = filters.search?.trim();

  const referredUsers = await prisma.user.findMany({
    where: {
      referredByUserId: { not: null },
      ...(createdAt ? { createdAt } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      referredByUserId: true,
    },
  });

  const pendingInvites = await prisma.linkToAppAttribution.groupBy({
    by: ['referrerUserId'],
    where: {
      referrerUserId: { not: null },
      convertedUserId: null,
      ...(createdAt ? { createdAt } : {}),
    },
    _count: { _all: true },
  });

  const referrerIds = new Set<string>();
  for (const user of referredUsers) {
    if (user.referredByUserId) referrerIds.add(user.referredByUserId);
  }
  for (const row of pendingInvites) {
    if (row.referrerUserId) referrerIds.add(row.referrerUserId);
  }

  const [referrers, rewards] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...referrerIds] } },
      select: { id: true, firstName: true, lastName: true, referralCode: true },
    }),
    prisma.referralReward.findMany({
      where: { referredUserId: { in: referredUsers.map((user) => user.id) } },
      select: {
        id: true,
        referrerUserId: true,
        referredUserId: true,
        rewardedAt: true,
        revokedAt: true,
        referrerTx: { select: { total: true } },
        referredTx: { select: { total: true } },
      },
      orderBy: { rewardedAt: 'desc' },
    }),
  ]);

  const referrerById = new Map(referrers.map((user) => [user.id, user]));
  const userById = new Map(referredUsers.map((user) => [user.id, user]));

  const rowsByReferrer = new Map<string, AdminReferralRow>();
  const blankRow = (referrerUserId: string): AdminReferralRow => {
    const referrer = referrerById.get(referrerUserId) ?? null;
    return {
      referrerUserId,
      referrerName: displayName(referrer),
      referralCode: referrer?.referralCode ? formatReferralCode(referrer.referralCode) : null,
      invited: 0,
      joined: 0,
      played: 0,
      rewarded: 0,
      coinsPaid: 0,
      lastJoinedAt: null,
    };
  };
  const rowFor = (referrerUserId: string): AdminReferralRow => {
    const existing = rowsByReferrer.get(referrerUserId);
    if (existing) return existing;
    const created = blankRow(referrerUserId);
    rowsByReferrer.set(referrerUserId, created);
    return created;
  };

  for (const row of pendingInvites) {
    if (!row.referrerUserId) continue;
    rowFor(row.referrerUserId).invited += row._count._all;
  }

  for (const user of referredUsers) {
    if (!user.referredByUserId) continue;
    const row = rowFor(user.referredByUserId);
    row.joined += 1;
    const at = user.createdAt.toISOString();
    if (!row.lastJoinedAt || at > row.lastJoinedAt) row.lastJoinedAt = at;
  }

  for (const reward of rewards) {
    const row = rowFor(reward.referrerUserId);
    row.played += 1;
    if (!reward.revokedAt) {
      row.rewarded += 1;
      row.coinsPaid += reward.referrerTx?.total ?? 0;
    }
  }

  let rows = [...rowsByReferrer.values()];
  if (search) {
    const needle = search.toLowerCase();
    rows = rows.filter(
      (row) =>
        row.referrerName.toLowerCase().includes(needle) ||
        (row.referralCode ?? '').toLowerCase().includes(needle),
    );
  }
  rows.sort((a, b) => b.rewarded - a.rewarded || b.joined - a.joined || b.invited - a.invited);
  const visibleRows = rows.slice(0, MAX_ROWS);
  const visibleIds = new Set(visibleRows.map((row) => row.referrerUserId));

  const totals = visibleRows.reduce(
    (acc, row) => ({
      invited: acc.invited + row.invited,
      joined: acc.joined + row.joined,
      played: acc.played + row.played,
      rewarded: acc.rewarded + row.rewarded,
      revoked: acc.revoked,
      coinsPaid: acc.coinsPaid + row.coinsPaid,
    }),
    { invited: 0, joined: 0, played: 0, rewarded: 0, revoked: 0, coinsPaid: 0 },
  );
  totals.revoked = rewards.filter(
    (reward) => reward.revokedAt && visibleIds.has(reward.referrerUserId),
  ).length;

  const recentRewards: AdminReferralRewardRow[] = rewards
    .filter((reward) => visibleIds.has(reward.referrerUserId))
    .slice(0, 100)
    .map((reward) => ({
      id: reward.id,
      referrerUserId: reward.referrerUserId,
      referrerName: displayName(referrerById.get(reward.referrerUserId) ?? null),
      referredUserId: reward.referredUserId,
      referredName: displayName(userById.get(reward.referredUserId) ?? null),
      rewardedAt: reward.rewardedAt.toISOString(),
      revokedAt: reward.revokedAt ? reward.revokedAt.toISOString() : null,
      referrerCoins: reward.referrerTx?.total ?? null,
      referredCoins: reward.referredTx?.total ?? null,
    }));

  return { totals, rows: visibleRows, recentRewards };
}

/** RFC 4180 escaping, same rule as `services/admin/adExport.service.ts`. */
function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function getAdminReferralCsv(filters: AdminReferralFilters = {}): Promise<string> {
  const report = await getAdminReferralReport(filters);
  const header = [
    'referrerUserId',
    'referrerName',
    'referralCode',
    'invited',
    'joined',
    'played',
    'rewarded',
    'coinsPaid',
    'lastJoinedAt',
  ];
  const lines = [header.join(',')];
  for (const row of report.rows) {
    lines.push(
      [
        row.referrerUserId,
        row.referrerName,
        row.referralCode,
        row.invited,
        row.joined,
        row.played,
        row.rewarded,
        row.coinsPaid,
        row.lastJoinedAt,
      ]
        .map(escapeCsv)
        .join(','),
    );
  }
  return lines.join('\n');
}
