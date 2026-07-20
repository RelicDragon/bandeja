import { Sports, DEFAULT_SPORT, type Sport } from '@shared/sport';
import type { BasicUser, User, UserSportProfile } from '@/types';
import { isSportCreatable } from '@/config/multisportFlags';
import { getImplementedSports, getSportConfig } from '@/sport/sportRegistry';
import { sportHasQuestionnaire } from '@/sport/sportQuestionnaireRegistry';

export function getUserPrimarySport(user: User | BasicUser | null | undefined): Sport {
  return user?.primarySport ?? DEFAULT_SPORT;
}

/** Primary among enabled sports; falls back to first enabled when stored primary is disabled. */
export function resolveActivePrimarySport(user: User | null | undefined): Sport | null {
  const enabled = listEnabledSports(user);
  if (enabled.length === 0) return null;
  const stored = getUserPrimarySport(user);
  return enabled.includes(stored) ? stored : enabled[0]!;
}

export function listEnabledSports(user: User | BasicUser | null | undefined): Sport[] {
  const raw = user?.sportsEnabled;
  const enabled =
    raw === undefined || raw === null ? ([Sports.PADEL] as Sport[]) : [...raw];
  return enabled.filter((s) => getSportConfig(s).implemented && isSportCreatable(s));
}

export function isSportEnabled(user: User | BasicUser | null | undefined, sport: Sport): boolean {
  return listEnabledSports(user).includes(sport);
}

export function hasEnabledSports(user: User | null | undefined): boolean {
  return listEnabledSports(user).length > 0;
}

export function getViewerPrimarySport(user: User | null | undefined): Sport {
  return resolveActivePrimarySport(user) ?? getUserPrimarySport(user);
}

/** Create-game default: active primary → lastCreatedSport → sportsEnabled[0]. */
export function resolveCreateGameDefaultSport(user: User | null | undefined): Sport {
  const enabled = listEnabledSports(user);
  const activePrimary = resolveActivePrimarySport(user);
  if (activePrimary) return activePrimary;
  if (user?.lastCreatedSport && enabled.includes(user.lastCreatedSport)) {
    return user.lastCreatedSport;
  }
  return enabled[0] ?? getUserPrimarySport(user);
}

export function hasMultipleSportsEnabled(user: User | null | undefined): boolean {
  return listEnabledSports(user).length > 1;
}

export function findSportProfile(
  user: User | BasicUser | null | undefined,
  sport: Sport,
): UserSportProfile | undefined {
  return user?.sportProfiles?.find((p) => p.sport === sport);
}

function isFullUserRecord(user: User | BasicUser): user is User {
  return 'gamesPlayed' in user && typeof (user as User).gamesPlayed === 'number';
}

/** Sport-projected snippet: BasicUser, or full User after API stripped sportProfiles (undefined). */
function usesProjectedLevelFields(user: User | BasicUser): boolean {
  if (!isFullUserRecord(user)) return true;
  return user.sportProfiles === undefined;
}

export function gamesPlayedForSport(user: User, sport: Sport): number {
  return findSportProfile(user, sport)?.gamesPlayed ?? 0;
}

/** Show competitive level for a sport after first rated game or a non-default estimate (> 1.0). */
export function shouldShowSportLevelBadge(user: User, sport: Sport): boolean {
  if (gamesPlayedForSport(user, sport) > 0) return true;
  return getDisplayLevelForSport(user, sport) > 1.0;
}

