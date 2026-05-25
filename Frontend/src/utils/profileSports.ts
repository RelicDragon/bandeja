import { Sports, DEFAULT_SPORT, type Sport } from '@shared/sport';
import type { BasicUser, User, UserSportProfile } from '@/types';
import { getImplementedSports, getSportConfig } from '@/sport/sportRegistry';

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

export function listEnabledSports(user: User | null | undefined): Sport[] {
  const raw = user?.sportsEnabled;
  const enabled =
    raw === undefined || raw === null ? ([Sports.PADEL] as Sport[]) : [...raw];
  return enabled.filter((s) => getSportConfig(s).implemented);
}

export function isSportEnabled(user: User | null | undefined, sport: Sport): boolean {
  return listEnabledSports(user).includes(sport);
}

export function hasEnabledSports(user: User | null | undefined): boolean {
  return listEnabledSports(user).length > 0;
}

/** Create-game default: court infer (caller) → lastCreatedSport → active primary → sportsEnabled[0]. */
export function resolveCreateGameDefaultSport(user: User | null | undefined): Sport {
  const enabled = listEnabledSports(user);
  if (user?.lastCreatedSport && enabled.includes(user.lastCreatedSport)) {
    return user.lastCreatedSport;
  }
  const activePrimary = resolveActivePrimarySport(user);
  if (activePrimary) return activePrimary;
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
  const profile = findSportProfile(user, sport);
  return profile?.gamesPlayed ?? (sport === Sports.PADEL ? (user.gamesPlayed ?? 0) : 0);
}

/** Show competitive level for a sport after first rated game or a non-default estimate (> 1.0). */
export function shouldShowSportLevelBadge(user: User, sport: Sport): boolean {
  if (gamesPlayedForSport(user, sport) > 0) return true;
  return getDisplayLevelForSport(user, sport) > 1.0;
}

export function getDisplayLevelForSport(user: User | BasicUser, sport: Sport): number {
  const profile = findSportProfile(user, sport);
  if (profile) return profile.level;
  if (usesProjectedLevelFields(user)) {
    return user.level;
  }
  if (sport === Sports.PADEL || sport === getUserPrimarySport(user)) {
    return user.level;
  }
  return 1.0;
}

export function getReliabilityForSport(user: User | BasicUser, sport: Sport): number {
  const profile = findSportProfile(user, sport);
  if (profile) return profile.reliability;
  if (usesProjectedLevelFields(user)) {
    return user.reliability ?? 0;
  }
  return sport === Sports.PADEL ? (user.reliability ?? 0) : 0;
}

/** Training edit modal defaults when no outcome row exists yet. */
export function resolveTrainingEditDefaults(
  user: User,
  sport: Sport,
  outcome?: { levelBefore: number; reliabilityBefore: number } | null,
): { level: number; reliability: number } {
  if (outcome) {
    return { level: outcome.levelBefore, reliability: outcome.reliabilityBefore };
  }
  return {
    level: getDisplayLevelForSport(user, sport),
    reliability: getReliabilityForSport(user, sport),
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
  return user.level;
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
