import { Sport } from '@prisma/client';
import crypto from 'crypto';
import { AdTargeting } from './ad.schemas';

export function normalizeUserLanguage(locale: string | undefined): string {
  if (!locale) return 'en';
  return locale.split('-')[0].toLowerCase();
}

export function matchesLanguageFilter(
  targeting: AdTargeting,
  userLocale: string | undefined
): boolean {
  const languages = targeting.languages;
  if (!languages || languages.length === 0) return true;
  const userLang = normalizeUserLanguage(userLocale);
  return languages.some((l) => normalizeUserLanguage(l) === userLang);
}

export function matchesLevelBand(
  targeting: AdTargeting,
  userLevel: number | undefined,
  sport?: Sport
): boolean {
  const bands = targeting.levelBands;
  if (!bands || bands.length === 0) return true;
  if (userLevel === undefined) return false;
  const applicable = bands.filter((b) => !b.sport || !sport || b.sport === sport);
  if (applicable.length === 0) return true;
  return applicable.some((b) => userLevel >= b.min && userLevel <= b.max);
}

export function passesRolloutPercent(
  userId: string,
  campaignId: string,
  rolloutPercent: number | undefined
): boolean {
  const pct = rolloutPercent ?? 100;
  if (pct >= 100) return true;
  if (pct <= 0) return false;
  const hash = crypto.createHash('sha256').update(`${userId}:${campaignId}:rollout`).digest();
  const bucket = hash.readUInt32BE(0) % 100;
  return bucket < pct;
}

export function isForceIncludedUser(targeting: AdTargeting, userId: string): boolean {
  const include = targeting.includeUserIds;
  return !!(include && include.length > 0 && include.includes(userId));
}

export function matchesIncludeExclude(
  targeting: AdTargeting,
  userId: string
): boolean {
  const exclude = targeting.excludeUserIds;
  if (exclude && exclude.length > 0 && exclude.includes(userId)) return false;

  const include = targeting.includeUserIds;
  if (include && include.length > 0 && !include.includes(userId)) return false;

  return true;
}

export function matchesExtendedTargeting(
  targeting: AdTargeting,
  opts: {
    userId: string;
    campaignId: string;
    userLocale?: string;
    userLevel?: number;
    sport?: Sport;
  }
): boolean {
  if (!matchesIncludeExclude(targeting, opts.userId)) return false;
  if (!matchesLanguageFilter(targeting, opts.userLocale)) return false;
  if (!matchesLevelBand(targeting, opts.userLevel, opts.sport)) return false;
  if (!passesRolloutPercent(opts.userId, opts.campaignId, targeting.rolloutPercent)) return false;
  return true;
}