function normalizeLevel(value: unknown, fallback = 1.0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function getDisplayLevelForSport(user: User | BasicUser, sport: Sport): number {
  const profile = findSportProfile(user, sport);
  if (profile) return normalizeLevel(profile.level);
  if (usesProjectedLevelFields(user)) {
    return normalizeLevel(user.level);
  }
  return 1.0;
}

/** When `sportsEnabled` is known, false means show "-" instead of a placeholder 1.0 for that sport. */
export function isSportLevelAvailableForDisplay(
  user: User | BasicUser | null | undefined,
  sport: Sport,
): boolean {
  if (!user) return false;
  if (user.sportsEnabled === undefined || user.sportsEnabled === null) return true;
  return isSportEnabled(user, sport);
}

export function formatSportLevelBadgeDisplay(
  user: User | BasicUser | null | undefined,
  sport: Sport,
  decimals = 1,
): string {
  if (!user || !isSportLevelAvailableForDisplay(user, sport)) return '-';
  const level = getDisplayLevelForSport(user, sport);
  return Number.isFinite(level) ? level.toFixed(decimals) : '-';
}

export function getReliabilityForSport(user: User | BasicUser, sport: Sport): number {
  const profile = findSportProfile(user, sport);
  if (profile) return profile.reliability;
  if (usesProjectedLevelFields(user)) {
    return user.reliability ?? 0;
  }
  return 0;
}

/** Sport Level Confirmation for the sport shown on a badge/avatar (APP_FUNCTIONALITY §2.2). */
export function isLevelConfirmedForSport(user: User | BasicUser, sport: Sport): boolean {
  const profile = findSportProfile(user, sport);
  if (profile && typeof profile.approvedLevel === 'boolean') {
    return profile.approvedLevel;
  }
  // Projected payloads already sport-scoped top-level approvedLevel.
  if (usesProjectedLevelFields(user)) return Boolean(user.approvedLevel);
  // Profiles present but confirmation omitted (older/slim payloads): PADEL mirror only.
  if (sport === DEFAULT_SPORT) return Boolean(user.approvedLevel);
  return false;
}

export function getSportLevelApprovedWhen(
  user: User | BasicUser,
  sport: Sport,
): Date | string | null | undefined {
  const profile = findSportProfile(user, sport);
  if (profile && typeof profile.approvedLevel === 'boolean') {
    return profile.approvedWhen ?? null;
  }
  if (usesProjectedLevelFields(user) && 'approvedWhen' in user) {
    return (user as User).approvedWhen ?? null;
  }
  if (sport === DEFAULT_SPORT && 'approvedWhen' in user) {
    return (user as User).approvedWhen ?? null;
  }
  return null;
}

/** Initial reliability in training edit modal when prior value was below this (not a minimum). */
export const TRAINING_RELIABILITY_DEFAULT = 50;

export function getTrainingDefaultReliability(reliability: number): number {
  return reliability < TRAINING_RELIABILITY_DEFAULT ? TRAINING_RELIABILITY_DEFAULT : reliability;
}

/** Training edit modal defaults when no outcome row exists yet. */
export function resolveTrainingEditDefaults(
  user: User,
  sport: Sport,
  outcome?: { levelBefore: number; reliabilityBefore: number } | null,
): { level: number; reliability: number } {
  const rawReliability = outcome
    ? outcome.reliabilityBefore
    : getReliabilityForSport(user, sport);
  const level = outcome ? outcome.levelBefore : getDisplayLevelForSport(user, sport);
  return {
    level,
    reliability: getTrainingDefaultReliability(rawReliability),
  };
}

/** Find-games / calendar user filter: level band for a game sport. */
export function userLevelMatchesGameBand(
  user: User,
  gameSport: Sport,
  minLevel: number | undefined,
  maxLevel: number | undefined,
): boolean {
  const userLevel = getDisplayLevelForSport(user, gameSport);
  const min = minLevel ?? 0;
  const max = maxLevel ?? 10;
  return userLevel >= min && userLevel <= max;
}

/** Level for profile header when user may have zero enabled sports. */
export function resolveProfileHeaderLevel(user: User | null | undefined): number {
  if (!user) return 1;
  const activePrimary = resolveActivePrimarySport(user);
  if (activePrimary) return getDisplayLevelForSport(user, activePrimary);
  return getDisplayLevelForSport(user, getUserPrimarySport(user));
}

export function listSelectableSports(): Sport[] {
  return getImplementedSports();
}

/** Sports the user can pick in create flows (all implemented when none enabled in profile). */
export function listCreateFlowSports(user: User | null | undefined): Sport[] {
  const enabled = listEnabledSports(user);
  return enabled.length > 0 ? enabled : listSelectableSports();
}

export function canEditSportLevel(profile: UserSportProfile | undefined): boolean {
  return !!profile && profile.gamesPlayed === 0;
}

export function canDisableSport(user: User, sport: Sport): boolean {
  if (!isSportEnabled(user, sport)) return false;
  return listEnabledSports(user).length > 1;
}

/** After re-adding a sport — only prompt when API says so and profile has no Q/history. */
export function shouldSuggestAddSportQuestionnaire(
  user: User,
  sport: Sport,
  apiSuggested: boolean,
): boolean {
  if (!sportHasQuestionnaire(sport) || !apiSuggested) return false;
  const profile = findSportProfile(user, sport);
  if (profile?.questionnaireCompletedAt || profile?.questionnaireSkippedAt) return false;
  if (gamesPlayedForSport(user, sport) > 0) return false;
  return true;
}
