import prisma from '../../config/database';
import { FrequencyCap, DEFAULT_FREQUENCY_CAP } from './ad.schemas';

export type AdUserStateRow = {
  impressions: number;
  capWindowStart: Date | null;
  snoozedUntil: Date | null;
};

export function parseFrequencyCap(raw: unknown): FrequencyCap {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object' && raw !== null && 'maxImpressions' in raw && 'windowDays' in raw) {
    const cap = raw as { maxImpressions: number; windowDays: number };
    return { maxImpressions: cap.maxImpressions, windowDays: cap.windowDays };
  }
  return DEFAULT_FREQUENCY_CAP;
}

export function isFrequencyCapExceeded(
  state: AdUserStateRow | null | undefined,
  cap: FrequencyCap,
  now = new Date()
): boolean {
  if (!cap) return false;
  if (!state) return false;

  const windowStart = state.capWindowStart ?? now;
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + cap.windowDays);

  if (now > windowEnd) return false;
  return state.impressions >= cap.maxImpressions;
}

export function isSnoozed(state: AdUserStateRow | null | undefined, now = new Date()): boolean {
  if (!state?.snoozedUntil) return false;
  return state.snoozedUntil > now;
}

export async function loadUserStates(
  userId: string,
  campaignIds: string[]
): Promise<Map<string, AdUserStateRow>> {
  if (campaignIds.length === 0) return new Map();

  const rows = await prisma.adUserState.findMany({
    where: { userId, campaignId: { in: campaignIds } },
    select: {
      campaignId: true,
      impressions: true,
      capWindowStart: true,
      snoozedUntil: true,
    },
  });

  return new Map(
    rows.map((r) => [
      r.campaignId,
      {
        impressions: r.impressions,
        capWindowStart: r.capWindowStart,
        snoozedUntil: r.snoozedUntil,
      },
    ])
  );
}

export async function recordImpression(userId: string, campaignId: string, cap: FrequencyCap) {
  const now = new Date();
  const existing = await prisma.adUserState.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
  });

  let impressions = 1;
  let capWindowStart = now;

  if (existing) {
    const effectiveCap = cap ?? DEFAULT_FREQUENCY_CAP;
    const windowExpired =
      !existing.capWindowStart ||
      now > new Date(existing.capWindowStart.getTime() + effectiveCap.windowDays * 86400000);

    if (windowExpired) {
      impressions = 1;
      capWindowStart = now;
    } else {
      impressions = existing.impressions + 1;
      capWindowStart = existing.capWindowStart ?? now;
    }
  }

  await prisma.adUserState.upsert({
    where: { userId_campaignId: { userId, campaignId } },
    create: {
      userId,
      campaignId,
      impressions,
      capWindowStart,
      lastSeenAt: now,
    },
    update: {
      impressions,
      capWindowStart,
      lastSeenAt: now,
    },
  });
}

export async function recordDismiss(
  userId: string,
  campaignId: string,
  dismissSnoozeDays: number | null | undefined
) {
  if (!dismissSnoozeDays || dismissSnoozeDays <= 0) return;

  const snoozedUntil = new Date();
  snoozedUntil.setDate(snoozedUntil.getDate() + dismissSnoozeDays);

  await prisma.adUserState.upsert({
    where: { userId_campaignId: { userId, campaignId } },
    create: {
      userId,
      campaignId,
      snoozedUntil,
      lastSeenAt: new Date(),
    },
    update: {
      snoozedUntil,
      lastSeenAt: new Date(),
    },
  });
}
